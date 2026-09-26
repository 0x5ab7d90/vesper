import { BrowserWindow, session } from 'electron'
import { unzipSync } from 'zlib'
import {
  CHROME_UA,
  proxiedFileUrl,
  proxiedPlaylistUrl,
  registerRelayUnwrapper,
  upstreamAnswers,
  type UpstreamHeaders
} from '../embed-stream'
import { anilistCandidates, subtitleLang } from './anime'
import type { WebSourceInput, WebSourceSite, WebStream, WebSubtitle } from './types'

// Miruro: an anime site keyed on AniList ids, with several upstream providers
// per episode, each carrying sub and dub. Its API sits behind one GET
// endpoint whose query is a base64url JSON envelope and whose reply is
// gzipped, base64url'd and XORed with a key from the site's env2.js. Cloudflare
// refuses that endpoint to anything but a page on the site, so the calls run
// inside a hidden window parked on the site's bare /health route.
//
// Titles arrive as TMDB ids. ARM maps those to AniList entries, and Miruro's
// own mapping says which TMDB season each entry is and how far into it the
// entry starts, so a split cour (one TMDB season, two AniList entries) lands
// on the right one.
//
// A playlist plays straight from its host with the Referer the site names.
// Some of those hosts are off the air to direct requests, and those playlists
// go through Miruro's own stream proxy instead, the way its player does. That
// proxy takes the upstream URL and Referer XORed into the path and rewrites
// every reference through itself, segments included, and it is slow enough to
// stall playback; the segment hosts answer directly, so the header proxy reads
// their real URLs back out and keeps Miruro's only as the fallback.

const SITE = 'https://www.miruro.to'
const TIMEOUT_MS = 10_000
const CACHE_MS = 10 * 60_000
const EPISODES_CACHE_MAX = 8
const PIPE_IDLE_MS = 30_000
const PIPE_PARTITION = 'miruro'

// What env2.js carried when this was written; it is fetched live, and these
// only stand in when that fails.
const FALLBACK_ENV = {
  pipeKey: '71951034f8fbcf53d89db52ceb3dc22c',
  proxies: ['https://s1.watami.win/', 'https://s1.piltover.li/'],
  proxyKey: 'a54d389c18527d9fd3e7f0643e27edbe'
}

type Audio = 'sub' | 'dub'

interface SiteEnv {
  pipeKey: Buffer
  proxies: string[]
  proxyKey: Buffer
}

interface ProviderConfig {
  capabilities?: { sub?: boolean; ssub?: boolean }
  visible?: boolean
  player?: string
  proxy?: { rotate?: boolean } | false | null
  hls?: {
    origin?: { enabled?: boolean; url?: string }
    query?: { enabled?: boolean; params?: Record<string, string> }
  }
}

interface SiteConfig {
  streaming?: Record<string, ProviderConfig>
}

interface RawEpisode {
  id?: unknown
  number?: unknown
}

interface Episodes {
  mappings?: { tmdbSeason?: unknown; tmdbOffset?: unknown }
  providers?: Record<string, { episodes?: Partial<Record<string, RawEpisode[]>> }>
}

interface RawSources {
  streams?: { url?: unknown; type?: unknown; referer?: unknown; server?: unknown }[]
  subtitles?: {
    file?: unknown
    label?: unknown
    language?: unknown
    kind?: unknown
    default?: unknown
  }[]
}

interface Cached<T> {
  at: number
  value: Promise<T>
}

/** A load shared by every caller for CACHE_MS; a failed one is dropped so the next caller retries. */
function remembered<T>(load: () => Promise<T>): () => Promise<T> {
  let entry: Cached<T> | null = null
  return () => {
    if (!entry || Date.now() - entry.at >= CACHE_MS) {
      const next: Cached<T> = { at: Date.now(), value: load() }
      next.value.catch(() => {
        if (entry === next) entry = null
      })
      entry = next
    }
    return entry.value
  }
}

function hexKey(v: unknown, fallback: string): Buffer {
  return Buffer.from(typeof v === 'string' && /^[0-9a-f]{2,}$/i.test(v) ? v : fallback, 'hex')
}

async function loadEnv(): Promise<SiteEnv> {
  let raw: Record<string, unknown> = {}
  try {
    const res = await fetch(`${SITE}/env2.js`, { signal: AbortSignal.timeout(TIMEOUT_MS) })
    const text = await res.text()
    // window.env=JSON.parse("{...}"): a JSON string holding the JSON object.
    const start = text.indexOf('JSON.parse(')
    const end = text.lastIndexOf(')')
    if (res.ok && start !== -1 && end > start) {
      raw = JSON.parse(JSON.parse(text.slice(start + 'JSON.parse('.length, end)) as string)
    }
  } catch (err) {
    console.warn('[web-sources] miruro env2.js failed:', (err as Error).message)
  }
  const proxies = [raw.VITE_PROXY_A, raw.VITE_PROXY_B]
    .filter((p): p is string => typeof p === 'string' && p.startsWith('https://'))
    .map((p) => (p.endsWith('/') ? p : `${p}/`))
  relayEnv = {
    pipeKey: hexKey(raw.VITE_PIPE_OBF_KEY, FALLBACK_ENV.pipeKey),
    proxies: proxies.length > 0 ? proxies : FALLBACK_ENV.proxies,
    proxyKey: hexKey(raw.VITE_PROXY_OBF_KEY, FALLBACK_ENV.proxyKey)
  }
  return relayEnv
}

// The last env loaded, for reading relay URLs as the header proxy meets them.
let relayEnv: SiteEnv | null = null

const siteEnv = remembered(loadEnv)

// ── The pipe ────────────────────────────────────────────────────────────────

let pipeWindow: Promise<BrowserWindow> | null = null
let idleTimer: ReturnType<typeof setTimeout> | null = null

function openPipeWindow(): Promise<BrowserWindow> {
  const ses = session.fromPartition(PIPE_PARTITION)
  ses.setUserAgent(CHROME_UA)
  const win = new BrowserWindow({
    show: false,
    webPreferences: {
      partition: PIPE_PARTITION,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  })
  win.webContents.setAudioMuted(true)
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  return win.loadURL(`${SITE}/health`).then(
    () => win,
    (err: Error) => {
      if (!win.isDestroyed()) win.destroy()
      throw err
    }
  )
}

/** Closes the hidden window the API calls run in; the next call opens it again. */
export function closeMiruroPipe(): void {
  if (idleTimer) clearTimeout(idleTimer)
  idleTimer = null
  const current = pipeWindow
  pipeWindow = null
  void current?.then(
    (win) => {
      if (!win.isDestroyed()) win.destroy()
    },
    () => undefined
  )
}

async function pipe(): Promise<BrowserWindow> {
  if (!pipeWindow) {
    const opening = openPipeWindow()
    pipeWindow = opening
    opening.catch(() => {
      if (pipeWindow === opening) pipeWindow = null
    })
  }
  const current = pipeWindow
  const win = await current
  if (!win.isDestroyed()) return win
  // Gone from under us (its renderer crashed, say): open a fresh one.
  if (pipeWindow === current) pipeWindow = null
  return pipe()
}

async function pipeGet<T>(path: string, query: Record<string, string | number>): Promise<T> {
  const [env, win] = await Promise.all([siteEnv(), pipe()])
  if (idleTimer) clearTimeout(idleTimer)
  idleTimer = setTimeout(closeMiruroPipe, PIPE_IDLE_MS)

  const envelope = { path, method: 'GET', query, body: null }
  const target = `/api/secure/pipe?e=${Buffer.from(JSON.stringify(envelope)).toString('base64url')}`
  const reply = (await win.webContents.executeJavaScript(
    `fetch(${JSON.stringify(target)}, { signal: AbortSignal.timeout(${TIMEOUT_MS}) })
      .then(async (r) => ({ status: r.status, obfuscated: r.headers.get('x-obfuscated'), body: await r.text() }))`
  )) as { status: number; obfuscated: string | null; body: string }
  if (reply.status !== 200) throw new Error(`${path} ${reply.status}`)
  if (!reply.obfuscated) return JSON.parse(reply.body) as T
  let bytes = Buffer.from(reply.body, 'base64url')
  // "1" is only gzipped; "2" is gzipped and XORed with the pipe key.
  if (reply.obfuscated === '2')
    bytes = Buffer.from(bytes.map((b, i) => b ^ env.pipeKey[i % env.pipeKey.length]))
  return JSON.parse(unzipSync(bytes).toString('utf8')) as T
}

const siteConfig = remembered(() => pipeGet<SiteConfig>('config', {}))

// Kept so the next episode of a show doesn't fetch its whole list again.
const episodesCache = new Map<number, Cached<Episodes>>()

function episodesFor(anilistId: number): Promise<Episodes> {
  const hit = episodesCache.get(anilistId)
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value
  const entry: Cached<Episodes> = {
    at: Date.now(),
    value: pipeGet<Episodes>('episodes', { anilistId: String(anilistId) })
  }
  entry.value.catch(() => {
    if (episodesCache.get(anilistId) === entry) episodesCache.delete(anilistId)
  })
  episodesCache.delete(anilistId)
  episodesCache.set(anilistId, entry)
  // Oldest out first; a long runner's list is a few megabytes.
  while (episodesCache.size > EPISODES_CACHE_MAX) {
    episodesCache.delete(episodesCache.keys().next().value as number)
  }
  return entry.value
}

// ── From TMDB to an AniList episode ─────────────────────────────────────────

/** The entry's own episode number for the TMDB one, or null when the entry doesn't cover it. */
function localEpisode(input: WebSourceInput, eps: Episodes): number | null {
  if (input.mediaType === 'movie') return 1
  const episode = input.episode ?? 1
  const tmdbSeason = eps.mappings?.tmdbSeason
  // Long runners (One Piece) are numbered straight through on TMDB too.
  if (tmdbSeason === 'absolute') return episode
  if (tmdbSeason != null && Number(tmdbSeason) !== (input.season ?? 1)) return null
  const offset = typeof eps.mappings?.tmdbOffset === 'number' ? eps.mappings.tmdbOffset : 0
  const local = episode - offset
  return local >= 1 ? local : null
}

function episodeId(eps: Episodes, provider: string, audio: Audio, n: number): string | null {
  const list = eps.providers?.[provider]?.episodes?.[audio]
  const hit = Array.isArray(list) ? list.find((e) => e.number === n) : undefined
  return typeof hit?.id === 'string' ? hit.id : null
}

async function findEpisode(
  input: WebSourceInput
): Promise<{ anilistId: number; eps: Episodes; number: number } | null> {
  const ids = await anilistCandidates(input)
  const found = await Promise.all(
    ids.map(async (anilistId) => {
      try {
        const eps = await episodesFor(anilistId)
        const n = localEpisode(input, eps)
        if (n === null) return null
        const covered = Object.keys(eps.providers ?? {}).some(
          (p) => episodeId(eps, p, 'sub', n) || episodeId(eps, p, 'dub', n)
        )
        return covered ? { anilistId, eps, number: n } : null
      } catch (err) {
        console.warn(`[web-sources] miruro episodes ${anilistId} failed:`, (err as Error).message)
        return null
      }
    })
  )
  return found.find((f) => f !== null) ?? null
}

/**
 * The AniList entry and episode a TMDB episode is, for the other anime sites
 * keyed on the same ids. Miruro's mapping is the one source that knows where a
 * split cour starts inside a TMDB season; when it can't be asked or has no
 * answer, ARM's first entry stands, with the episode as TMDB numbers it.
 */
export async function resolveAnilistEpisode(
  input: WebSourceInput
): Promise<{ anilistId: number; episode: number } | null> {
  try {
    const match = await findEpisode(input)
    if (match) return { anilistId: match.anilistId, episode: match.number }
  } catch (err) {
    console.warn('[web-sources] miruro mapping failed:', (err as Error).message)
  }
  const [first] = await anilistCandidates(input)
  if (first === undefined) return null
  return { anilistId: first, episode: input.mediaType === 'movie' ? 1 : (input.episode ?? 1) }
}

// ── Streams ─────────────────────────────────────────────────────────────────

function xorBase64url(text: string, key: Buffer): string {
  const bytes = Buffer.from(text, 'utf8')
  return Buffer.from(bytes.map((b, i) => b ^ key[i % key.length])).toString('base64url')
}

/** A URL through Miruro's stream proxy, the same shape its player builds. */
function siteProxied(
  base: string,
  env: SiteEnv,
  kind: 'playlist' | 'subtitle',
  url: string,
  referer: string,
  rotate: boolean
): string {
  const ref = referer ? `~${xorBase64url(referer, env.proxyKey)}` : rotate ? '~' : ''
  const suffix = kind === 'playlist' ? '/pl.m3u8' : '/sub.vtt'
  return `${base}${xorBase64url(url, env.proxyKey)}${ref}${rotate ? '~anon' : ''}${suffix}`
}

// The upstream URL inside one of the stream proxy's own, for the header proxy
// to send segments straight to their host.
function unwrapSiteProxied(url: string): string | null {
  const env = relayEnv
  const base = env?.proxies.find((p) => url.startsWith(p))
  if (!env || !base) return null
  const token = /^[^~/]+/.exec(url.slice(base.length))?.[0]
  if (!token) return null
  const bytes = Buffer.from(token, 'base64url')
  const inner = Buffer.from(bytes.map((b, i) => b ^ env.proxyKey[i % env.proxyKey.length]))
  const decoded = inner.toString('utf8')
  return decoded.startsWith('https://') ? decoded : null
}

registerRelayUnwrapper(unwrapSiteProxied)

// Some providers' playlists answer only on a mirror host the site names in its
// config, with a query flag on the playlist itself.
function applyOrigin(url: string, cfg: ProviderConfig): string {
  const origin = cfg.hls?.origin
  if (!origin?.enabled || !origin.url) return url
  try {
    const target = new URL(url)
    const mirror = new URL(origin.url)
    target.protocol = mirror.protocol
    target.host = mirror.host
    if (cfg.hls?.query?.enabled) {
      for (const [k, v] of Object.entries(cfg.hls.query.params ?? {})) target.searchParams.set(k, v)
    }
    return target.toString()
  } catch {
    return url
  }
}

function label(provider: string): string {
  return provider.charAt(0).toUpperCase() + provider.slice(1)
}

async function fetchVariant(
  provider: string,
  cfg: ProviderConfig,
  audio: Audio,
  id: string,
  anilistId: number,
  env: SiteEnv
): Promise<WebStream[]> {
  // Soft subs (separate tracks) where the provider has them, burned-in otherwise.
  const category = audio === 'sub' && cfg.capabilities?.ssub ? 'ssub' : audio
  const body = await pipeGet<RawSources>('sources', {
    episodeId: id,
    provider,
    category,
    anilistId
  })
  const proxied = !!cfg.proxy
  const rotate = !!(cfg.proxy && cfg.proxy.rotate)

  const candidates: { url: string; referer: string; server: string }[] = []
  for (const s of body.streams ?? []) {
    if (s.type !== 'hls' || typeof s.url !== 'string' || !s.url.startsWith('https://')) continue
    // Two server names can point at one playlist; the picker can't tell them apart.
    if (candidates.some((c) => c.url === s.url)) continue
    candidates.push({
      url: s.url,
      referer: typeof s.referer === 'string' ? s.referer : '',
      server: typeof s.server === 'string' ? s.server : ''
    })
  }

  // The playlist's own host first; the site's proxies, one after the other,
  // when the host won't answer. Every hop carries the Referer, since segments
  // read back out of a proxied playlist go to their hosts directly.
  const bases = proxied ? env.proxies : []
  const resolved = await Promise.all(
    candidates.map(async (c) => {
      const headers: UpstreamHeaders = c.referer ? { Referer: c.referer } : {}
      if (await upstreamAnswers(c.url, headers)) return { ...c, headers, base: null }
      const target = applyOrigin(c.url, cfg)
      for (const base of bases) {
        const url = siteProxied(base, env, 'playlist', target, c.referer, rotate)
        if (await upstreamAnswers(url, headers)) return { ...c, url, headers, base }
      }
      return null
    })
  )

  const out: WebStream[] = []
  for (const r of resolved) {
    if (!r) continue
    const subtitles: WebSubtitle[] = []
    const files = new Set<string>()
    for (const t of body.subtitles ?? []) {
      if (typeof t.file !== 'string' || !t.file.startsWith('https://')) continue
      if (t.kind === 'thumbnails' || files.has(t.file)) continue
      files.add(t.file)
      const trackLabel = typeof t.label === 'string' ? t.label : ''
      // Straight from its host, the site's proxy when that fails.
      const relay = proxied
        ? siteProxied(r.base ?? env.proxies[0], env, 'subtitle', t.file, r.referer, rotate)
        : undefined
      subtitles.push({
        lang: subtitleLang(trackLabel, t.language),
        label: trackLabel,
        url: await proxiedFileUrl(t.file, r.headers, relay),
        default: t.default === true
      })
    }
    const name = [label(provider), r.server].filter(Boolean).join(' ')
    out.push({
      id: `miruro:${provider}:${category}:${out.length}`,
      server: `${name} · ${audio === 'dub' ? 'Dub' : 'Sub'}`,
      // The dubs Miruro carries are English; a sub keeps the Japanese audio.
      lang: audio === 'dub' ? 'en' : 'ja',
      quality: 'Auto',
      url: await proxiedPlaylistUrl(r.url, r.headers),
      subtitles: subtitles.length > 0 ? subtitles : undefined
    })
  }
  return out
}

async function listStreams(
  input: WebSourceInput,
  onChunk?: (rows: WebStream[]) => void
): Promise<WebStream[]> {
  const match = await findEpisode(input)
  if (!match) return []
  const [config, env] = await Promise.all([siteConfig(), siteEnv()])

  const jobs: Promise<void>[] = []
  const out: WebStream[] = []
  for (const [provider, cfg] of Object.entries(config.streaming ?? {})) {
    // Embed-only providers play in the site's iframe; there's no playlist to hand over.
    if (!cfg.visible || cfg.player !== 'native') continue
    for (const audio of ['sub', 'dub'] as const) {
      const id = episodeId(match.eps, provider, audio, match.number)
      if (!id) continue
      jobs.push(
        fetchVariant(provider, cfg, audio, id, match.anilistId, env).then(
          (rows) => {
            if (rows.length === 0) return
            out.push(...rows)
            onChunk?.(rows)
          },
          (err: Error) =>
            console.warn(`[web-sources] miruro ${provider} ${audio} failed:`, err.message)
        )
      )
    }
  }
  await Promise.all(jobs)
  return out
}

export const miruro: WebSourceSite = { name: 'Miruro', listStreams }
