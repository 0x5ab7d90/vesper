import {
  ANIME4K_DEFAULT_PRESET,
  capPreset,
  sameAnime4kStatus,
  stepDownPreset,
  type Anime4kPref,
  type Anime4kPreset,
  type Anime4kStatus
} from './anime4k'
import { WebGPURenderer } from './webgpu-renderer'

/*
 * Anime4K for the web player (ADR-0015 applies the shader chain; this is the <video> side).
 *
 * The custom engine owns its frames and paints them itself, so upscaling drops into its render
 * loop. Web sources play through hls.js into a plain <video>, which draws itself — so here the
 * element keeps running for audio and playback state while a WebGPU canvas over the top does the
 * drawing. Web streams are the lower-quality source of the two, which is exactly why they are
 * worth upscaling.
 */

/** Below this on-screen magnification there is nothing to gain; matches the engine's rule. */
const MIN_SCALE = 1.2
/** Settle time after a change before its cost is judged. */
const GRACE_MS = 4000
const WINDOW_TICKS = 4
const MIN_DROPS = 10
const DROP_RATIO = 0.15
const SAMPLE_MS = 1000

type Sample = { dropped: number; total: number }

/**
 * Drives a WebGPU canvas from a playing <video>. Call `attach` once the element exists, then
 * `setPref` whenever the viewer changes their mind; `onStatus` reports what is actually running,
 * which is not always what was asked for.
 */
export class VideoAnime4k {
  private renderer: WebGPURenderer | null = null
  private video: HTMLVideoElement | null = null
  private canvas: HTMLCanvasElement | null = null
  private pref: Anime4kPref = { enabled: false, preset: ANIME4K_DEFAULT_PRESET }
  private status: Anime4kStatus = { kind: 'off' }
  private ceiling: Anime4kPreset | 'off' | null = null
  private changedAt = 0
  private frameHandle: number | null = null
  private sampleTimer: ReturnType<typeof setInterval> | null = null
  private window: Sample[] = []
  private prevDropped = 0
  private prevTotal = 0
  private destroyed = false

  /** Fires whenever the effective status changes, including bypasses and step-downs. */
  onStatus: ((status: Anime4kStatus) => void) | null = null

  async attach(video: HTMLVideoElement, canvas: HTMLCanvasElement): Promise<void> {
    this.video = video
    this.canvas = canvas
    const renderer = new WebGPURenderer()
    try {
      await renderer.init(canvas)
    } catch (e) {
      console.warn('[anime4k] WebGPU unavailable, staying on the video element', e)
      this.apply({ kind: 'off' })
      return
    }
    if (this.destroyed) {
      renderer.destroy()
      return
    }
    renderer.onAnime4kError = (): void => {
      this.ceiling = 'off'
      this.apply({ kind: 'suspended' })
    }
    this.renderer = renderer
    window.addEventListener('resize', this.onResize)
    this.evaluate()
  }

  setPref(pref: Anime4kPref): void {
    this.pref = pref
    // A fresh choice deserves a fresh chance: an earlier step-down should not cap it forever.
    this.ceiling = null
    this.evaluate()
  }

  destroy(): void {
    this.destroyed = true
    window.removeEventListener('resize', this.onResize)
    this.stopLoop()
    this.renderer?.destroy()
    this.renderer = null
    this.video = null
    this.canvas = null
  }

  private readonly onResize = (): void => this.evaluate()

  private evaluate(): void {
    this.apply(this.compute())
  }

  private compute(): Anime4kStatus {
    const video = this.video
    if (!video || !this.renderer || !this.pref.enabled) return { kind: 'off' }
    const w = video.videoWidth
    const h = video.videoHeight
    // Nothing decoded yet; the metadata handler will come back around.
    if (w <= 0 || h <= 0) return { kind: 'off' }
    if (!this.upscaleVisible(w, h)) return { kind: 'bypassed', reason: 'resolution' }
    if (this.ceiling === 'off') return { kind: 'suspended' }
    const preset = this.ceiling ? capPreset(this.pref.preset, this.ceiling) : this.pref.preset
    return { kind: 'active', preset }
  }

  private upscaleVisible(srcW: number, srcH: number): boolean {
    const canvas = this.canvas
    if (!canvas) return false
    const dpr = window.devicePixelRatio || 1
    const cw = canvas.clientWidth * dpr
    const ch = canvas.clientHeight * dpr
    if (cw <= 0 || ch <= 0) return true
    const scale = Math.min(cw / srcW, ch / srcH)
    return scale > MIN_SCALE
  }

  private apply(status: Anime4kStatus): void {
    if (sameAnime4kStatus(this.status, status)) return
    this.status = status
    this.changedAt = performance.now()
    this.window = []

    const active = status.kind === 'active'
    this.renderer?.setAnime4k(active ? status.preset : null)

    const video = this.video
    const canvas = this.canvas
    if (video && canvas && video.videoWidth > 0) {
      // The chain doubles the source, so the backing store has to as well — otherwise the
      // upscaled texture is squeezed straight back down before it reaches the screen.
      const w = active ? video.videoWidth * 2 : video.videoWidth
      const h = active ? video.videoHeight * 2 : video.videoHeight
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w
        canvas.height = h
      }
    }

    if (active) {
      // requestVideoFrameCallback only fires when a new frame is presented, so a paused player
      // would sit on a blank canvas with the element hidden behind it. Paint the current frame
      // once, then let the loop take over.
      if (video && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
        this.renderer?.render(video)
      }
      this.startLoop()
    } else {
      this.stopLoop()
    }
    this.onStatus?.(status)
  }

  /** True while the canvas is the thing being watched, so the caller can hide the element. */
  get painting(): boolean {
    return this.status.kind === 'active'
  }

  private startLoop(): void {
    const video = this.video
    if (!video || this.frameHandle !== null) return
    const draw = (): void => {
      this.frameHandle = video.requestVideoFrameCallback(() => {
        this.frameHandle = null
        if (this.status.kind !== 'active') return
        this.renderer?.render(video)
        draw()
      })
    }
    draw()
    this.sampleTimer ??= setInterval(() => this.monitorLoad(), SAMPLE_MS)
  }

  private stopLoop(): void {
    const video = this.video
    if (this.frameHandle !== null && video) video.cancelVideoFrameCallback(this.frameHandle)
    this.frameHandle = null
    if (this.sampleTimer !== null) {
      clearInterval(this.sampleTimer)
      this.sampleTimer = null
    }
  }

  /**
   * Steps the preset down, and eventually off, when the upscale is costing frames. The element
   * counts them for us; nobody would rather have Quality and a stutter.
   */
  private monitorLoad(): void {
    const video = this.video
    if (!video || this.status.kind !== 'active') return
    const q = video.getVideoPlaybackQuality?.()
    if (!q) return
    const dropped = q.droppedVideoFrames - this.prevDropped
    const total = q.totalVideoFrames - this.prevTotal
    this.prevDropped = q.droppedVideoFrames
    this.prevTotal = q.totalVideoFrames
    if (performance.now() - this.changedAt < GRACE_MS) return

    this.window.push({ dropped, total })
    if (this.window.length > WINDOW_TICKS) this.window.shift()
    if (this.window.length < WINDOW_TICKS) return

    let droppedSum = 0
    let totalSum = 0
    for (const s of this.window) {
      droppedSum += s.dropped
      totalSum += s.total
    }
    if (totalSum === 0 || droppedSum < MIN_DROPS || droppedSum / totalSum < DROP_RATIO) return

    const next = stepDownPreset(this.status.preset)
    this.ceiling = next ?? 'off'
    this.apply(next ? { kind: 'active', preset: next } : { kind: 'suspended' })
  }
}
