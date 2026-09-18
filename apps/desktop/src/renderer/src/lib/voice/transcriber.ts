/*
 * Main-thread handle on the transcription worker. One worker for the app, spun up on
 * first use and kept, so the model stays resident between searches.
 */
import type { WorkerRequest, WorkerResponse } from './transcribe-worker'

export type LoadProgress = { loaded: number; total: number }

type Listener = (p: LoadProgress) => void

let worker: Worker | null = null
let nextId = 1
const pending = new Map<number, { resolve: (t: string) => void; reject: (e: Error) => void }>()
const files = new Map<string, LoadProgress>()
const listeners = new Set<Listener>()
let ready = false

function ensureWorker(): Worker {
  if (worker) return worker
  worker = new Worker(new URL('./transcribe-worker.ts', import.meta.url), { type: 'module' })
  worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
    const msg = e.data
    if (import.meta.env.DEV && msg.type !== 'progress') console.info('[voice]', msg)
    switch (msg.type) {
      case 'progress': {
        if (import.meta.env.DEV && !files.has(msg.file))
          console.info('[voice] fetching', msg.file, `${(msg.total / 1e6).toFixed(0)} MB`)
        files.set(msg.file, { loaded: msg.loaded, total: msg.total })
        let loaded = 0
        let total = 0
        for (const f of files.values()) {
          loaded += f.loaded
          total += f.total
        }
        for (const l of listeners) l({ loaded, total })
        break
      }
      case 'ready':
        ready = true
        break
      case 'result':
        pending.get(msg.id)?.resolve(msg.text)
        pending.delete(msg.id)
        break
      case 'error': {
        const err = new Error(msg.message)
        if (msg.id === undefined) {
          for (const p of pending.values()) p.reject(err)
          pending.clear()
        } else {
          pending.get(msg.id)?.reject(err)
          pending.delete(msg.id)
        }
        break
      }
    }
  }
  worker.onerror = (e) => {
    console.error('[voice] worker error', e.message, e.error)
    const err = new Error(e.message || 'Voice model failed to start')
    for (const p of pending.values()) p.reject(err)
    pending.clear()
  }
  return worker
}

function send(msg: WorkerRequest, transfer: Transferable[] = []): void {
  ensureWorker().postMessage(msg, transfer)
}

export const transcriber = {
  /** True once the model has finished loading at least once this session. */
  get ready(): boolean {
    return ready
  },
  /** Start loading the model without waiting for audio. */
  warm(): void {
    send({ type: 'load' })
  },
  /** Watch download progress; returns an unsubscribe. */
  onProgress(listener: Listener): () => void {
    listeners.add(listener)
    return () => listeners.delete(listener)
  },
  /** Mono PCM at 16 kHz in, text out. */
  transcribe(audio: Float32Array): Promise<string> {
    const id = nextId++
    return new Promise<string>((resolve, reject) => {
      pending.set(id, { resolve, reject })
      send({ type: 'transcribe', id, audio }, [audio.buffer])
    })
  }
}
