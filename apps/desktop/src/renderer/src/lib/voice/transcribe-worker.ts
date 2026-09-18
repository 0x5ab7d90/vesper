/// <reference lib="webworker" />
/*
 * Whisper runs here, off the main thread, through transformers.js. The first call
 * downloads the model into the browser cache; every call after that loads it from
 * disk. The ONNX runtime's wasm is bundled with the app rather than pulled from a
 * CDN, so the renderer's CSP stays closed and the feature works offline once the
 * model is cached.
 */
import {
  env,
  pipeline,
  type AutomaticSpeechRecognitionPipeline,
  type ProgressInfo
} from '@huggingface/transformers'
import ortWasmUrl from '@ort/ort-wasm-simd-threaded.asyncify.wasm?url'
// The loader arrives as source text (see ortLoader in electron.vite.config.ts) and
// runs from a blob URL, which transformers.js supports.
import ortMjsSource from 'virtual:ort-loader'

export const VOICE_MODEL = 'onnx-community/whisper-base'

export type WorkerRequest =
  | { type: 'load' }
  | { type: 'transcribe'; id: number; audio: Float32Array }

export type WorkerResponse =
  | { type: 'progress'; file: string; loaded: number; total: number }
  | { type: 'ready'; device: 'webgpu' | 'wasm' }
  | { type: 'result'; id: number; text: string }
  | { type: 'error'; id?: number; message: string }

env.allowLocalModels = false
if (env.backends.onnx.wasm) {
  const mjs = URL.createObjectURL(new Blob([ortMjsSource], { type: 'text/javascript' }))
  env.backends.onnx.wasm.wasmPaths = { mjs, wasm: ortWasmUrl }
}

const post = (msg: WorkerResponse): void => self.postMessage(msg)

let loading: Promise<AutomaticSpeechRecognitionPipeline> | null = null

function onProgress(info: ProgressInfo): void {
  if (info.status === 'progress') {
    post({ type: 'progress', file: info.file, loaded: info.loaded, total: info.total })
  }
}

async function build(device: 'webgpu' | 'wasm'): Promise<AutomaticSpeechRecognitionPipeline> {
  const asr = await pipeline('automatic-speech-recognition', VOICE_MODEL, {
    device,
    // The encoder is the accuracy-sensitive half; the decoder tolerates 4-bit weights
    // and is where most of the download would otherwise go.
    dtype: device === 'webgpu' ? { encoder_model: 'fp32', decoder_model_merged: 'q4' } : 'q8',
    progress_callback: onProgress
  })
  post({ type: 'ready', device })
  return asr
}

function load(): Promise<AutomaticSpeechRecognitionPipeline> {
  if (loading) return loading
  const hasGpu = typeof navigator !== 'undefined' && 'gpu' in navigator
  const fallback = (err: unknown): Promise<AutomaticSpeechRecognitionPipeline> => {
    console.warn('[voice] WebGPU backend failed, falling back to wasm', err)
    return build('wasm')
  }
  loading = (hasGpu ? build('webgpu').catch(fallback) : build('wasm')).catch((err) => {
    loading = null
    throw err
  })
  return loading
}

// Whisper narrates silence ("Thank you.", "[BLANK_AUDIO]") and closes sentences with a
// full stop; neither belongs in a search box.
function clean(text: string): string {
  return text
    .replace(/\[[^\]]*\]|\([^)]*\)/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.!?。]+$/u, '')
    .trim()
}

self.onmessage = async (e: MessageEvent<WorkerRequest>): Promise<void> => {
  const msg = e.data
  if (msg.type === 'load') {
    try {
      await load()
    } catch (err) {
      post({ type: 'error', message: err instanceof Error ? err.message : String(err) })
    }
    return
  }
  try {
    const asr = await load()
    const out = await asr(msg.audio, { task: 'transcribe', return_timestamps: false })
    const text = Array.isArray(out) ? out.map((o) => o.text).join(' ') : out.text
    post({ type: 'result', id: msg.id, text: clean(text) })
  } catch (err) {
    post({ type: 'error', id: msg.id, message: err instanceof Error ? err.message : String(err) })
  }
}
