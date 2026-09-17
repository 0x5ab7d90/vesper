import { ipcMain } from 'electron'
import { proxiedPlaylistUrl } from './embed-stream'

// Web sources: a stream API that hands out HLS playlists for a title on
// request, no hidden browser needed (ADR-0019). One `seed` call keys a
// short-lived cipher; every provider's `sources` answer is that cipher over
// a JSON body. The keystream below is a port of the site's own client, so if
// the site rotates its scheme this file is what stops decrypting.

const API = 'https://api.wecollege.net'
const REFERER = 'https://www.movy.sx/'
const SEED_TTL_FALLBACK_MS = 30_000
// The list waits for the slowest server, so this bounds how long the picker's
// section can sit on its skeleton. Healthy servers answer in well under a second.
const PROVIDER_TIMEOUT_MS = 8_000

export interface WebSourceInput {
  title: string
  mediaType: 'movie' | 'tv'
  tmdbId: number
  imdbId?: string
  year?: number
  season?: number
  episode?: number
}

export interface WebStream {
  id: string
  server: string
  /** Audio language as a subtitle-style code, for the flag tile. */
  lang: string
  /** "2160p", "1080p", "Auto", … as the provider labels it. */
  quality: string
  /** Playback URL through the local header proxy. */
  url: string
}

interface Provider {
  slug: string
  name: string
  /** Audio language; original-audio servers are marked English. */
  lang: string
  /** Drop rows whose quality label doesn't match — some providers mix languages in one answer. */
  onlyQuality?: string
  extraParams?: Record<string, string>
}

// Order is the site's own: original-audio servers first, dubs after.
const PROVIDERS: Provider[] = [
  { slug: 'miami', name: 'Miami', lang: 'en' },
  { slug: 'boise', name: 'Boise', lang: 'en' },
  { slug: 'atlanta', name: 'Atlanta', lang: 'en' },
  { slug: 'seattle', name: 'Seattle', lang: 'en' },
  { slug: 'denver', name: 'Denver', lang: 'en' },
  { slug: 'phoenix', name: 'Phoenix', lang: 'en' },
  { slug: 'portland', name: 'Portland', lang: 'en' },
  { slug: 'austin', name: 'Austin', lang: 'en', onlyQuality: 'English' },
  { slug: 'dallas', name: 'Dallas', lang: 'en' },
  { slug: 'tampa', name: 'Tampa', lang: 'en' },
  { slug: 'orlando', name: 'Orlando', lang: 'en' },
  { slug: 'munich', name: 'Munich', lang: 'de', extraParams: { language: 'german' } },
  { slug: 'berlin', name: 'Berlin', lang: 'de' },
  { slug: 'paris', name: 'Paris', lang: 'fr' },
  { slug: 'delhi', name: 'Delhi', lang: 'hi', onlyQuality: 'Hindi' },
  // "spl" is the app's own code for Latin American Spanish — it carries the Mexican flag.
  { slug: 'cancun', name: 'Cancun', lang: 'spl' }
]

// ---- cipher -----------------------------------------------------------------

// Every plaintext starts with this tag; a wrong seed shows up here instead of as garbage JSON.
const MAGIC = [0x6d, 0x76, 0x6d, 0x31] // "mvm1"

function fmix(e: number): number {
  e >>>= 0
  e ^= e >>> 16
  e = Math.imul(e, 0x85ebca6b) >>> 0
  e ^= e >>> 13
  e = Math.imul(e, 0xc2b2ae35) >>> 0
  return (e ^= e >>> 16) >>> 0
}

function rotl(e: number, a: number): number {
  e >>>= 0
  a &= 31
  return a === 0 ? e >>> 0 : ((e << a) | (e >>> (32 - a))) >>> 0
}

function fnv(s: string): number {
  let a = 0x811c9dc5
  for (let t = 0; t < s.length; t++) a = Math.imul(a ^ s.charCodeAt(t), 0x1000193) >>> 0
  return fmix(a)
}

interface KeyState {
  // Sparse on purpose: the generator asks whether a slot has ever been written.
  S: number[]
  acc: number
}

function initKey(seed: string, mediaId: number): KeyState {
  const S: number[] = Array(61)
  let s = fmix(fnv(seed) ^ fmix((mediaId >>> 0) ^ 0x9e3779b9)) >>> 0
  for (let e = 0; e < 8; e++) {
    const a = s % 61
    s = rotl((s + 0x9e3779b9) >>> 0, 7 + (7 & e))
    S[a] = (s ^ fmix(s)) >>> 0
    s = fmix((s + a) >>> 0)
  }
  return { S, acc: fmix(0xa5a5a5a5 ^ s) >>> 0 }
}

function nextWord(st: KeyState, ctr: number): number {
  const S = st.S
  const l = st.acc
  const r = l % 61
  const i = 0 - Number(r in S)
  const u = S[r] >>> 0
  const c = Math.imul(0x9e3779b9, ctr + 1) >>> 0
  const n = (u ^ c) >>> 0
  let b = (((l ^ n) >>> 0) | ((l & n & i) >>> 0)) >>> 0
  b = (rotl((b + l) >>> 0, 31 & r) ^ rotl(l, 31 & Math.imul(r, 7))) >>> 0
  const out = fmix((b + 0x9e3779b9) >>> 0)
  S[r] = out >>> 0
  st.acc = out
  return out >>> 0
}

function keystream(seed: string, mediaId: number, len: number): Uint8Array {
  const st = initKey(seed, mediaId)
  const out = new Uint8Array(len)
  let ctr = 0
  for (let e = 0; e < len; ) {
    const a = nextWord(st, ctr++)
    out[e++] = 255 & a
    if (e < len) out[e++] = (a >>> 8) & 255
    if (e < len) out[e++] = (a >>> 16) & 255
    if (e < len) out[e++] = (a >>> 24) & 255
  }
  return out
}

export function decryptSources(b64url: string, seed: string, mediaId: number): string {
  const buf = new Uint8Array(Buffer.from(b64url.replace(/-/g, '+').replace(/_/g, '/'), 'base64'))
  const ks = keystream(seed, mediaId, buf.length)
  for (let i = 0; i < buf.length; i++) buf[i] ^= ks[i]
  for (let i = 0; i < MAGIC.length; i++) {
    if (buf[i] !== MAGIC[i]) throw new Error('decrypt failed: bad seed or tampered payload')
  }
  return Buffer.from(buf.subarray(MAGIC.length)).toString('utf8')
}

// ---- client -----------------------------------------------------------------

const seedCache = new Map<number, { seed: string; expiresAt: number }>()

async function fetchSeed(mediaId: number): Promise<string> {
  const hit = seedCache.get(mediaId)
  if (hit && hit.expiresAt - 5_000 > Date.now()) return hit.seed
  const res = await fetch(`${API}/seed?mediaId=${mediaId}`, {
    signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS)
  })
  if (!res.ok) throw new Error(`seed ${res.status}`)
  const body = (await res.json()) as { seed?: string; ttlMs?: number }
  if (typeof body.seed !== 'string') throw new Error('seed missing')
  seedCache.set(mediaId, {
    seed: body.seed,
    expiresAt: Date.now() + (body.ttlMs ?? SEED_TTL_FALLBACK_MS)
  })
  return body.seed
}

interface RawSource {
  url?: unknown
  quality?: unknown
  type?: unknown
}

function isHls(url: string): boolean {
  // Bare MP4 and DASH answers exist on a couple of servers; hls.js can't play
  // them and the proxy doesn't forward ranges, so they're left out.
  return !/\/mp4\/|\.mp4(\?|$)|\.mpd(\?|$)/i.test(url)
}

async function fetchProvider(
  p: Provider,
  input: WebSourceInput,
  seed: string
): Promise<WebStream[]> {
  const params = new URLSearchParams({
    title: input.title,
    mediaType: input.mediaType,
    tmdbId: String(input.tmdbId),
    enc: '2',
    seed
  })
  if (input.year) params.set('year', String(input.year))
  if (input.imdbId) params.set('imdbId', input.imdbId)
  if (input.mediaType === 'tv') {
    params.set('seasonId', String(input.season ?? 1))
    params.set('episodeId', String(input.episode ?? 1))
  }
  for (const [k, v] of Object.entries(p.extraParams ?? {})) params.set(k, v)

  const res = await fetch(`${API}/${p.slug}/sources?${params}`, {
    signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS)
  })
  if (!res.ok) throw new Error(`${p.slug} ${res.status}`)
  const parsed = JSON.parse(decryptSources(await res.text(), seed, input.tmdbId)) as {
    sources?: RawSource[]
  }
  const out: WebStream[] = []
  for (const s of parsed.sources ?? []) {
    if (typeof s.url !== 'string' || !s.url.startsWith('https://')) continue
    if (!isHls(s.url)) continue
    const quality = typeof s.quality === 'string' && s.quality ? s.quality : 'Auto'
    if (p.onlyQuality && quality !== p.onlyQuality) continue
    out.push({
      id: `${p.slug}:${quality}:${out.length}`,
      server: p.name,
      lang: p.lang,
      quality: p.onlyQuality ? 'Auto' : quality,
      url: await proxiedPlaylistUrl(s.url, REFERER)
    })
  }
  return out
}

// Every provider is asked at once and each answer is handed over the moment
// it lands, so the healthy servers (a few hundred milliseconds) never wait on
// the dead ones (seconds, then an error). The resolved value is the whole list.
export async function listWebStreams(
  input: WebSourceInput,
  onChunk?: (rows: WebStream[]) => void
): Promise<WebStream[]> {
  const seed = await fetchSeed(input.tmdbId)
  const out: WebStream[] = []
  await Promise.all(
    PROVIDERS.map(async (p) => {
      try {
        const rows = await fetchProvider(p, input, seed)
        if (rows.length === 0) return
        out.push(...rows)
        onChunk?.(rows)
      } catch (err) {
        console.warn(`[web-sources] ${p.slug} failed:`, (err as Error).message)
      }
    })
  )
  return out
}

function validInput(raw: unknown): WebSourceInput | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  if (typeof r.title !== 'string' || !r.title) return null
  if (r.mediaType !== 'movie' && r.mediaType !== 'tv') return null
  if (typeof r.tmdbId !== 'number' || !Number.isInteger(r.tmdbId) || r.tmdbId <= 0) return null
  const num = (v: unknown): number | undefined =>
    typeof v === 'number' && Number.isFinite(v) ? v : undefined
  return {
    title: r.title,
    mediaType: r.mediaType,
    tmdbId: r.tmdbId,
    imdbId: typeof r.imdbId === 'string' ? r.imdbId : undefined,
    year: num(r.year),
    season: num(r.season),
    episode: num(r.episode)
  }
}

export function registerWebSources(): void {
  // Partial answers ride back as `web:streamsChunk` events tagged with the
  // caller's request id; the invoke itself resolves with the full list.
  ipcMain.handle(
    'web:listStreams',
    async (e, raw: unknown, requestId: unknown): Promise<WebStream[]> => {
      const input = validInput(raw)
      if (!input) throw new Error('invalid web source input')
      const id = typeof requestId === 'string' ? requestId : null
      return listWebStreams(input, (rows) => {
        if (id && !e.sender.isDestroyed()) e.sender.send('web:streamsChunk', id, rows)
      })
    }
  )
}
