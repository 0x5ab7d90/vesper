import { proxiedFileUrl, proxiedPlaylistUrl, streamKeepsUp, upstreamAnswers } from '../embed-stream'
import { subtitleLang } from './anime'
import { resolveAnilistEpisode } from './miruro'
import type { WebSourceInput, WebSourceSite, WebStream, WebSubtitle } from './types'

// JustAnime: plain JSON keyed on AniList id and episode number, gated only on
// an Origin its allow-list knows. Each server answers with sub and dub
// together, every playlist and subtitle file ready to play with the Referer
// the reply names. There is no TMDB in its catalogue, so the episode comes
// from the shared AniList mapping.
//
// Momo (MegaPlay) is the fast one. Zoko pulls from upstream on demand and an
// uncached episode plays slower than realtime, so it is asked only for an
// audio Momo doesn't carry, and listed only when its first segment arrives
// faster than it plays.

const API = 'https://core.justanime.to/api'
const API_HEADERS = { Origin: 'https://justanime.to' }
const TIMEOUT_MS = 10_000

// API id → the name the site shows. Animegg is MP4 only; AniNeko maps nothing.
const SERVERS = [
  { id: 'megaplay', label: 'Momo' },
  { id: 'zokoanime', label: 'Zoko', fallback: true }
]

type Audio = 'sub' | 'dub'

interface RawTrack {
  file?: unknown
  label?: unknown
  kind?: unknown
  default?: unknown
}

interface RawBlock {
  sources?: { url?: unknown; isM3U8?: unknown; headers?: unknown }[]
  subtitles?: RawTrack[]
  tracks?: RawTrack[]
  headers?: unknown
}

async function api<T>(path: string): Promise<T | null> {
  const res = await fetch(`${API}${path}`, {
    headers: API_HEADERS,
    signal: AbortSignal.timeout(TIMEOUT_MS)
  })
  // A missing episode is a 404 with an error body: nothing here, not a failure.
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`${path} ${res.status}`)
  return (await res.json()) as T
}

function stringHeaders(raw: unknown): Record<string, string> {
  const out: Record<string, string> = {}
  if (raw && typeof raw === 'object') {
    for (const [k, v] of Object.entries(raw)) if (typeof v === 'string') out[k] = v
  }
  return out
}

async function rowsFor(
  server: (typeof SERVERS)[number],
  audio: Audio,
  block: RawBlock
): Promise<WebStream[]> {
  const blockHeaders = stringHeaders(block.headers)
  const candidates: { url: string; headers: Record<string, string> }[] = []
  for (const s of block.sources ?? []) {
    if (s.isM3U8 !== true || typeof s.url !== 'string' || !s.url.startsWith('https://')) continue
    if (candidates.some((c) => c.url === s.url)) continue
    candidates.push({ url: s.url, headers: { ...blockHeaders, ...stringHeaders(s.headers) } })
  }
  // A fallback server has to prove it keeps up; an uncached episode there
  // would buffer every few seconds.
  const alive = await Promise.all(
    candidates.map((c) =>
      server.fallback ? streamKeepsUp(c.url, c.headers) : upstreamAnswers(c.url, c.headers)
    )
  )

  const out: WebStream[] = []
  for (const [i, c] of candidates.entries()) {
    if (!alive[i]) continue
    const subtitles: WebSubtitle[] = []
    for (const t of block.subtitles ?? block.tracks ?? []) {
      if (typeof t.file !== 'string' || !t.file.startsWith('https://')) continue
      if (t.kind === 'thumbnails' || subtitles.some((s) => s.url === t.file)) continue
      const label = typeof t.label === 'string' ? t.label : ''
      subtitles.push({
        lang: subtitleLang(label),
        label,
        // The subtitle hosts want the stream's Referer too.
        url: await proxiedFileUrl(t.file, c.headers),
        default: t.default === true
      })
    }
    out.push({
      id: `justanime:${server.id}:${audio}:${out.length}`,
      server: `${server.label} · ${audio === 'dub' ? 'Dub' : 'Sub'}`,
      lang: audio === 'dub' ? 'en' : 'ja',
      quality: 'Auto',
      url: await proxiedPlaylistUrl(c.url, c.headers),
      subtitles: subtitles.length > 0 ? subtitles : undefined
    })
  }
  return out
}

async function listStreams(
  input: WebSourceInput,
  onChunk?: (rows: WebStream[]) => void
): Promise<WebStream[]> {
  const at = await resolveAnilistEpisode(input)
  if (!at) return []
  const base = `/watch/${at.anilistId}/episode/${at.episode}`
  const availability = await api<{ servers?: Record<string, Partial<Record<Audio, boolean>>> }>(
    `${base}/availability`
  )
  if (!availability) return []

  const out: WebStream[] = []
  const covered = new Set<Audio>()
  const run = async (server: (typeof SERVERS)[number], audios: Audio[]): Promise<void> => {
    const wanted = audios.filter((a) => availability.servers?.[server.id]?.[a])
    if (wanted.length === 0) return
    const reply = await api<Partial<Record<Audio, RawBlock | null>>>(`${base}/${server.id}`)
    for (const audio of wanted) {
      const block = reply?.[audio]
      if (!block) continue
      const rows = await rowsFor(server, audio, block)
      if (rows.length === 0) continue
      covered.add(audio)
      out.push(...rows)
      onChunk?.(rows)
    }
  }

  const primary = SERVERS.filter((s) => !s.fallback)
  const fallbacks = SERVERS.filter((s) => s.fallback)
  const settle = (p: Promise<void>, name: string): Promise<void> =>
    p.catch((err: Error) => console.warn(`[web-sources] justanime ${name} failed:`, err.message))

  await Promise.all(primary.map((s) => settle(run(s, ['sub', 'dub']), s.id)))
  const missing = (['sub', 'dub'] as const).filter((a) => !covered.has(a))
  if (missing.length > 0) {
    await Promise.all(fallbacks.map((s) => settle(run(s, missing), s.id)))
  }
  return out
}

export const justanime: WebSourceSite = { name: 'JustAnime', listStreams }
