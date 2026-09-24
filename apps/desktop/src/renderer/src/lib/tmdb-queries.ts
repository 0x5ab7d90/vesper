import { infiniteQueryOptions, queryOptions } from '@tanstack/react-query'
import {
  tmdb,
  type TmdbList,
  type TmdbMovie,
  type TmdbMovieDetails,
  type TmdbPersonCredits,
  type TmdbPersonDetails,
  type TmdbSearchMultiItem,
  type TmdbSeasonDetails,
  type TmdbShow,
  type TmdbTrendingItem,
  type TmdbTvDetails
} from './tmdb'
import { fanartMovie, fanartTv, type FanartMovie, type FanartTv } from './fanart'

const GENRES = {
  scifi: 878,
  horror: 27,
  comedy: 35,
  animation: 16,
  drama: 18,
  action: 28,
  thriller: 53,
  romance: 10749,
  fantasy: 14,
  crime: 80,
  mystery: 9648,
  adventure: 12,
  family: 10751
} as const

export type GenreKey = keyof typeof GENRES
export const GENRE_ID = (k: GenreKey): number => GENRES[k]

function lastNDays(n: number): { gte: string; lte: string } {
  const now = new Date()
  const past = new Date(now)
  past.setDate(now.getDate() - n)
  const fmt = (d: Date): string => d.toISOString().slice(0, 10)
  return { gte: fmt(past), lte: fmt(now) }
}

export const trendingMoviesQuery = () =>
  queryOptions({
    queryKey: ['tmdb', 'trending', 'movie', 'week'],
    queryFn: () => tmdb<TmdbList<TmdbMovie>>('/trending/movie/week'),
    staleTime: 30 * 60_000
  })

export const trendingTvQuery = () =>
  queryOptions({
    queryKey: ['tmdb', 'trending', 'tv', 'week'],
    queryFn: () => tmdb<TmdbList<TmdbShow>>('/trending/tv/week'),
    staleTime: 30 * 60_000
  })

export const topRatedMoviesQuery = () =>
  queryOptions({
    queryKey: ['tmdb', 'movie', 'top_rated'],
    queryFn: () => tmdb<TmdbList<TmdbMovie>>('/movie/top_rated'),
    staleTime: 60 * 60_000
  })

export const popularMoviesQuery = (page = 1) =>
  queryOptions({
    queryKey: ['tmdb', 'movie', 'popular', page],
    queryFn: () => tmdb<TmdbList<TmdbMovie>>('/movie/popular', { page }),
    staleTime: 60 * 60_000
  })

export const topMoviesRecentQuery = () => {
  const now = new Date()
  const past = new Date(now)
  past.setMonth(now.getMonth() - 3)
  const fmt = (d: Date): string => d.toISOString().slice(0, 10)
  return queryOptions({
    queryKey: ['tmdb', 'movie', 'discover', 'top-recent', fmt(past), fmt(now)],
    queryFn: () =>
      tmdb<TmdbList<TmdbMovie>>('/discover/movie', {
        sort_by: 'vote_average.desc',
        'primary_release_date.gte': fmt(past),
        'primary_release_date.lte': fmt(now),
        'vote_count.gte': 100,
        include_adult: false
      }),
    staleTime: 60 * 60_000
  })
}

export const topTvRecentQuery = () => {
  const now = new Date()
  const past = new Date(now)
  past.setMonth(now.getMonth() - 3)
  const fmt = (d: Date): string => d.toISOString().slice(0, 10)
  return queryOptions({
    queryKey: ['tmdb', 'tv', 'discover', 'top-recent', fmt(past), fmt(now)],
    queryFn: () =>
      tmdb<TmdbList<TmdbShow>>('/discover/tv', {
        sort_by: 'vote_average.desc',
        'first_air_date.gte': fmt(past),
        'first_air_date.lte': fmt(now),
        'vote_count.gte': 100,
        include_adult: false
      }),
    staleTime: 60 * 60_000
  })
}

export const trendingAllQuery = () =>
  queryOptions({
    queryKey: ['tmdb', 'trending', 'all', 'week'],
    queryFn: () => tmdb<TmdbList<TmdbTrendingItem>>('/trending/all/week'),
    staleTime: 30 * 60_000
  })

export const newMoviesRecentQuery = () => {
  const { gte, lte } = lastNDays(7)
  return queryOptions({
    queryKey: ['tmdb', 'movie', 'discover', 'new', gte, lte],
    queryFn: () =>
      tmdb<TmdbList<TmdbMovie>>('/discover/movie', {
        sort_by: 'popularity.desc',
        'primary_release_date.gte': gte,
        'primary_release_date.lte': lte,
        'vote_count.gte': 5,
        include_adult: false
      }),
    staleTime: 30 * 60_000
  })
}

export const newTvRecentQuery = () => {
  const { gte, lte } = lastNDays(7)
  return queryOptions({
    queryKey: ['tmdb', 'tv', 'discover', 'new', gte, lte],
    queryFn: () =>
      tmdb<TmdbList<TmdbShow>>('/discover/tv', {
        sort_by: 'popularity.desc',
        'first_air_date.gte': gte,
        'first_air_date.lte': lte,
        'vote_count.gte': 5,
        include_adult: false
      }),
    staleTime: 30 * 60_000
  })
}

export const genreMoviesQuery = (genre: GenreKey) =>
  queryOptions({
    queryKey: ['tmdb', 'movie', 'discover', 'genre', genre],
    queryFn: () =>
      tmdb<TmdbList<TmdbMovie>>('/discover/movie', {
        with_genres: GENRES[genre],
        sort_by: 'popularity.desc',
        'vote_count.gte': 100,
        include_adult: false
      }),
    staleTime: 6 * 60 * 60_000
  })

export interface ExploreGenre {
  id: number
  label: string
}

export const EXPLORE_MOVIE_GENRES: ExploreGenre[] = [
  { id: 28, label: 'Action' },
  { id: 12, label: 'Adventure' },
  { id: 16, label: 'Animation' },
  { id: 35, label: 'Comedy' },
  { id: 80, label: 'Crime' },
  { id: 99, label: 'Documentary' },
  { id: 18, label: 'Drama' },
  { id: 10751, label: 'Family' },
  { id: 14, label: 'Fantasy' },
  { id: 36, label: 'History' },
  { id: 27, label: 'Horror' },
  { id: 10402, label: 'Music' },
  { id: 9648, label: 'Mystery' },
  { id: 10749, label: 'Romance' },
  { id: 878, label: 'Sci-Fi' },
  { id: 53, label: 'Thriller' },
  { id: 10752, label: 'War' },
  { id: 37, label: 'Western' }
]

export const EXPLORE_TV_GENRES: ExploreGenre[] = [
  { id: 10759, label: 'Action & Adventure' },
  { id: 16, label: 'Animation' },
  { id: 35, label: 'Comedy' },
  { id: 80, label: 'Crime' },
  { id: 99, label: 'Documentary' },
  { id: 18, label: 'Drama' },
  { id: 10751, label: 'Family' },
  { id: 10762, label: 'Kids' },
  { id: 9648, label: 'Mystery' },
  { id: 10764, label: 'Reality' },
  { id: 10765, label: 'Sci-Fi & Fantasy' },
  { id: 10768, label: 'War & Politics' },
  { id: 37, label: 'Western' }
]

export const EXPLORE_SORTS = [
  { value: 'popular', label: 'Popular' },
  { value: 'top-rated', label: 'Top rated' },
  { value: 'lowest-rated', label: 'Lowest rated' },
  { value: 'newest', label: 'New releases' }
] as const

export type ExploreSort = (typeof EXPLORE_SORTS)[number]['value']

const TMDB_MAX_PAGE = 500
// TMDB pages are a fixed 20 items, so each logical "load more" fetches a batch of
// pages in parallel and flattens them into one 60-item step.
const EXPLORE_BATCH = 3

/** How many cards the first batch renders — the skeleton grid reserves exactly this many. */
export const EXPLORE_PAGE_SIZE = EXPLORE_BATCH * 20

export const discoverInfiniteQuery = (type: 'movie' | 'tv', sort: ExploreSort, genres: number[]) => {
  const dateField = type === 'movie' ? 'primary_release_date' : 'first_air_date'
  const today = new Date().toISOString().slice(0, 10)
  const params: Record<string, string | number | boolean> = { include_adult: false }
  if (genres.length > 0) params.with_genres = genres.join(',')
  if (sort === 'popular') {
    params.sort_by = 'popularity.desc'
  } else if (sort === 'top-rated') {
    params.sort_by = 'vote_average.desc'
    params['vote_count.gte'] = 200
  } else if (sort === 'lowest-rated') {
    // Same vote floor as top rated, so the bottom is genuinely panned titles rather than
    // obscure ones with two stray votes.
    params.sort_by = 'vote_average.asc'
    params['vote_count.gte'] = 200
  } else {
    params.sort_by = `${dateField}.desc`
    params[`${dateField}.lte`] = today
    params['vote_count.gte'] = 20
  }
  return infiniteQueryOptions({
    queryKey: ['tmdb', 'discover', type, 'explore', `batch${EXPLORE_BATCH}`, sort, genres.join(',')],
    queryFn: async ({ pageParam }): Promise<TmdbList<TmdbMovie | TmdbShow>> => {
      const first = (pageParam - 1) * EXPLORE_BATCH + 1
      const pages = await Promise.all(
        Array.from({ length: EXPLORE_BATCH }, (_, i) => first + i)
          .filter((p) => p <= TMDB_MAX_PAGE)
          .map((p) => tmdb<TmdbList<TmdbMovie | TmdbShow>>(`/discover/${type}`, { ...params, page: p }))
      )
      const head = pages[0]
      return {
        page: pageParam,
        total_pages: head?.total_pages ?? 0,
        total_results: head?.total_results ?? 0,
        results: pages.flatMap((p) => p.results)
      }
    },
    initialPageParam: 1,
    getNextPageParam: (last) => {
      const maxPage = Math.min(last.total_pages, TMDB_MAX_PAGE)
      return last.page * EXPLORE_BATCH < maxPage ? last.page + 1 : undefined
    },
    staleTime: 30 * 60_000
  })
}

export const tvDetailsQuery = (id: number) =>
  queryOptions({
    queryKey: ['tmdb', 'tv', id, 'details'],
    queryFn: () =>
      tmdb<TmdbTvDetails>(`/tv/${id}`, {
        append_to_response: 'images,content_ratings,credits,videos,recommendations,external_ids',
        include_image_language: 'en,null'
      }),
    staleTime: 60 * 60_000,
    enabled: Number.isFinite(id) && id > 0
  })

export const tvSeasonQuery = (tvId: number, seasonNumber: number) =>
  queryOptions({
    queryKey: ['tmdb', 'tv', tvId, 'season', seasonNumber],
    queryFn: () => tmdb<TmdbSeasonDetails>(`/tv/${tvId}/season/${seasonNumber}`),
    staleTime: 60 * 60_000,
    enabled: Number.isFinite(tvId) && tvId > 0 && Number.isFinite(seasonNumber) && seasonNumber >= 0
  })

export const movieDetailsQuery = (id: number) =>
  queryOptions({
    queryKey: ['tmdb', 'movie', id, 'details'],
    queryFn: () =>
      tmdb<TmdbMovieDetails>(`/movie/${id}`, {
        append_to_response: 'images,release_dates,credits,videos,recommendations',
        include_image_language: 'en,null'
      }),
    staleTime: 60 * 60_000,
    enabled: Number.isFinite(id) && id > 0
  })

export const personDetailsQuery = (id: number) =>
  queryOptions({
    queryKey: ['tmdb', 'person', id, 'details'],
    queryFn: () => tmdb<TmdbPersonDetails>(`/person/${id}`),
    staleTime: 24 * 60 * 60_000,
    enabled: Number.isFinite(id) && id > 0
  })

export const personCombinedCreditsQuery = (id: number) =>
  queryOptions({
    queryKey: ['tmdb', 'person', id, 'combined_credits'],
    queryFn: () => tmdb<TmdbPersonCredits>(`/person/${id}/combined_credits`),
    staleTime: 24 * 60 * 60_000,
    enabled: Number.isFinite(id) && id > 0
  })

export const searchMultiQuery = (query: string) =>
  queryOptions({
    queryKey: ['tmdb', 'search', 'multi', query],
    queryFn: () =>
      tmdb<TmdbList<TmdbSearchMultiItem>>('/search/multi', {
        query,
        include_adult: false
      }),
    staleTime: 5 * 60_000,
    enabled: query.trim().length > 0
  })

export const searchMoviesQuery = (query: string) =>
  queryOptions({
    queryKey: ['tmdb', 'search', 'movie', query],
    queryFn: () =>
      tmdb<TmdbList<TmdbMovie>>('/search/movie', {
        query,
        include_adult: false
      }),
    staleTime: 5 * 60_000,
    enabled: query.trim().length > 0
  })

export const searchTvQuery = (query: string) =>
  queryOptions({
    queryKey: ['tmdb', 'search', 'tv', query],
    queryFn: () =>
      tmdb<TmdbList<TmdbShow>>('/search/tv', {
        query,
        include_adult: false
      }),
    staleTime: 5 * 60_000,
    enabled: query.trim().length > 0
  })

export const searchPeopleQuery = (query: string) =>
  queryOptions({
    queryKey: ['tmdb', 'search', 'person', query],
    queryFn: () =>
      tmdb<TmdbList<TmdbSearchMultiItem>>('/search/person', {
        query,
        include_adult: false
      }),
    staleTime: 5 * 60_000,
    enabled: query.trim().length > 0
  })

export const trendingAllDayQuery = () =>
  queryOptions({
    queryKey: ['tmdb', 'trending', 'all', 'day'],
    queryFn: () => tmdb<TmdbList<TmdbTrendingItem>>('/trending/all/day'),
    staleTime: 30 * 60_000
  })

export const fanartMovieQuery = (idOrImdb: string | number | undefined) =>
  queryOptions({
    queryKey: ['fanart', 'movie', String(idOrImdb ?? '')],
    queryFn: (): Promise<FanartMovie | null> => fanartMovie(idOrImdb as string | number),
    staleTime: 24 * 60 * 60_000,
    enabled: !!idOrImdb
  })

export const fanartTvQuery = (tvdbId: string | number | undefined) =>
  queryOptions({
    queryKey: ['fanart', 'tv', String(tvdbId ?? '')],
    queryFn: (): Promise<FanartTv | null> => fanartTv(tvdbId as string | number),
    staleTime: 24 * 60 * 60_000,
    enabled: !!tvdbId
  })

export const movieRecommendationsQuery = (id: number, page = 1) =>
  queryOptions({
    queryKey: ['tmdb', 'movie', id, 'recommendations', page],
    queryFn: () => tmdb<TmdbList<TmdbMovie>>(`/movie/${id}/recommendations`, { page }),
    staleTime: 24 * 60 * 60_000,
    enabled: Number.isFinite(id) && id > 0
  })

export const movieSimilarQuery = (id: number, page = 1) =>
  queryOptions({
    queryKey: ['tmdb', 'movie', id, 'similar', page],
    queryFn: () => tmdb<TmdbList<TmdbMovie>>(`/movie/${id}/similar`, { page }),
    staleTime: 24 * 60 * 60_000,
    enabled: Number.isFinite(id) && id > 0
  })

export const tvRecommendationsQuery = (id: number, page = 1) =>
  queryOptions({
    queryKey: ['tmdb', 'tv', id, 'recommendations', page],
    queryFn: () => tmdb<TmdbList<TmdbShow>>(`/tv/${id}/recommendations`, { page }),
    staleTime: 24 * 60 * 60_000,
    enabled: Number.isFinite(id) && id > 0
  })

export const tvSimilarQuery = (id: number, page = 1) =>
  queryOptions({
    queryKey: ['tmdb', 'tv', id, 'similar', page],
    queryFn: () => tmdb<TmdbList<TmdbShow>>(`/tv/${id}/similar`, { page }),
    staleTime: 24 * 60 * 60_000,
    enabled: Number.isFinite(id) && id > 0
  })
