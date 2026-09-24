import { useEffect, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useQuery, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { useQuery as useConvexQuery } from 'convex/react'
import { AnimatePresence, m as motion, useReducedMotion } from 'motion/react'
import { api } from '@convex/_generated/api'
import { PlayIcon } from '@renderer/components/icons'
import { ProgressBar } from '@renderer/components/ui/progress-bar'
import { IMAGE_EDGE } from '@renderer/components/ui/image-outline'
import type { PosterRowItem } from '@renderer/components/media/poster-row'
import { StreamPicker } from '@renderer/components/player/stream-picker'
import { TvHero, TvPlayButton, TvSecondaryButton } from '@renderer/components/tv/tv-hero'
import { TV_HOVER_LIFT, TvDeferred, TvPosterRow, TvRow } from '@renderer/components/tv/tv-row'
import { useContinueRow, type ContinueRow } from '@renderer/hooks/use-continue-row'
import { GENRE_ROWS } from '@renderer/lib/home-rows'
import {
  genreMoviesQuery,
  movieDetailsQuery,
  topMoviesRecentQuery,
  topTvRecentQuery,
  trendingAllQuery,
  trendingMoviesQuery,
  type GenreKey
} from '@renderer/lib/tmdb-queries'
import { fanartMovieQuery, imdbRatingsQuery, preloadImage } from '@renderer/lib/external-queries'
import { pickFanartLogo } from '@renderer/lib/fanart'
import { pickImdb, pickMetacritic } from '@renderer/lib/imdb'
import { formatTimeLeft } from '@renderer/lib/next-episode'
import { EASE_OUT } from '@renderer/lib/motion'
import {
  formatRuntime,
  pickCertification,
  pickEnglishLogo,
  pickDirector,
  pickStarring,
  tmdbImage,
  trendingItemTitle,
  type TmdbMovie,
  type TmdbShow,
  type TmdbTrendingItem
} from '@renderer/lib/tmdb'
import { cn } from '@renderer/lib/cn'

const SPOTLIGHT_COUNT = 6
const SPOTLIGHT_MS = 9000
const CONTINUE_COUNT = 12

function movieItem(m: TmdbMovie): PosterRowItem {
  return {
    id: m.id,
    title: m.title,
    poster: tmdbImage(m.poster_path, 'w500') ?? '',
    posterPath: m.poster_path ?? undefined,
    type: 'movie'
  }
}
function showItem(s: TmdbShow): PosterRowItem {
  return {
    id: s.id,
    title: s.name,
    poster: tmdbImage(s.poster_path, 'w500') ?? '',
    posterPath: s.poster_path ?? undefined,
    type: 'tv'
  }
}
function trendingItem(t: TmdbTrendingItem): PosterRowItem {
  return {
    id: t.id,
    title: trendingItemTitle(t),
    poster: tmdbImage(t.poster_path, 'w500') ?? '',
    posterPath: t.poster_path ?? undefined,
    type: t.media_type
  }
}

export function TvHome(): React.JSX.Element {
  const trendingMovies = useSuspenseQuery(trendingMoviesQuery())
  const trendingAll = useSuspenseQuery(trendingAllQuery())
  const topMovies = useSuspenseQuery(topMoviesRecentQuery())
  const topTv = useSuspenseQuery(topTvRecentQuery())

  const spotlightIds = trendingMovies.data.results.slice(0, SPOTLIGHT_COUNT).map((m) => m.id)

  return (
    <div className="flex flex-col pb-16">
      <Spotlight movieIds={spotlightIds} />
      {/* The first row tucks up into the hero's fade, so there's always something to scroll to. */}
      <div className="relative z-10 -mt-12 flex flex-col gap-10">
        <ContinueWatchingRow />
        <TvPosterRow title="Trending now" items={trendingAll.data.results.map(trendingItem)} />
        <TvDeferred>
          <TvPosterRow
            title="Top 10 movies"
            items={topMovies.data.results.map(movieItem)}
            max={10}
          />
        </TvDeferred>
        <TvDeferred>
          <TvPosterRow title="Top 10 series" items={topTv.data.results.map(showItem)} max={10} />
        </TvDeferred>
        {GENRE_ROWS.map((g) => (
          <TvDeferred key={g.key}>
            <GenreRow genre={g.key} title={g.title} />
          </TvDeferred>
        ))}
      </div>
    </div>
  )
}

function GenreRow({ genre, title }: { genre: GenreKey; title: string }): React.JSX.Element {
  const { data } = useSuspenseQuery(genreMoviesQuery(genre))
  return <TvPosterRow title={title} items={data.results.map(movieItem)} />
}

// ----- spotlight -----

function Spotlight({ movieIds }: { movieIds: number[] }): React.JSX.Element | null {
  const qc = useQueryClient()
  const reduceMotion = useReducedMotion()
  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(false)
  const count = movieIds.length

  useEffect(() => {
    if (paused || count < 2) return
    const t = setTimeout(() => setIndex((i) => (i + 1) % count), SPOTLIGHT_MS)
    return () => clearTimeout(t)
  }, [index, paused, count])

  // Warm the next slide so the crossfade lands on art, not on an empty frame.
  const nextId = movieIds[(index + 1) % Math.max(1, count)]
  useEffect(() => {
    if (!nextId) return
    void qc
      .ensureQueryData(movieDetailsQuery(nextId))
      .then((d) => preloadImage(tmdbImage(d.backdrop_path, 'original')))
      .catch(() => {})
  }, [nextId, qc])

  const activeId = movieIds[index]
  if (activeId === undefined) return null

  const dots =
    count > 1 ? (
      <div className="mt-6 flex items-center gap-3">
        {movieIds.map((id, i) => (
          <button
            key={id}
            type="button"
            aria-label={`Show featured title ${i + 1} of ${count}`}
            aria-current={i === index}
            onClick={() => setIndex(i)}
            className="group flex h-6 items-center outline-none"
          >
            <span
              className={cn(
                'block h-2 rounded-full transition-[width,background-color] duration-200',
                i === index ? 'w-10 bg-white' : 'w-2 bg-white/40 group-hover:bg-white/70'
              )}
            />
          </button>
        ))}
      </div>
    ) : null

  return (
    <div
      className="relative"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <AnimatePresence initial={false} mode="popLayout">
        <motion.div
          key={activeId}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduceMotion ? 0 : 0.6, ease: EASE_OUT }}
        >
          <SpotlightSlide movieId={activeId} footer={dots} />
        </motion.div>
      </AnimatePresence>
    </div>
  )
}

function SpotlightSlide({
  movieId,
  footer
}: {
  movieId: number
  footer: React.ReactNode
}): React.JSX.Element {
  const navigate = useNavigate()
  const details = useQuery(movieDetailsQuery(movieId))
  const d = details.data
  const imdbId = d?.imdb_id ?? undefined
  const ratings = useQuery(imdbRatingsQuery(imdbId))
  const fanart = useQuery(fanartMovieQuery(imdbId))
  const progress = useConvexQuery(api.playback.getForTitle, imdbId ? { imdbId } : 'skip')
  const [pickerOpen, setPickerOpen] = useState(false)

  if (!d) return <SpotlightSkeleton />

  const resume =
    progress && progress.durationSec > 0 && progress.positionSec / progress.durationSec < 0.95
      ? {
          label: formatTimeLeft(progress.positionSec, progress.durationSec),
          percent: (progress.positionSec / progress.durationSec) * 100
        }
      : null
  const logo =
    pickFanartLogo(fanart.data?.hdmovielogo ?? fanart.data?.movielogo ?? undefined) ??
    pickEnglishLogo(d)
  const openDetails = (): void => {
    navigate({ to: '/movie/$id', params: { id: String(movieId) }, viewTransition: false })
  }

  return (
    <>
      <TvHero
        title={d.title}
        logo={logo}
        backdrop={tmdbImage(d.backdrop_path, 'original') ?? ''}
        description={d.overview}
        year={d.release_date ? Number(d.release_date.slice(0, 4)) : 0}
        timing={formatRuntime(d.runtime)}
        rating={pickCertification(d) || 'NR'}
        genres={d.genres.map((g) => g.name).slice(0, 3)}
        imdb={pickImdb(ratings.data ?? null)}
        metacritic={pickMetacritic(ratings.data ?? null)}
        starring={pickStarring(d)}
        director={pickDirector(d)}
        actions={
          <>
            <TvPlayButton onClick={() => setPickerOpen(true)} disabled={!imdbId} resume={resume} />
            <TvSecondaryButton onClick={openDetails}>More info</TvSecondaryButton>
          </>
        }
        footer={footer}
      />
      {imdbId ? (
        <StreamPicker
          open={pickerOpen}
          onOpenChange={setPickerOpen}
          title={d.title}
          mediaType="movie"
          imdbId={imdbId}
          tmdbId={movieId}
          year={d.release_date ? Number(d.release_date.slice(0, 4)) : undefined}
          onPickedWeb={({ stream }) => {
            void navigate({
              to: '/watch-web/$mediaType/$id',
              params: { mediaType: 'movie', id: String(movieId) },
              search: {
                streamId: stream.id,
                title: d.title,
                poster: tmdbImage(d.poster_path, 'w342') ?? undefined,
                imdbId,
                year: d.release_date ? Number(d.release_date.slice(0, 4)) : undefined
              }
            })
          }}
          onPicked={({ url, stream }) => {
            void navigate({
              to: '/watch/$mediaType/$id',
              params: { mediaType: 'movie', id: String(movieId) },
              search: {
                url,
                title: d.title,
                imdbId,
                mediaType: 'movie',
                resumeSec: resume ? progress!.positionSec : undefined,
                filename: stream.filename
              }
            })
          }}
        />
      ) : null}
    </>
  )
}

function SpotlightSkeleton(): React.JSX.Element {
  return (
    <div aria-hidden className="flex h-[88vh] min-h-[600px] items-end px-16 pb-16">
      <div className="flex flex-col gap-6">
        <div className="h-[150px] w-[480px] animate-pulse rounded-lg bg-surface-2" />
        <div className="h-6 w-80 animate-pulse rounded-md bg-surface-2" />
        <div className="h-24 w-[720px] animate-pulse rounded-md bg-surface-2" />
        <div className="mt-2 flex gap-4">
          <div className="h-16 w-44 animate-pulse rounded-full bg-surface-2" />
          <div className="h-16 w-48 animate-pulse rounded-full bg-surface-2" />
        </div>
      </div>
    </div>
  )
}

// ----- continue watching -----

function ContinueWatchingRow(): React.JSX.Element | null {
  const rows = useConvexQuery(api.playback.listContinueWatching, { limit: CONTINUE_COUNT })
  if (!rows || rows.length === 0) return null
  return (
    <TvRow title="Continue watching">
      {rows.map((row) => (
        <ContinueTile key={row._id} row={row} />
      ))}
    </TvRow>
  )
}

function ContinueTile({ row }: { row: ContinueRow }): React.JSX.Element {
  const view = useContinueRow(row, 'w1280')
  const title = row.title ?? ''
  return (
    <button
      type="button"
      onClick={view.resume}
      aria-label={title}
      className={cn(
        'relative flex h-[248px] w-[440px] shrink-0 flex-col overflow-hidden rounded-xl bg-surface-2 bg-cover bg-center p-5 text-left outline-none',
        IMAGE_EDGE,
        TV_HOVER_LIFT
      )}
      style={{ backgroundImage: view.backdrop ? `url(${view.backdrop})` : undefined }}
    >
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(180deg, rgba(0,0,0,0.2) 0%, rgba(0,0,0,0) 40%, rgba(0,0,0,0.88) 100%)'
        }}
      />
      {view.logo ? (
        <img
          src={view.logo}
          alt={title}
          decoding="async"
          className="relative max-h-16 w-auto max-w-[240px] self-start object-contain object-left drop-shadow-[0_2px_8px_rgba(0,0,0,0.5)]"
        />
      ) : (
        <span className="relative max-w-[360px] truncate text-[24px] leading-tight font-medium text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.5)]">
          {title}
        </span>
      )}
      <div className="relative flex-1" />
      <div className="relative flex items-center gap-3">
        <PlayIcon className="size-5 shrink-0 text-white" />
        <ProgressBar value={view.progress} tone="light" className="flex-1" />
        <span className="shrink-0 text-[18px] leading-6 font-medium text-white tabular-nums">
          {view.remaining}
        </span>
      </div>
    </button>
  )
}
