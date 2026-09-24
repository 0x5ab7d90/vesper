import { useEffect, useRef, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useSuspenseQuery } from '@tanstack/react-query'
import type { QueryClient } from '@tanstack/react-query'
import { useQuery as useConvexQuery } from 'convex/react'
import { useScrollContainer } from '@renderer/lib/scroll-container'
import { ContinueCard } from '@renderer/components/media/continue-card'
import { FightsSection } from '@renderer/components/fights/fights-section'
import { PosterRow, type PosterRowItem } from '@renderer/components/media/poster-row'
import { FeaturedCarousel } from '@renderer/components/media/featured-carousel'
import { ScrollSection } from '@renderer/components/ui/scroll-section'
import { MediaContextMenu } from '@renderer/components/library/media-context-menu'
import { api } from '@convex/_generated/api'
import { useMutation } from 'convex/react'
import { useContinueRow, type ContinueRow } from '@renderer/hooks/use-continue-row'
import { useTvMode } from '@renderer/lib/tv-mode'
import { TvHome } from '@renderer/components/tv/tv-home'
import {
  trendingMoviesQuery,
  trendingAllQuery,
  topMoviesRecentQuery,
  topTvRecentQuery,
  genreMoviesQuery,
  movieDetailsQuery,
  type GenreKey
} from '@renderer/lib/tmdb-queries'
import { GENRE_ROWS } from '@renderer/lib/home-rows'
import {
  fanartMovieQuery,
  imdbRatingsQuery,
  pickMovieHeroLogo,
  preloadImage
} from '@renderer/lib/external-queries'
import type { FanartMovie } from '@renderer/lib/fanart'
import {
  tmdbImage,
  trendingItemTitle,
  type TmdbMovie,
  type TmdbShow,
  type TmdbTrendingItem
} from '@renderer/lib/tmdb'

const PREFETCH_TIMEOUT_MS = 1500
const CONTINUE_COUNT = 10

function timeout(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function prefetchHero(qc: QueryClient, movieId: number): Promise<void> {
  if (!movieId) return
  const details = await qc.ensureQueryData(movieDetailsQuery(movieId)).catch(() => null)
  const imdbId = details?.imdb_id ?? undefined
  if (!imdbId) return
  await Promise.race([
    Promise.all([
      qc.ensureQueryData(imdbRatingsQuery(imdbId)).catch(() => undefined),
      qc.ensureQueryData(fanartMovieQuery(imdbId)).catch(() => undefined)
    ]),
    timeout(PREFETCH_TIMEOUT_MS)
  ])
  const fanart = qc.getQueryData(fanartMovieQuery(imdbId).queryKey) as
    | FanartMovie
    | null
    | undefined
  preloadImage(pickMovieHeroLogo(details ?? undefined, fanart))
}

export const Route = createFileRoute('/_authenticated/')({
  loader: async ({ context }) => {
    const qc = context.queryClient
    const [trendingMovies] = await Promise.all([
      qc.ensureQueryData(trendingMoviesQuery()),
      qc.ensureQueryData(trendingAllQuery()),
      qc.ensureQueryData(topMoviesRecentQuery()),
      qc.ensureQueryData(topTvRecentQuery()),
      ...GENRE_ROWS.map((g) => qc.ensureQueryData(genreMoviesQuery(g.key)))
    ])

    const heroId = trendingMovies.results[0]?.id ?? 0
    await Promise.race([prefetchHero(qc, heroId), timeout(PREFETCH_TIMEOUT_MS)])
  },
  component: HomeRoute
})

function HomeRoute(): React.JSX.Element {
  return useTvMode() ? <TvHome /> : <HomePage />
}

function movieToPoster(m: TmdbMovie): PosterRowItem {
  return {
    id: m.id,
    title: m.title,
    poster: tmdbImage(m.poster_path, 'w342') ?? '',
    posterPath: m.poster_path ?? undefined,
    type: 'movie'
  }
}
function showToPoster(s: TmdbShow): PosterRowItem {
  return {
    id: s.id,
    title: s.name,
    poster: tmdbImage(s.poster_path, 'w342') ?? '',
    posterPath: s.poster_path ?? undefined,
    type: 'tv'
  }
}
function trendingToPoster(t: TmdbTrendingItem): PosterRowItem {
  return {
    id: t.id,
    title: trendingItemTitle(t),
    poster: tmdbImage(t.poster_path, 'w342') ?? '',
    posterPath: t.poster_path ?? undefined,
    type: t.media_type
  }
}

function HomePage(): React.JSX.Element {
  const trendingMovies = useSuspenseQuery(trendingMoviesQuery())
  const trendingAll = useSuspenseQuery(trendingAllQuery())
  const topMovies = useSuspenseQuery(topMoviesRecentQuery())
  const topTv = useSuspenseQuery(topTvRecentQuery())

  const featuredIds = trendingMovies.data.results.slice(0, 8).map((m) => m.id)

  return (
    <div className="flex flex-col gap-8 pb-8">
      <FeaturedCarousel movieIds={featuredIds} />

      <ContinueWatchingSection />

      <DeferredPosterRow>
        <PosterRow
          title="Trending Now"
          items={trendingAll.data.results.map(trendingToPoster)}
          max={20}
          contextMenu={false}
        />
      </DeferredPosterRow>
      <FightsSection />

      <DeferredPosterRow>
        <PosterRow
          title="Top 10 Movies"
          items={topMovies.data.results.map(movieToPoster)}
          max={10}
          contextMenu={false}
        />
      </DeferredPosterRow>
      <DeferredPosterRow>
        <PosterRow
          title="Top 10 Series"
          items={topTv.data.results.map(showToPoster)}
          max={10}
          contextMenu={false}
        />
      </DeferredPosterRow>

      {GENRE_ROWS.map((g) => (
        <DeferredPosterRow key={g.key}>
          <GenreRow genre={g.key} title={g.title} />
        </DeferredPosterRow>
      ))}
    </div>
  )
}

// Title (22px) + gap-4 + 210px poster card: the fixed height of every PosterRow section,
// so the placeholder reserves exactly the space the row will take.
const POSTER_ROW_HEIGHT = 22 + 16 + 210

// The home page stacks ~16 poster rows (~330 cards). Mounting them all on entry is what
// made the page slow to switch to, so each row mounts once it comes within a screen of
// the viewport and then stays mounted — unmounting would reset the row's own horizontal
// scroll position. content-visibility keeps the mounted-but-offscreen rows out of layout
// and paint while scrolling.
function DeferredPosterRow({ children }: { children: React.ReactNode }): React.JSX.Element {
  const scrollRef = useScrollContainer()
  const ref = useRef<HTMLDivElement>(null)
  const [shown, setShown] = useState(false)

  useEffect(() => {
    if (shown) return
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) setShown(true)
      },
      { root: scrollRef?.current ?? null, rootMargin: '1000px 0px' }
    )
    io.observe(el)
    return () => io.disconnect()
  }, [shown, scrollRef])

  return (
    <div
      ref={ref}
      className="[contain-intrinsic-size:auto_248px] [content-visibility:auto]"
      style={{ minHeight: shown ? undefined : POSTER_ROW_HEIGHT }}
    >
      {shown ? children : <PosterRowSkeleton />}
    </div>
  )
}

function PosterRowSkeleton(): React.JSX.Element {
  return (
    <section aria-hidden className="flex flex-col gap-4">
      <div className="mx-6 h-[22px] w-36 animate-pulse rounded-md bg-surface-2" />
      <div className="flex gap-3 overflow-x-hidden pl-6">
        {Array.from({ length: 12 }).map((_, i) => (
          <div
            key={i}
            className="h-[210px] w-[140px] shrink-0 animate-pulse rounded-xl bg-surface-2"
          />
        ))}
      </div>
    </section>
  )
}

function GenreRow({ genre, title }: { genre: GenreKey; title: string }): React.JSX.Element {
  const { data } = useSuspenseQuery(genreMoviesQuery(genre))
  return (
    <PosterRow title={title} items={data.results.map(movieToPoster)} max={20} contextMenu={false} />
  )
}

function ContinueWatchingSection(): React.JSX.Element | null {
  const rows = useConvexQuery(api.playback.listContinueWatching, { limit: CONTINUE_COUNT })
  if (!rows || rows.length === 0) return null
  return (
    <ScrollSection title="Continue Watching">
      {rows.map((row) => (
        <ContinueRowCard key={row._id} row={row} />
      ))}
    </ScrollSection>
  )
}

function ContinueRowCard({ row }: { row: ContinueRow }): React.JSX.Element {
  const removeProgress = useMutation(api.playback.remove)
  const view = useContinueRow(row, 'w780')

  return (
    <MediaContextMenu
      mediaType={row.mediaType}
      tmdbId={row.tmdbId ?? 0}
      title={row.title ?? ''}
      posterPath={row.posterPath ?? undefined}
      onPlay={view.resume}
      onRemove={() =>
        void removeProgress({
          imdbId: row.imdbId,
          season: row.season,
          episode: row.episode
        })
      }
      removeLabel="Remove"
    >
      <ContinueCard
        title={row.title ?? ''}
        backdrop={view.backdrop}
        logo={view.logo}
        remaining={view.remaining}
        progress={view.progress}
        onClick={view.resume}
        preload={view.detailTarget}
      />
    </MediaContextMenu>
  )
}
