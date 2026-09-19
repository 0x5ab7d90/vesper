import { proxiedPlaylistUrl, upstreamAnswers } from '../embed-stream'
import {
  parseLanguage,
  parseQuality,
  type WebSourceInput,
  type WebSourceSite,
  type WebStream
} from './types'

// Rivestream: its site proxies a "scrapper" backend that answers plain JSON
// per provider, no key needed on the backend itself. Half the providers hand
// out URLs through Rivestream's own m3u8 proxy, which admits only requests
// carrying its origin, so every row plays with that Origin and Referer.

const API = 'https://scrapper.rivestream.app/api'
const HEADERS = { Origin: 'https://www.rivestream.app', Referer: 'https://www.rivestream.app/' }
const PROVIDER_TIMEOUT_MS = 8_000
// If the provider list can't be fetched, this is the list the site shipped with.
const FALLBACK_PROVIDERS = [
  'apex',
  'quasar',
  'vanguard',
  'aura',
  'solstice',
  'apogee',
  'rigel',
  'hector',
  'pyro',
  'borealis',
  'primevids',
  'citadel',
  'asiacloud'
]
// Two providers hand out links that expire; the site busts its CDN cache for them.
const CACHE_BUSTED = new Set(['primevids', 'citadel'])

interface RawSource {
  quality?: unknown
  url?: unknown
  format?: unknown
}

async function fetchProviders(): Promise<string[]> {
  try {
    const res = await fetch(`${API}/providers`, {
      signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS)
    })
    if (!res.ok) return FALLBACK_PROVIDERS
    const body = (await res.json()) as unknown
    return Array.isArray(body) && body.every((p) => typeof p === 'string') && body.length > 0
      ? body
      : FALLBACK_PROVIDERS
  } catch {
    return FALLBACK_PROVIDERS
  }
}

function label(provider: string): string {
  return provider.charAt(0).toUpperCase() + provider.slice(1)
}

async function fetchProvider(provider: string, input: WebSourceInput): Promise<WebStream[]> {
  const params = new URLSearchParams({ provider, id: String(input.tmdbId) })
  if (input.mediaType === 'tv') {
    params.set('season', String(input.season ?? 1))
    params.set('episode', String(input.episode ?? 1))
  }
  if (CACHE_BUSTED.has(provider)) params.set('cb', String(Math.floor(Date.now() / 3e6)))

  const res = await fetch(`${API}/provider?${params}`, {
    signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS)
  })
  if (!res.ok) throw new Error(`${provider} ${res.status}`)
  const body = (await res.json()) as { data?: { sources?: RawSource[] } | null }
  const candidates: { url: string; quality: string; lang: string }[] = []
  for (const s of body.data?.sources ?? []) {
    if (typeof s.url !== 'string' || !s.url.startsWith('https://')) continue
    if (s.format !== undefined && s.format !== 'hls') continue
    const raw = typeof s.quality === 'string' ? s.quality : ''
    candidates.push({ url: s.url, quality: parseQuality(raw), lang: parseLanguage(raw) })
  }
  const alive = await Promise.all(candidates.map((c) => upstreamAnswers(c.url, HEADERS)))
  const out: WebStream[] = []
  // A provider may list the same quality and language several times over
  // (different encodes of one release); the picker can't tell them apart, so
  // only the first of each pair is listed.
  const seen = new Set<string>()
  for (const [i, c] of candidates.entries()) {
    if (!alive[i]) continue
    const key = `${c.quality}:${c.lang}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push({
      id: `rive:${provider}:${c.quality}:${c.lang}:${out.length}`,
      server: label(provider),
      lang: c.lang,
      quality: c.quality,
      url: await proxiedPlaylistUrl(c.url, HEADERS)
    })
  }
  return out
}

async function listStreams(
  input: WebSourceInput,
  onChunk?: (rows: WebStream[]) => void
): Promise<WebStream[]> {
  const providers = await fetchProviders()
  const out: WebStream[] = []
  await Promise.all(
    providers.map(async (p) => {
      try {
        const rows = await fetchProvider(p, input)
        if (rows.length === 0) return
        out.push(...rows)
        onChunk?.(rows)
      } catch (err) {
        console.warn(`[web-sources] rivestream ${p} failed:`, (err as Error).message)
      }
    })
  )
  return out
}

export const rivestream: WebSourceSite = { name: 'Rivestream', listStreams }
