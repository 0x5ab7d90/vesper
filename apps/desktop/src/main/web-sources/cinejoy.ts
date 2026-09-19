import { randomBytes, webcrypto } from 'crypto'
import { proxiedPlaylistUrl, upstreamAnswers } from '../embed-stream'
import type { WebSourceInput, WebSourceSite, WebStream } from './types'

// Cinejoy: one request per server through a sealed RPC. The site serves a
// small WebAssembly module that wraps each request for the server's public
// key (P-256 ECDH, AES-GCM) and hands back the key the reply is sealed with;
// the reply is AES-GCM under that key with a fixed tag as associated data.
// The module carries the server's key, so when the key rotates the endpoint
// answers 404 and the module is fetched afresh, once, the way the site does.
// Its CDN hosts want no headers at all.

const API = 'https://api.wing.st'
const HEADERS = { Referer: 'https://cinejoy.pk/' }
const TIMEOUT_MS = 10_000
const RANDOM_LEN = 44
// Layout of what seal_request writes: reply key, key id, ephemeral public key, then the body.
const KEY_LEN = 32
const PUBLIC_LEN = 65
const HEADER_LEN = KEY_LEN + 1 + PUBLIC_LEN
const AAD_TAG = 'lumen-gate-v2'
const IV_LEN = 12

interface Sealer {
  memory: WebAssembly.Memory
  alloc: (len: number) => number
  dealloc: (ptr: number, len: number) => void
  seal_request: (
    req: number,
    reqLen: number,
    rnd: number,
    rndLen: number,
    out: number,
    outCap: number
  ) => number
}

let sealer: Promise<Sealer> | null = null

async function loadSealer(): Promise<Sealer> {
  const res = await fetch(`${API}/crush.wasm`, {
    cache: 'no-store',
    signal: AbortSignal.timeout(TIMEOUT_MS)
  })
  if (!res.ok) throw new Error(`crush.wasm ${res.status}`)
  const { instance } = await WebAssembly.instantiate(await res.arrayBuffer(), {})
  return instance.exports as unknown as Sealer
}

function getSealer(fresh = false): Promise<Sealer> {
  if (fresh || !sealer) {
    sealer = loadSealer().catch((err) => {
      sealer = null
      throw err
    })
  }
  return sealer
}

interface Sealed {
  responseKey: Uint8Array
  keyId: number
  ephemeralPublic: Uint8Array
  body: Uint8Array
}

function seal(s: Sealer, path: string, payload: Record<string, string>): Sealed {
  const req = Buffer.from(JSON.stringify({ path, payload }), 'utf8')
  const rnd = randomBytes(RANDOM_LEN)
  const outCap = req.length + 512
  const pReq = s.alloc(req.length)
  const pRnd = s.alloc(RANDOM_LEN)
  const pOut = s.alloc(outCap)
  try {
    let mem = new Uint8Array(s.memory.buffer)
    mem.set(req, pReq)
    mem.set(rnd, pRnd)
    const n = s.seal_request(pReq, req.length, pRnd, RANDOM_LEN, pOut, outCap)
    if (n <= HEADER_LEN || n > outCap) throw new Error(`seal_request returned ${n}`)
    // The module may have grown its memory while sealing; re-read the buffer.
    mem = new Uint8Array(s.memory.buffer)
    const out = mem.slice(pOut, pOut + n)
    return {
      responseKey: out.slice(0, KEY_LEN),
      keyId: out[KEY_LEN]!,
      ephemeralPublic: out.slice(KEY_LEN + 1, HEADER_LEN),
      body: out.slice(HEADER_LEN)
    }
  } finally {
    s.dealloc(pReq, req.length)
    s.dealloc(pRnd, RANDOM_LEN)
    s.dealloc(pOut, outCap)
  }
}

async function unseal(cipher: Uint8Array, sealed: Sealed): Promise<unknown> {
  const tag = Buffer.from(AAD_TAG, 'utf8')
  const aad = new Uint8Array(tag.length + 3 + PUBLIC_LEN)
  aad.set(tag)
  aad.set([0, 2, sealed.keyId], tag.length)
  aad.set(sealed.ephemeralPublic, tag.length + 3)
  const key = await webcrypto.subtle.importKey('raw', sealed.responseKey, 'AES-GCM', false, [
    'decrypt'
  ])
  const plain = await webcrypto.subtle.decrypt(
    { name: 'AES-GCM', iv: cipher.subarray(0, IV_LEN), additionalData: aad, tagLength: 128 },
    key,
    cipher.subarray(IV_LEN)
  )
  return JSON.parse(Buffer.from(plain).toString('utf8'))
}

interface Reply {
  status?: unknown
  data?: { stream?: { type?: unknown; playlist?: unknown }[] }
}

async function call(path: string, payload: Record<string, string>): Promise<Reply> {
  // One retry with a fresh module: a 404 here is the server's way of saying
  // the key the module carries has rotated.
  for (let attempt = 0; attempt < 2; attempt++) {
    const sealed = seal(await getSealer(attempt > 0), path, payload)
    const res = await fetch(`${API}/g`, {
      method: 'POST',
      headers: { 'content-type': 'text/plain;charset=UTF-8' },
      body: Buffer.from(sealed.body),
      signal: AbortSignal.timeout(TIMEOUT_MS)
    })
    if (res.status === 404 && attempt === 0) continue
    if (!res.ok) throw new Error(`g ${res.status}`)
    return (await unseal(new Uint8Array(await res.arrayBuffer()), sealed)) as Reply
  }
  throw new Error('sealed rpc rejected twice')
}

async function fetchServers(): Promise<string[]> {
  const res = await fetch(`${API}/servers`, { signal: AbortSignal.timeout(TIMEOUT_MS) })
  if (!res.ok) throw new Error(`servers ${res.status}`)
  const body = (await res.json()) as { servers?: { name?: unknown; status?: unknown }[] }
  return (body.servers ?? [])
    .filter((s) => s.status === 'ok' && typeof s.name === 'string')
    .map((s) => s.name as string)
}

async function fetchServer(server: string, input: WebSourceInput): Promise<WebStream[]> {
  const payload: Record<string, string> = { tmdb: String(input.tmdbId) }
  if (input.imdbId) payload.imdb = input.imdbId
  if (input.year) payload.year = String(input.year)
  let path = `/${server}/movie`
  if (input.mediaType === 'tv') {
    path = `/${server}/series`
    payload.season = String(input.season ?? 1)
    payload.episode = String(input.episode ?? 1)
  }
  const reply = await call(path, payload)
  if (reply.status !== 200) return []
  const out: WebStream[] = []
  for (const s of reply.data?.stream ?? []) {
    if (s.type !== 'hls' || typeof s.playlist !== 'string') continue
    if (!s.playlist.startsWith('https://')) continue
    if (!(await upstreamAnswers(s.playlist, HEADERS))) continue
    out.push({
      id: `cinejoy:${server}:${out.length}`,
      server,
      lang: 'en',
      quality: 'Auto',
      url: await proxiedPlaylistUrl(s.playlist, HEADERS)
    })
  }
  return out
}

async function listStreams(
  input: WebSourceInput,
  onChunk?: (rows: WebStream[]) => void
): Promise<WebStream[]> {
  const servers = await fetchServers()
  const out: WebStream[] = []
  await Promise.all(
    servers.map(async (server) => {
      try {
        const rows = await fetchServer(server, input)
        if (rows.length === 0) return
        out.push(...rows)
        onChunk?.(rows)
      } catch (err) {
        console.warn(`[web-sources] cinejoy ${server} failed:`, (err as Error).message)
      }
    })
  )
  return out
}

export const cinejoy: WebSourceSite = { name: 'Cinejoy', listStreams }
