import { convexClient } from './convex-client'
import { api } from '@convex/_generated/api'

const IMG = import.meta.env.VITE_TMDB_IMAGE_BASE

export type PosterSize = 'w92' | 'w154' | 'w185' | 'w342' | 'w500' | 'w780' | 'original'
export type BackdropSize = 'w300' | 'w780' | 'w1280' | 'original'
export type LogoSize = 'w45' | 'w92' | 'w154' | 'w185' | 'w300' | 'w500' | 'original'
export type ProfileSize = 'w45' | 'w185' | 'h632' | 'original'

export function tmdbImage(
  path: string | null | undefined,
  size: PosterSize | BackdropSize | LogoSize | ProfileSize = 'w500'
): string | undefined {
  if (!path) return undefined
  return `${IMG}/${size}${path}`
}

export async function tmdb<T>(
  path: string,
  params: Record<string, string | number | boolean> = {}
): Promise<T> {
  const stringParams: Record<string, string> = {}
  for (const [k, v] of Object.entries(params)) stringParams[k] = String(v)
  try {
    const result = await convexClient.action(api.tmdb.fetchEndpoint, {
      path,
      params: stringParams
    })
    return result as T
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.warn(`[tmdb] ${path}`, msg)
    throw err
  }
}

export interface TmdbList<T> {
  page: number
  total_pages: number
  total_results: number
  results: T[]
}

export interface TmdbMovie {
  id: number
  title: string
  original_title: string
  overview: string
  poster_path: string | null
  backdrop_path: string | null
  release_date: string
  vote_average: number
  genre_ids: number[]
  original_language: string
  popularity?: number
  media_type?: 'movie'
}

export interface TmdbShow {
  id: number
  name: string
  original_name: string
  overview: string
  poster_path: string | null
  backdrop_path: string | null
  first_air_date: string
  vote_average: number
  genre_ids: number[]
  original_language: string
  popularity?: number
  media_type?: 'tv'
}

export interface TmdbGenre {
  id: number
  name: string
}

export interface TmdbTrendingItem {
  id: number
  media_type: 'movie' | 'tv'
  title?: string
  name?: string
  poster_path: string | null
  backdrop_path: string | null
  popularity: number
  vote_average: number
  release_date?: string
  first_air_date?: string
}

export function trendingItemTitle(item: TmdbTrendingItem): string {
  return item.title ?? item.name ?? ''
}

export interface TmdbSearchMultiItem {
  id: number
  media_type: 'movie' | 'tv' | 'person'
  title?: string
  name?: string
  original_title?: string
  original_name?: string
  poster_path?: string | null
  profile_path?: string | null
  backdrop_path?: string | null
  popularity: number
  vote_average?: number
  release_date?: string
  first_air_date?: string
  known_for_department?: string
  known_for?: Array<{ title?: string; name?: string }>
  /** Only on person results. 0 unknown, 1 female, 2 male, 3 non-binary. */
  gender?: number
}

export function searchItemTitle(item: TmdbSearchMultiItem): string {
  return item.title ?? item.name ?? ''
}

export function searchItemYear(item: TmdbSearchMultiItem): string {
  const date = item.release_date ?? item.first_air_date ?? ''
  return date ? date.slice(0, 4) : ''
}

export function searchItemImage(item: TmdbSearchMultiItem): string | null {
  return item.media_type === 'person' ? (item.profile_path ?? null) : (item.poster_path ?? null)
}

export interface TmdbImage {
  file_path: string
  iso_639_1: string | null
  width: number
  height: number
}

export interface TmdbReleaseDate {
  certification: string
  release_date: string
  type: number
}

export interface TmdbCastMember {
  id: number
  name: string
  character: string
  order: number
  profile_path: string | null
  /** 0 unknown, 1 female, 2 male, 3 non-binary. */
  gender: number
}

export interface TmdbCrewMember {
  id: number
  name: string
  job: string
  department: string
}

export interface TmdbVideo {
  id: string
  key: string
  name: string
  site: 'YouTube' | 'Vimeo'
  type: 'Trailer' | 'Teaser' | 'Clip' | 'Behind the Scenes' | 'Featurette' | 'Bloopers'
  official: boolean
  published_at: string
}

export interface TmdbTvContentRating {
  iso_3166_1: string
  rating: string
}

export interface TmdbCreator {
  id: number
  name: string
  profile_path: string | null
}

export interface TmdbExternalIds {
  imdb_id: string | null
  tvdb_id: number | null
}

export interface TmdbSeasonSummary {
  id: number
  name: string
  overview: string
  season_number: number
  episode_count: number
  air_date: string | null
  poster_path: string | null
}

export interface TmdbEpisode {
  id: number
  name: string
  overview: string
  episode_number: number
  season_number: number
  still_path: string | null
  runtime: number | null
  air_date: string | null
  vote_average: number
}

export interface TmdbSeasonDetails {
  id: number
  name: string
  overview: string
  season_number: number
  air_date: string | null
  episodes: TmdbEpisode[]
}

export interface TmdbTvDetails extends TmdbShow {
  episode_run_time: number[]
  number_of_seasons: number
  number_of_episodes: number
  seasons: TmdbSeasonSummary[]
  last_episode_to_air?: {
    season_number: number
    episode_number: number
    runtime?: number | null
  } | null
  next_episode_to_air?: { season_number: number; episode_number: number } | null
  tagline: string
  genres: TmdbGenre[]
  images: {
    logos: TmdbImage[]
    backdrops: TmdbImage[]
    posters: TmdbImage[]
  }
  content_ratings: {
    results: TmdbTvContentRating[]
  }
  credits: {
    cast: TmdbCastMember[]
    crew: TmdbCrewMember[]
  }
  videos: {
    results: TmdbVideo[]
  }
  recommendations: TmdbList<TmdbShow>
  external_ids: TmdbExternalIds
  created_by: TmdbCreator[]
}

export function pickTvCertification(d: TmdbTvDetails): string {
  return d.content_ratings?.results.find((r) => r.iso_3166_1 === 'US')?.rating ?? ''
}

export function pickTvCreator(d: TmdbTvDetails): string {
  return d.created_by?.[0]?.name ?? ''
}

export interface TmdbMovieDetails extends TmdbMovie {
  imdb_id: string | null
  runtime: number | null
  tagline: string
  genres: TmdbGenre[]
  images: {
    logos: TmdbImage[]
    backdrops: TmdbImage[]
    posters: TmdbImage[]
  }
  release_dates: {
    results: Array<{
      iso_3166_1: string
      release_dates: TmdbReleaseDate[]
    }>
  }
  credits: {
    cast: TmdbCastMember[]
    crew: TmdbCrewMember[]
  }
  videos: {
    results: TmdbVideo[]
  }
  recommendations: TmdbList<TmdbMovie>
}

export function formatRuntime(min: number | null | undefined): string {
  if (!min) return ''
  const h = Math.floor(min / 60)
  const m = min % 60
  return h ? `${h} hr ${m} min` : `${m} min`
}

export function pickCertification(details: TmdbMovieDetails): string {
  const us = details.release_dates?.results.find((r) => r.iso_3166_1 === 'US')
  const cert = us?.release_dates.find((d) => d.certification)?.certification
  return cert || ''
}

export function pickDirector(details: TmdbMovieDetails): string {
  return details.credits?.crew.find((c) => c.job === 'Director')?.name || ''
}

export function pickStarring(details: TmdbMovieDetails, n = 3): string {
  return details.credits?.cast
    .slice(0, n)
    .map((c) => c.name)
    .join(', ')
}

export function pickEnglishLogo(details: TmdbMovieDetails): string | undefined {
  const logos = details.images?.logos ?? []
  const en = logos.find((l) => l.iso_639_1 === 'en')
  return tmdbImage(en?.file_path, 'w500')
}

export interface TmdbPersonDetails {
  id: number
  name: string
  biography: string
  birthday: string | null
  deathday: string | null
  place_of_birth: string | null
  gender: number
  known_for_department: string
  profile_path: string | null
  imdb_id: string | null
  homepage: string | null
  popularity: number
  also_known_as: string[]
}

export interface TmdbPersonCastCredit {
  id: number
  media_type: 'movie' | 'tv'
  title?: string
  name?: string
  original_title?: string
  original_name?: string
  character: string
  poster_path: string | null
  backdrop_path: string | null
  release_date?: string
  first_air_date?: string
  popularity: number
  vote_average: number
  vote_count: number
  order?: number
  credit_id: string
  episode_count?: number
}

export interface TmdbPersonCredits {
  cast: TmdbPersonCastCredit[]
  crew: Array<TmdbPersonCastCredit & { job: string; department: string }>
}

export function personCreditTitle(c: TmdbPersonCastCredit): string {
  return c.title ?? c.name ?? ''
}

export function personCreditYear(c: TmdbPersonCastCredit): string {
  const date = c.release_date ?? c.first_air_date ?? ''
  return date ? date.slice(0, 4) : ''
}

export function personAge(birthday: string | null, deathday: string | null): number | null {
  if (!birthday) return null
  const start = new Date(birthday)
  const end = deathday ? new Date(deathday) : new Date()
  let age = end.getFullYear() - start.getFullYear()
  const m = end.getMonth() - start.getMonth()
  if (m < 0 || (m === 0 && end.getDate() < start.getDate())) age--
  return age
}

const MONTHS_SHORT = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec'
]
export function formatBirthLine(d: TmdbPersonDetails): string {
  if (!d.birthday) return d.place_of_birth ?? ''
  const date = new Date(d.birthday)
  const day = date.getUTCDate()
  const month = MONTHS_SHORT[date.getUTCMonth()]
  const year = date.getUTCFullYear()
  const age = personAge(d.birthday, d.deathday)
  const ageSuffix = age !== null ? ` (${age})` : ''
  const where = d.place_of_birth ? `, ${d.place_of_birth}` : ''
  const verb = d.deathday ? 'Born' : 'Born'
  return `${verb} ${day} ${month} ${year}${ageSuffix}${where}`
}
