import { useCallback, useEffect, useRef, useState } from 'react'
import { transcriber, type LoadProgress } from '@renderer/lib/voice/transcriber'

/* Whisper wants mono PCM at 16 kHz. */
const SAMPLE_RATE = 16_000
/* RMS above this counts as speech; below it, silence. Tuned for a mic with auto gain on. */
const SPEECH_RMS = 0.02
/* Silence this long after speech ends the take. */
const TRAILING_SILENCE_MS = 1100
/* Give up if nobody says anything. */
const NO_SPEECH_MS = 5000
/* A search query never needs longer than this. */
const MAX_TAKE_MS = 12_000
/* How long an outcome message stays before the footer goes back to its hints. */
const MESSAGE_MS = 2600
/* The model is fetched in the background this long after launch, once startup has settled,
   so the first voice search does not wait on a download. */
const PREFETCH_DELAY_MS = 6000

export type VoiceStatus = 'idle' | 'listening' | 'loading' | 'transcribing' | 'message'

export interface VoiceSearch {
  status: VoiceStatus
  /** The live microphone stream while listening, for the glow. */
  stream: MediaStream | null
  /** Model download progress in bytes while status is 'loading'. Null before any byte. */
  progress: LoadProgress | null
  /** Outcome text while status is 'message'. */
  message: string | null
  /** Idle → listen. Listening → finish the take and transcribe. Otherwise no-op. */
  toggle: () => void
  /** Stop everything and go quiet, discarding any audio. */
  cancel: () => void
}

interface Take {
  stream: MediaStream
  recorder: MediaRecorder
  chunks: Blob[]
  ctx: AudioContext
  analyser: AnalyserNode
  meter: number
  spoke: boolean
  lastSpeechAt: number
  startedAt: number
  cancelled: boolean
}

function messageFor(err: unknown): string {
  const name = err instanceof DOMException ? err.name : ''
  if (name === 'NotAllowedError' || name === 'SecurityError')
    return 'Microphone access is off. Allow it in your system settings.'
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'No microphone found.'
  if (name === 'NotReadableError') return 'Another app is using the microphone.'
  return 'Voice search is unavailable right now.'
}

export function useVoiceSearch(onTranscript: (text: string) => void): VoiceSearch {
  const [status, setStatus] = useState<VoiceStatus>('idle')
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [progress, setProgress] = useState<LoadProgress | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const take = useRef<Take | null>(null)
  const messageTimer = useRef<number | null>(null)
  const onTranscriptRef = useRef(onTranscript)
  useEffect(() => {
    onTranscriptRef.current = onTranscript
  }, [onTranscript])

  const teardown = useCallback((t: Take): void => {
    if (t.recorder.state !== 'inactive') t.recorder.stop()
    for (const track of t.stream.getTracks()) track.stop()
    void t.ctx.close()
    setStream(null)
  }, [])

  const showMessage = useCallback((text: string): void => {
    setMessage(text)
    setStatus('message')
    if (messageTimer.current) window.clearTimeout(messageTimer.current)
    messageTimer.current = window.setTimeout(() => {
      setStatus('idle')
      setMessage(null)
    }, MESSAGE_MS)
  }, [])

  const cancel = useCallback((): void => {
    const t = take.current
    if (t) {
      t.cancelled = true
      take.current = null
      teardown(t)
    }
    if (messageTimer.current) window.clearTimeout(messageTimer.current)
    setStatus('idle')
    setMessage(null)
  }, [teardown])

  const finish = useCallback(async (): Promise<void> => {
    const t = take.current
    if (!t) return
    take.current = null

    const stopped = new Promise<void>((resolve) => {
      t.recorder.addEventListener('stop', () => resolve(), { once: true })
    })
    teardown(t)
    await stopped

    if (t.cancelled) return
    if (!t.spoke) {
      showMessage("Didn't catch that. Try again.")
      return
    }

    setStatus(transcriber.ready ? 'transcribing' : 'loading')
    try {
      const audio = await decode(new Blob(t.chunks, { type: t.recorder.mimeType }))
      const text = await transcriber.transcribe(audio)
      if (t.cancelled) return
      setStatus('idle')
      if (text) onTranscriptRef.current(text)
      else showMessage("Didn't catch that. Try again.")
    } catch {
      if (!t.cancelled) showMessage('Voice search is unavailable right now.')
    }
  }, [teardown, showMessage])

  const listen = useCallback(async (): Promise<void> => {
    // The model download and the microphone prompt can overlap.
    transcriber.warm()

    let media: MediaStream
    try {
      media = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      })
    } catch (err) {
      showMessage(messageFor(err))
      return
    }

    const ctx = new AudioContext()
    const analyser = ctx.createAnalyser()
    analyser.fftSize = 1024
    ctx.createMediaStreamSource(media).connect(analyser)

    const recorder = new MediaRecorder(media)
    const t: Take = {
      stream: media,
      recorder,
      chunks: [],
      ctx,
      analyser,
      meter: 0,
      spoke: false,
      lastSpeechAt: 0,
      startedAt: performance.now(),
      cancelled: false
    }
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) t.chunks.push(e.data)
    }
    recorder.start(250)
    take.current = t
    setStream(media)
    setStatus('listening')

    const buf = new Float32Array(analyser.fftSize)
    const tick = (): void => {
      if (take.current !== t) return
      analyser.getFloatTimeDomainData(buf)
      let sum = 0
      for (let i = 0; i < buf.length; i++) sum += buf[i]! * buf[i]!
      const rms = Math.sqrt(sum / buf.length)
      const now = performance.now()
      if (rms > SPEECH_RMS) {
        t.spoke = true
        t.lastSpeechAt = now
      }
      const elapsed = now - t.startedAt
      const quietFor = now - t.lastSpeechAt
      if (
        elapsed > MAX_TAKE_MS ||
        (t.spoke && quietFor > TRAILING_SILENCE_MS) ||
        (!t.spoke && elapsed > NO_SPEECH_MS)
      ) {
        void finish()
        return
      }
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  }, [finish, showMessage])

  const toggle = useCallback((): void => {
    if (status === 'listening') void finish()
    else if (status === 'idle' || status === 'message') void listen()
  }, [status, finish, listen])

  useEffect(() => transcriber.onProgress(setProgress), [])

  // Leaving the popover mid-take drops the microphone.
  useEffect(() => () => cancel(), [cancel])

  useEffect(() => {
    const id = window.setTimeout(() => transcriber.warm(), PREFETCH_DELAY_MS)
    return () => window.clearTimeout(id)
  }, [])

  return { status, stream, progress, message, toggle, cancel }
}

async function decode(blob: Blob): Promise<Float32Array> {
  const bytes = await blob.arrayBuffer()
  // An offline context at the target rate resamples on decode, so no second pass.
  const ctx = new OfflineAudioContext(1, 1, SAMPLE_RATE)
  const audio = await ctx.decodeAudioData(bytes)
  return audio.getChannelData(0)
}
