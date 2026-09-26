import { net } from 'electron'
import { createHash } from 'crypto'
import {
  CHROME_UA,
  proxiedFileUrl,
  proxiedPlaylistUrl,
  registerSegmentKey,
  streamKeepsUp,
  upstreamAnswers,
  type UpstreamHeaders
} from '../embed-stream'
import { subtitleLang } from './anime'
import { resolveAnilistEpisode } from './miruro'
import type { WebSourceInput, WebSourceSite, WebStream, WebSubtitle } from './types'

// LunarX: an anime site keyed on AniList id and episode number, with two
// kinds of server. Zen is its own library: one playlist carrying Japanese and
// English audio side by side, soft subtitles as ASS and SRT files, and
// segments dressed as PNG or WebP images, most of them XORed under a fixed key
// its player strips (registered with the header proxy below). The rest
// ("vermillion" hosts: Yuki, Beep, Sora, …) are other sites' streams relayed,
// listed per episode; each is asked to prove it keeps up before it is listed.
//
// Stream URLs come back XORed under a key the watch page carries. The page's
// server render holds a client component rendered several times over with
// random-named hex props; one instance, found by its magic bytes, decodes to
// two strings that blend into the key. Cloudflare turns Node's own fetch away
// from the page but not Chromium's, so it is fetched through `net`. The key
// rotates; a URL that won't decode fetches it again, once.

const SITE = 'https://lunarx.to'
const API = 'https://api.lunarx.to/api'
const TIMEOUT_MS = 10_000
// Some relayed hosts take twenty seconds to answer.
const SOURCES_TIMEOUT_MS = 30_000
const ZEN_HEADERS = { Referer: `${SITE}/` }
// The key the site's player XORs Zen segments with, after the image signature.
const ZEN_SEGMENT_KEY = [157, 42, 241, 71, 179, 142, 92, 112, 166, 25, 228, 59, 216, 98, 15, 197]
// Where a relayed host's reply names no Referer, the one the site's bundle uses.
const HOST_REFERER: Record<string, string> = {
  yuki: 'https://megaplay.buzz/',
  beep: 'https://kwik.cx/',
  uwu: 'https://kwik.cx/',
  akane: 'https://dotstream.buzz/',
  vanity: 'https://vidwish.live/',
  miku: 'https://megacloud.bloggy.click/',
  ozzy: 'https://animekai.to/',
  sora: 'https://krussdomi.com/',
  kiwi: 'https://krussdomi.com/'
}

registerSegmentKey(ZEN_SEGMENT_KEY)

type Audio = 'sub' | 'dub'

// ── The stream-URL key ──────────────────────────────────────────────────────

/** The page's server-rendered payload, as the self.__next_f pushes carry it. */
function flightData(html: string): string {
  let out = ''
  const re = /self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)/g
  for (let m = re.exec(html); m; m = re.exec(html)) out += JSON.parse(m[1]) as string
  return out
}

/** Every rendered element whose props are all strings: the key's candidates. */
function stringPropObjects(flight: string): Record<string, string>[] {
  const out: Record<string, string>[] = []
  const re = /\["\$","\$L[0-9a-z]+","[^"]*",\{/g
  for (let m = re.exec(flight); m; m = re.exec(flight)) {
    const start = m.index + m[0].length - 1
    let depth = 0
    let inString = false
    let end = start
    for (; end < flight.length; end++) {
      const c = flight[end]
      if (inString) {
        if (c === '\\') end++
        else if (c === '"') inString = false
      } else if (c === '"') inString = true
      else if (c === '{') depth++
      else if (c === '}' && --depth === 0) break
    }
    try {
      const props = JSON.parse(flight.slice(start, end + 1)) as Record<string, unknown>
      const values = Object.values(props)
      if (values.length >= 2 && values.every((v) => typeof v === 'string')) {
        out.push(props as Record<string, string>)
      }
    } catch {
      // Not a props object after all.
    }
  }
  return out
}

function hash8(s: string): number {
  let t = 0
  for (let i = 0; i < s.length; i++) t = (31 * t + s.charCodeAt(i)) & 255
  return t
}

interface KeyHeader {
  seed: number
  a: number
  b: number
  program: [number, number][]
  parts: string[]
}

// One prop is a header: reversed base64, XORed on its own name, describing
// the byte program and which other props hold the payload, in order.
function parseKeyHeader(name: string, value: string): KeyHeader | null {
  const raw = Buffer.from(value.split('').reverse().join(''), 'base64').toString('latin1')
  const salt = hash8(name)
  let text = ''
  for (let i = 0; i < raw.length; i++) {
    text += String.fromCharCode((raw.charCodeAt(i) ^ (salt + 37 * i)) & 255)
  }
  const fields = text.split('|')
  if (fields.length !== 6 || fields[0] !== '3') return null
  const [seed, a, b] = fields.slice(1, 4).map((f) => parseInt(f, 16))
  if ([seed, a, b].some(Number.isNaN)) return null
  const ops = fields[4]
  if (!ops.length || ops.length % 3) return null
  const program: [number, number][] = []
  for (let i = 0; i < ops.length; i += 3) {
    const op = parseInt(ops[i], 16)
    const arg = parseInt(ops.slice(i + 1, i + 3), 16)
    if (Number.isNaN(op) || Number.isNaN(arg) || op > 7) return null
    program.push([op, arg])
  }
  const parts = fields[5].split('.').filter(Boolean)
  return parts.length ? { seed, a, b, program, parts } : null
}

function runProgram(
  value: number,
  index: number,
  stream: number,
  program: [number, number][]
): number {
  let x = value & 255
  for (let i = program.length - 1; i >= 0; i--) {
    const [op, f] = program[i]
    if (op === 0) x ^= f
    else if (op === 1) x -= f
    else if (op === 2) {
      const s = 7 & f || 1
      x = ((x >>> s) | (x << (8 - s))) & 255
    } else if (op === 3) x = ((15 & x) << 4) | ((255 & x) >>> 4)
    else if (op === 4) x ^= stream
    else if (op === 5) x ^= (index * (1 | f) + f) & 255
    else if (op === 6) x = ~x
    else x = f - x
    x &= 255
  }
  return x
}

// The real instance decodes to 0xA7 0x3E 0x91, two lengths, then both strings;
// the decoys decode to anything else.
function keyPairFrom(props: Record<string, string>): [string, string] | null {
  for (const name of Object.keys(props)) {
    const header = parseKeyHeader(name, props[name])
    if (!header) continue
    const hex = header.parts.map((p) => props[p] ?? '').join('')
    if (hex.length < 2 || hex.length % 2) continue
    const bytes: number[] = []
    let stream = header.seed & 255
    let prev = 0
    for (let i = 0; i < hex.length; i += 2) {
      const v = parseInt(hex.slice(i, i + 2), 16)
      stream = (stream * header.a + header.b) & 255
      bytes.push(runProgram(v ^ prev, i / 2, stream, header.program))
      prev = v
    }
    if (bytes.length < 7 || bytes[0] !== 167 || bytes[1] !== 62 || bytes[2] !== 145) return null
    const la = (bytes[3] << 8) | bytes[4]
    const lb = (bytes[5] << 8) | bytes[6]
    if (la <= 0 || lb <= 0 || 7 + la + lb > bytes.length) return null
    return [
      String.fromCharCode(...bytes.slice(7, 7 + la)),
      String.fromCharCode(...bytes.slice(7 + la, 7 + la + lb))
    ]
  }
  return null
}

/** SHA-256 of both strings, mixed with each of them. */
function blendKey(a: string, b: string): Buffer {
  const digest = createHash('sha256').update(`${a}\x01${b}`, 'utf8').digest()
  const out = Buffer.alloc(Math.max(a.length, b.length))
  for (let i = 0; i < out.length; i++) {
    out[i] =
      (a.charCodeAt(i % a.length) ^
        b.charCodeAt(i % b.length) ^
        digest[i % 32] ^
        ((83 * i + 29) & 255)) &
      255
  }
  return out
}

let streamKey: Promise<Buffer> | null = null

async function loadStreamKey(anilistId: number, episode: number): Promise<Buffer> {
  const res = await net.fetch(`${SITE}/anime/${anilistId}/1/${episode}`, {
    headers: { 'User-Agent': CHROME_UA, Accept: 'text/html' },
    signal: AbortSignal.timeout(TIMEOUT_MS)
  })
  if (!res.ok) throw new Error(`watch page ${res.status}`)
  for (const props of stringPropObjects(flightData(await res.text()))) {
    const pair = keyPairFrom(props)
    if (pair) return blendKey(pair[0], pair[1])
  }
  throw new Error('no key on the watch page')
}

function getStreamKey(anilistId: number, episode: number, fresh = false): Promise<Buffer> {
  if (fresh || !streamKey) {
    const loading = loadStreamKey(anilistId, episode)
    streamKey = loading
    loading.catch(() => {
      if (streamKey === loading) streamKey = null
    })
  }
  return streamKey
}

function xorDecode(encoded: string, key: Buffer): string {
  const raw = Buffer.from(encoded, 'base64url')
  return Buffer.from(raw.map((c, i) => c ^ key[i % key.length])).toString('latin1')
}

async function decodeUrl(encoded: string, anilistId: number, episode: number): Promise<string> {
  if (encoded.startsWith('https://')) return encoded
  const url = xorDecode(encoded, await getStreamKey(anilistId, episode))
  if (url.startsWith('https://')) return url
  const again = xorDecode(encoded, await getStreamKey(anilistId, episode, true))
  if (again.startsWith('https://')) return again
  throw new Error('stream URL did not decode')
}

// ── Requests ────────────────────────────────────────────────────────────────

async function api<T>(path: string, timeoutMs = TIMEOUT_MS): Promise<T> {
  const res = await fetch(`${API}${path}`, { signal: AbortSignal.timeout(timeoutMs) })
  if (!res.ok) throw new Error(`${path.split('?')[0]} ${res.status}`)
  return (await res.json()) as T
}

function stringHeaders(raw: unknown): UpstreamHeaders {
  const out: UpstreamHeaders = {}
  if (raw && typeof raw === 'object') {
    for (const [k, v] of Object.entries(raw)) if (typeof v === 'string') out[k] = v
  }
  return out
}

function withoutOrigin(headers: UpstreamHeaders): UpstreamHeaders {
  const rest = { ...headers }
  delete rest.Origin
  return rest
}

function label(host: string): string {
  return host.charAt(0).toUpperCase() + host.slice(1)
}

async function subtitlesFor(
  tracks: { url: string; label: string; lang?: string; default: boolean; fallback?: string }[],
  headers: UpstreamHeaders
): Promise<WebSubtitle[] | undefined> {
  const out: WebSubtitle[] = []
  const seen = new Set<string>()
  for (const t of tracks) {
    if (seen.has(t.url)) continue
    seen.add(t.url)
    out.push({
      lang: subtitleLang(t.label, t.lang),
      label: t.label,
      url: await proxiedFileUrl(t.url, headers, t.fallback),
      default: t.default
    })
  }
  return out.length > 0 ? out : undefined
}

// The site relays some hosts' subtitles through its API with the file's URL in
// base64, and mangles some of them on the way ("https:///host/…"); the file
// itself answers directly, so it is asked first and the relay kept as fallback.
function unrelayedSubtitle(url: string): string | null {
  try {
    const relay = new URL(url)
    const inner = relay.searchParams.get('u')
    if (relay.origin !== new URL(API).origin || !inner) return null
    const direct = Buffer.from(inner, 'base64')
      .toString('utf8')
      .replace(/^https:\/{3,}/, 'https://')
    return direct.startsWith('https://') ? direct : null
  } catch {
    return null
  }
}

// ── Zen ─────────────────────────────────────────────────────────────────────

interface ZenReply {
  stream_data?: {
    m3u8_url?: unknown
    has_dub?: unknown
    subtitles?: {
      url?: unknown
      language?: unknown
      language_name?: unknown
      title?: unknown
      format?: unknown
      is_default?: unknown
    }[]
  } | null
}

// The overlay reads ASS, SRT and VTT; SUP tracks are pictures.
const TEXT_SUBTITLES = new Set(['ass', 'ssa', 'srt', 'vtt'])

async function zenRows(anilistId: number, episode: number): Promise<WebStream[]> {
  const reply = await api<ZenReply>(
    `/3rdprovider?anilist=${anilistId}&episode=${episode}&m3u8=true&a=0&audio=sub`
  )
  const data = reply.stream_data
  if (!data || typeof data.m3u8_url !== 'string') return []
  const playlist = await decodeUrl(data.m3u8_url, anilistId, episode)
  if (!(await upstreamAnswers(playlist, ZEN_HEADERS))) return []

  const tracks = (data.subtitles ?? []).flatMap((s) => {
    const format = typeof s.format === 'string' ? s.format.toLowerCase() : ''
    if (typeof s.url !== 'string' || !s.url.startsWith('https://') || !TEXT_SUBTITLES.has(format)) {
      return []
    }
    const name = typeof s.language_name === 'string' ? s.language_name : ''
    const title = typeof s.title === 'string' ? s.title : ''
    return [
      {
        url: s.url,
        // "Arabic · Arabic" says it once; "English · ER@AMZN" needs both.
        label: title.toLowerCase().includes(name.toLowerCase())
          ? title
          : [name, title].filter(Boolean).join(' · '),
        lang: typeof s.language === 'string' ? s.language : undefined,
        default: s.is_default === true
      }
    ]
  })
  const subtitles = await subtitlesFor(tracks, ZEN_HEADERS)
  const url = await proxiedPlaylistUrl(playlist, ZEN_HEADERS)
  // One playlist, both audio tracks; the row's language is the one the player picks.
  const audios: Audio[] = data.has_dub === true ? ['sub', 'dub'] : ['sub']
  return audios.map((audio) => ({
    id: `lunarx:zen:${audio}`,
    server: `Zen · ${audio === 'dub' ? 'Dub' : 'Sub'}`,
    lang: audio === 'dub' ? 'en' : 'ja',
    quality: 'Auto',
    url,
    subtitles,
    anime: true
  }))
}

// ── Relayed hosts ───────────────────────────────────────────────────────────

interface EpisodesReply {
  data?: {
    number?: unknown
    subProviders?: ({ id?: unknown } | string)[]
    dubProviders?: ({ id?: unknown } | string)[]
  }[]
}

interface SourcesReply {
  data?: {
    sources?: { url?: unknown; isM3U8?: unknown }[]
    subtitles?: {
      url?: unknown
      label?: unknown
      lang?: unknown
      kind?: unknown
      default?: unknown
    }[]
    headers?: unknown
  } | null
}

function hostIds(list: ({ id?: unknown } | string)[] | undefined): string[] {
  return (list ?? []).flatMap((p) => {
    const id = typeof p === 'string' ? p : p.id
    return typeof id === 'string' && id ? [id] : []
  })
}

async function hostRows(
  host: string,
  audio: Audio,
  anilistId: number,
  episode: number
): Promise<WebStream[]> {
  const reply = await api<SourcesReply>(
    `/animes/vermillion/sources?id=${anilistId}&host=${host}&epNum=${episode}&type=${audio}`,
    SOURCES_TIMEOUT_MS
  )
  const data = reply.data
  const source = (data?.sources ?? []).find((s) => s.isM3U8 === true && typeof s.url === 'string')
  if (!data || !source) return []
  const playlist = await decodeUrl(source.url as string, anilistId, episode)

  const headers = stringHeaders(data.headers)
  delete headers.Origin
  if (!headers.Referer && HOST_REFERER[host]) headers.Referer = HOST_REFERER[host]
  // KickAssAnime's segment hosts answer only to its player's origin, whatever
  // Referer the reply names.
  if (host === 'sora' || headers.Referer?.includes('krussdomi.com')) {
    headers.Referer = 'https://krussdomi.com/'
    headers.Origin = 'https://krussdomi.com'
  }
  if (!(await streamKeepsUp(playlist, headers))) return []

  const tracks = (data.subtitles ?? []).flatMap((s) => {
    if (typeof s.url !== 'string' || !s.url.startsWith('https://')) return []
    const name = typeof s.label === 'string' ? s.label : ''
    if (s.kind === 'thumbnails' || /thumb/i.test(name)) return []
    const direct = unrelayedSubtitle(s.url)
    return [
      direct
        ? { url: direct, fallback: s.url, label: name, default: s.default === true }
        : { url: s.url, label: name, default: s.default === true }
    ]
  })
  return [
    {
      id: `lunarx:${host}:${audio}`,
      server: `${label(host)} · ${audio === 'dub' ? 'Dub' : 'Sub'}`,
      lang: audio === 'dub' ? 'en' : 'ja',
      quality: 'Auto',
      url: await proxiedPlaylistUrl(playlist, headers),
      // Subtitle files come through the site's own API, which refuses any Origin.
      subtitles: await subtitlesFor(tracks, withoutOrigin(headers)),
      anime: true
    }
  ]
}

async function listStreams(
  input: WebSourceInput,
  onChunk?: (rows: WebStream[]) => void
): Promise<WebStream[]> {
  const at = await resolveAnilistEpisode(input)
  if (!at) return []
  const { anilistId, episode } = at

  const out: WebStream[] = []
  const settle = (job: Promise<WebStream[]>, name: string): Promise<void> =>
    job.then(
      (answered) => {
        // Two hosts can relay one playlist; the first to answer is listed.
        const rows = answered.filter((r) => !out.some((o) => o.url === r.url && o.lang === r.lang))
        if (rows.length === 0) return
        out.push(...rows)
        onChunk?.(rows)
      },
      (err: Error) => console.warn(`[web-sources] lunarx ${name} failed:`, err.message)
    )

  const relayed = api<EpisodesReply>(`/animes/v2/vermillion/episodes?id=${anilistId}`).then(
    async (reply) => {
      const row = (reply.data ?? []).find((e) => Number(e.number) === episode)
      if (!row) return
      const jobs: Promise<void>[] = []
      for (const [audio, list] of [
        ['sub', row.subProviders],
        ['dub', row.dubProviders]
      ] as const) {
        for (const host of hostIds(list)) {
          jobs.push(settle(hostRows(host, audio, anilistId, episode), `${host} ${audio}`))
        }
      }
      await Promise.all(jobs)
    },
    (err: Error) => console.warn('[web-sources] lunarx episodes failed:', err.message)
  )
  await Promise.all([settle(zenRows(anilistId, episode), 'zen'), relayed])
  return out
}

export const lunarx: WebSourceSite = { name: 'LunarX', listStreams }
