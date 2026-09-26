import { queryOptions } from '@tanstack/react-query'

// Fights come from streamed.st's open API (no key, CORS *). Matches carry one
// or more sources; each source lists the streams actually carrying the event.
// Some sources return an empty list even for live matches — callers fall
// through to the next one.

const BASE = 'https://streamed.st'

export interface FightTeam {
  name: string
  badge?: string
}

export interface FightSource {
  source: string
  id: string
}

export interface FightMatch {
  id: string
  title: string
  category: string
  /** Unix ms. Occasionally bogus (years in the past) — treat as advisory. */
  date: number
  poster?: string
  popular?: boolean
  teams?: { home?: FightTeam | null; away?: FightTeam | null } | null
  sources: FightSource[]
}

export interface FightStream {
  id: string
  streamNo: number
  language: string
  hd: boolean
  embedUrl: string
  source: string
  viewers?: number
  /** The site listing the stream, shown under it in the picker. */
  site?: string
  /** The page the embed expects to be framed by. */
  referer?: string
  /** Known from the site; otherwise read from `language`. */
  english?: boolean
}

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`)
  if (!res.ok) throw new Error(`fights api ${res.status}`)
  return (await res.json()) as T
}

export const fightMatchesQuery = () =>
  queryOptions({
    queryKey: ['fights', 'matches'],
    queryFn: () => getJson<FightMatch[]>('/api/matches/fight'),
    staleTime: 60_000,
    refetchInterval: 120_000
  })

/** Everything currently live, all sports — callers filter to what they need. */
export const liveMatchesQuery = () =>
  queryOptions({
    queryKey: ['fights', 'live'],
    queryFn: () => getJson<FightMatch[]>('/api/matches/live'),
    staleTime: 30_000,
    refetchInterval: 60_000
  })

export const fightStreamsQuery = (source: string, id: string) =>
  queryOptions({
    queryKey: ['fights', 'streams', source, id],
    queryFn: () => getJson<FightStream[]>(`/api/stream/${source}/${id}`),
    staleTime: 60_000
  })

export function fightPosterUrl(match: FightMatch): string | undefined {
  if (match.poster) return `${BASE}${match.poster}`
  const home = match.teams?.home?.badge
  const away = match.teams?.away?.badge
  if (home && away) return `${BASE}/api/images/poster/${home}/${away}.webp`
  return undefined
}

export function isUfcTitle(title: string): boolean {
  return /\bufc\b|dana white|contender series|noche ufc/i.test(title)
}

/** How long after its start time a fight still counts as on. */
export const FIGHT_LIVE_WINDOW_MS = 7 * 60 * 60_000

/**
 * Live by the live list, or by the clock: the list trails the start time and
 * can skip an event whose streams aren't up yet, and a fight must not drop off
 * the shelf in that gap. Bogus dates (years back) fall outside the window.
 */
export function isFightLive(match: FightMatch, liveIds: Set<string>, now = Date.now()): boolean {
  if (liveIds.has(match.id)) return true
  return match.date <= now && now - match.date < FIGHT_LIVE_WINDOW_MS
}

export function isFightToday(match: FightMatch, now = Date.now()): boolean {
  const d = new Date(match.date)
  const n = new Date(now)
  return (
    d.getFullYear() === n.getFullYear() &&
    d.getMonth() === n.getMonth() &&
    d.getDate() === n.getDate()
  )
}

/** All streams across every source of a match, dead sources skipped. */
export async function fetchAllFightStreams(match: FightMatch): Promise<FightStream[]> {
  const lists = await Promise.all(
    match.sources.map((s) =>
      getJson<FightStream[]>(`/api/stream/${s.source}/${s.id}`).catch(() => [])
    )
  )
  return lists.flat().map((s) => ({ ...s, site: 'Streamed' }))
}

/**
 * The same event on the other fight sites, found by the main process: their
 * pages carry no CORS headers, and some embeds want a Referer.
 */
export async function fetchSiteFightStreams(match: FightMatch): Promise<FightStream[]> {
  const rows = await window.api.fights
    .listStreams({ title: match.title, date: match.date, sources: match.sources })
    .catch(() => [])
  return rows.map((r) => ({
    id: r.id,
    streamNo: 0,
    language: r.label,
    hd: r.hd,
    embedUrl: r.embedUrl,
    source: r.site,
    site: r.site,
    referer: r.referer,
    english: r.english
  }))
}

/** HD first, then English feeds, then whoever has the most viewers. */
export function rankStreams(streams: FightStream[]): FightStream[] {
  const english = (s: FightStream): boolean => s.english ?? /english/i.test(s.language)
  return [...streams].sort((a, b) => {
    if (a.hd !== b.hd) return a.hd ? -1 : 1
    if (english(a) !== english(b)) return english(a) ? -1 : 1
    const av = a.viewers ?? 0
    const bv = b.viewers ?? 0
    if (av !== bv) return bv - av
    return a.streamNo - b.streamNo
  })
}

export function streamKey(s: FightStream): string {
  return `${s.source}:${s.id}:${s.streamNo}`
}
