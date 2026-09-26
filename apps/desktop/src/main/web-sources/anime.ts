import type { WebSourceInput } from './types'

// Shared by the anime sites: they key their catalogues on AniList ids and
// label their subtitle tracks in whatever language the track is in.

const ARM = 'https://arm.haglund.dev/api/v2/themoviedb'
const TIMEOUT_MS = 10_000

interface ArmEntry {
  anilist?: unknown
  media?: unknown
  'themoviedb-season'?: unknown
}

/**
 * AniList entries ARM ties to the TMDB id, narrowed to the kind and season
 * asked for; empty for anything that isn't anime.
 */
export async function anilistCandidates(input: WebSourceInput): Promise<number[]> {
  const res = await fetch(`${ARM}?id=${input.tmdbId}`, { signal: AbortSignal.timeout(TIMEOUT_MS) })
  if (!res.ok) return []
  const rows = (await res.json()) as unknown
  if (!Array.isArray(rows)) return []
  const season = input.season ?? 1
  const out: number[] = []
  for (const row of rows as ArmEntry[]) {
    if (typeof row.anilist !== 'number') continue
    // TMDB movie and TV ids share numbers; the entry's format says which one it means.
    if ((row.media === 'MOVIE') !== (input.mediaType === 'movie')) continue
    const s = row['themoviedb-season']
    if (input.mediaType === 'tv' && typeof s === 'number' && s !== season) continue
    if (!out.includes(row.anilist)) out.push(row.anilist)
  }
  return out
}

// Languages a subtitle list names, as the flag tile's codes.
const SUBTITLE_LANGS = [
  'en',
  'es',
  'fr',
  'de',
  'it',
  'pt',
  'ja',
  'ko',
  'zh',
  'ru',
  'ar',
  'hi',
  'ta',
  'te',
  'nl',
  'pl',
  'sv',
  'tr',
  'da',
  'fi',
  'no',
  'cs',
  'hu',
  'ro',
  'bg',
  'hr',
  'sr',
  'sk',
  'uk',
  'he',
  'vi',
  'th',
  'id',
  'ms',
  'tl',
  'bn',
  'ur',
  'fa',
  'el',
  'ca'
]
let subtitleNames: [string, string][] | null = null

// Each code's name in English and in itself ("Thai", "ไทย"), longest first so
// "Indonesia" doesn't lose to a shorter name inside another label.
function namesByLength(): [string, string][] {
  if (subtitleNames) return subtitleNames
  const english = new Intl.DisplayNames(['en'], { type: 'language' })
  const names: [string, string][] = []
  for (const code of SUBTITLE_LANGS) {
    for (const name of [
      english.of(code),
      new Intl.DisplayNames([code], { type: 'language' }).of(code)
    ]) {
      if (name && name !== code) names.push([name.toLowerCase(), code])
    }
  }
  subtitleNames = names.sort((a, b) => b[0].length - a[0].length)
  return subtitleNames
}

/**
 * A track's language, read off its label ("ภาษาไทย", "Portuguese - Brazilian").
 * A site's own code is often the label's first two letters ("ภา", "po"), so it
 * only counts when it is a code the tile knows.
 */
export function subtitleLang(label: string, code?: unknown): string {
  const lower = label.toLowerCase()
  const hit = namesByLength().find(([name]) => lower.includes(name))
  if (hit) return hit[1]
  return typeof code === 'string' && SUBTITLE_LANGS.includes(code) ? code : 'und'
}
