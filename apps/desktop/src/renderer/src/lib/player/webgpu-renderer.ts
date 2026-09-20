/// <reference types="@webgpu/types" />

import type { Anime4KPipeline } from 'anime4k-webgpu'
import type { Anime4kPreset } from './anime4k'

// Full-screen triangle sampling a WebCodecs VideoFrame as an external texture.
// rgba16float canvas + extended tone mapping preserves HDR10 (proven in spike.tsx / ADR-0007).
const WGSL = /* wgsl */ `
@group(0) @binding(0) var samp: sampler;
@group(0) @binding(1) var tex: texture_external;

struct VOut { @builtin(position) pos: vec4f, @location(0) uv: vec2f };

@vertex fn vs(@builtin(vertex_index) i: u32) -> VOut {
  var p = array<vec2f,3>(vec2f(-1.0,-1.0), vec2f(3.0,-1.0), vec2f(-1.0,3.0));
  var uv = array<vec2f,3>(vec2f(0.0,1.0), vec2f(2.0,1.0), vec2f(0.0,-1.0));
  var o: VOut;
  o.pos = vec4f(p[i], 0.0, 1.0);
  o.uv = uv[i];
  return o;
}

@fragment fn fs(in: VOut) -> @location(0) vec4f {
  return textureSampleBaseClampToEdge(tex, samp, in.uv);
}
`

// Same triangle, but sampling a regular texture — the Anime4K chain's output.
const BLIT_WGSL = /* wgsl */ `
@group(0) @binding(0) var samp: sampler;
@group(0) @binding(1) var tex: texture_2d<f32>;

struct VOut { @builtin(position) pos: vec4f, @location(0) uv: vec2f };

@vertex fn vs(@builtin(vertex_index) i: u32) -> VOut {
  var p = array<vec2f,3>(vec2f(-1.0,-1.0), vec2f(3.0,-1.0), vec2f(-1.0,3.0));
  var uv = array<vec2f,3>(vec2f(0.0,1.0), vec2f(2.0,1.0), vec2f(0.0,-1.0));
  var o: VOut;
  o.pos = vec4f(p[i], 0.0, 1.0);
  o.uv = uv[i];
  return o;
}

@fragment fn fs(in: VOut) -> @location(0) vec4f {
  return textureSample(tex, samp, in.uv);
}
`

/**
 * What can be drawn. The custom engine hands over decoded WebCodecs frames; the web player has
 * a plain <video> feeding hls.js through MSE. WebGPU takes either as an external image, so the
 * upscaling path is the same for both.
 */
export type RenderSource = VideoFrame | HTMLVideoElement

function sourceSize(source: RenderSource): { width: number; height: number } {
  return source instanceof HTMLVideoElement
    ? { width: source.videoWidth, height: source.videoHeight }
    : {
        width: source.displayWidth || source.codedWidth,
        height: source.displayHeight || source.codedHeight
      }
}

interface Anime4kChain {
  key: string
  pipelines: Anime4KPipeline[]
  input: GPUTexture
  bind: GPUBindGroup
}

export class WebGPURenderer {
  private device: GPUDevice | null = null
  private ctx: GPUCanvasContext | null = null
  private pipeline: GPURenderPipeline | null = null
  private blitPipeline: GPURenderPipeline | null = null
  private sampler: GPUSampler | null = null

  private a4kPreset: Anime4kPreset | null = null
  private a4kChain: Anime4kChain | null = null
  private a4kBuilding: string | null = null

  /** Fires when the chain can't be built or run; the controller suspends upscaling. */
  onAnime4kError: (() => void) | null = null
  /** Fires when an async chain build lands, so a paused player can repaint upscaled. */
  onAnime4kReady: (() => void) | null = null

  async init(canvas: HTMLCanvasElement): Promise<void> {
    if (!navigator.gpu) throw new Error('WebGPU unavailable (navigator.gpu missing)')
    const adapter = await navigator.gpu.requestAdapter()
    if (!adapter) throw new Error('no WebGPU adapter')
    this.device = await adapter.requestDevice()
    const ctx = canvas.getContext('webgpu')
    if (!ctx) throw new Error('no webgpu canvas context')
    this.ctx = ctx

    const format = 'rgba16float' as GPUTextureFormat
    // toneMapping + colorSpace not yet in lib.dom WebGPU types — cast.
    ctx.configure({
      device: this.device,
      format,
      alphaMode: 'opaque',
      colorSpace: 'display-p3',
      toneMapping: { mode: 'extended' }
    } as unknown as GPUCanvasConfiguration)

    const module = this.device.createShaderModule({ code: WGSL })
    this.pipeline = this.device.createRenderPipeline({
      layout: 'auto',
      vertex: { module, entryPoint: 'vs' },
      fragment: { module, entryPoint: 'fs', targets: [{ format }] },
      primitive: { topology: 'triangle-list' }
    })
    const blitModule = this.device.createShaderModule({ code: BLIT_WGSL })
    this.blitPipeline = this.device.createRenderPipeline({
      layout: 'auto',
      vertex: { module: blitModule, entryPoint: 'vs' },
      fragment: { module: blitModule, entryPoint: 'fs', targets: [{ format }] },
      primitive: { topology: 'triangle-list' }
    })
    this.sampler = this.device.createSampler({ magFilter: 'linear', minFilter: 'linear' })
  }

  setAnime4k(preset: Anime4kPreset | null): void {
    this.a4kPreset = preset
    if (!preset) this.dropAnime4kChain()
  }

  render(source: RenderSource): void {
    if (this.a4kPreset && this.renderAnime4k(source, this.a4kPreset)) return
    const { device, ctx, pipeline, sampler } = this
    if (!device || !ctx || !pipeline || !sampler) return
    const ext = device.importExternalTexture({ source })
    const bind = device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: sampler },
        { binding: 1, resource: ext }
      ]
    })
    const encoder = device.createCommandEncoder()
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: ctx.getCurrentTexture().createView(),
          clearValue: { r: 0, g: 0, b: 0, a: 1 },
          loadOp: 'clear',
          storeOp: 'store'
        }
      ]
    })
    pass.setPipeline(pipeline)
    pass.setBindGroup(0, bind)
    pass.draw(3)
    pass.end()
    device.queue.submit([encoder.finish()])
  }

  /** Returns false when the chain isn't ready yet — the caller falls back to passthrough. */
  private renderAnime4k(source: RenderSource, preset: Anime4kPreset): boolean {
    const { device, ctx, blitPipeline, sampler } = this
    if (!device || !ctx || !blitPipeline || !sampler) return false
    const { width: w, height: h } = sourceSize(source)
    if (w <= 0 || h <= 0) return false
    const key = `${w}x${h}:${preset}`
    const chain = this.a4kChain
    if (!chain || chain.key !== key) {
      this.ensureAnime4kChain(key, w, h, preset)
      return false
    }
    try {
      device.queue.copyExternalImageToTexture(
        { source },
        // 'srgb' keeps the copied values identical to what the passthrough external-texture
        // path produces, so toggling Anime4K never shifts color.
        { texture: chain.input, colorSpace: 'srgb' },
        [w, h]
      )
      const encoder = device.createCommandEncoder()
      for (const p of chain.pipelines) p.pass(encoder)
      const pass = encoder.beginRenderPass({
        colorAttachments: [
          {
            view: ctx.getCurrentTexture().createView(),
            clearValue: { r: 0, g: 0, b: 0, a: 1 },
            loadOp: 'clear',
            storeOp: 'store'
          }
        ]
      })
      pass.setPipeline(blitPipeline)
      pass.setBindGroup(0, chain.bind)
      pass.draw(3)
      pass.end()
      device.queue.submit([encoder.finish()])
      return true
    } catch (e) {
      console.warn('[anime4k] render failed, falling back to passthrough', e)
      this.a4kPreset = null
      this.dropAnime4kChain()
      this.onAnime4kError?.()
      return false
    }
  }

  private ensureAnime4kChain(key: string, w: number, h: number, preset: Anime4kPreset): void {
    if (this.a4kBuilding === key) return
    this.a4kBuilding = key
    void import('./anime4k-chain')
      .then(({ buildAnime4kChain }) => {
        const { device, blitPipeline, sampler } = this
        if (!device || !blitPipeline || !sampler) return
        // A seek to a different source or a preset change may have obsoleted this build.
        if (this.a4kBuilding !== key || this.a4kPreset !== preset) return
        const input = device.createTexture({
          size: [w, h],
          format: 'rgba16float',
          usage:
            GPUTextureUsage.TEXTURE_BINDING |
            GPUTextureUsage.COPY_DST |
            GPUTextureUsage.RENDER_ATTACHMENT
        })
        const pipelines = buildAnime4kChain(device, input, preset)
        const output = pipelines[pipelines.length - 1].getOutputTexture()
        const bind = device.createBindGroup({
          layout: blitPipeline.getBindGroupLayout(0),
          entries: [
            { binding: 0, resource: sampler },
            { binding: 1, resource: output.createView() }
          ]
        })
        this.a4kChain?.input.destroy()
        this.a4kChain = { key, pipelines, input, bind }
        this.a4kBuilding = null
        this.onAnime4kReady?.()
      })
      .catch((e) => {
        console.warn('[anime4k] chain build failed', e)
        this.a4kPreset = null
        this.dropAnime4kChain()
        this.onAnime4kError?.()
      })
  }

  private dropAnime4kChain(): void {
    this.a4kChain?.input.destroy()
    this.a4kChain = null
    this.a4kBuilding = null
  }

  destroy(): void {
    this.dropAnime4kChain()
    this.device?.destroy()
    this.device = null
    this.ctx = null
    this.pipeline = null
    this.blitPipeline = null
    this.sampler = null
  }
}
