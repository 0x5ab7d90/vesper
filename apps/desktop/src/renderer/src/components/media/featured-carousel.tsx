import { useCallback, useEffect, useState } from 'react'
import useEmblaCarousel from 'embla-carousel-react'
import Autoplay from 'embla-carousel-autoplay'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useQuery as useConvexQuery } from 'convex/react'
import { useNavigate } from '@tanstack/react-router'
import { Hero, HERO_HEIGHT, type HeroProps } from './hero'
import { StreamPicker } from '@renderer/components/player/stream-picker'
import { formatTimeLeft } from '@renderer/lib/next-episode'
import { api } from '@convex/_generated/api'
import { Skeleton } from '@renderer/components/ui/skeleton'
import { SkeletonSwap } from '@renderer/components/ui/skeleton-swap'
import { movieDetailsQuery } from '@renderer/lib/tmdb-queries'
import {
  fanartMovieQuery,
  imdbRatingsQuery,
  pickMovieHeroLogo,
  preloadImage
} from '@renderer/lib/external-queries'
import { pickFanartLogo } from '@renderer/lib/fanart'
import { pickImdb, pickMetacritic, type ImdbRatings } from '@renderer/lib/imdb'
import {
  formatRuntime,
  pickCertification,
  pickDirector,
  pickEnglishLogo,
  pickStarring,
  tmdbImage,
  type TmdbMovieDetails
} from '@renderer/lib/tmdb'
import { cn } from '@renderer/lib/cn'

const AUTOPLAY_MS = 7000

interface Props {
  movieIds: number[]
}

export function FeaturedCarousel({ movieIds }: Props): React.JSX.Element {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [emblaRef, embla] = useEmblaCarousel(
    { loop: true, align: 'start', containScroll: 'trimSnaps' },
    [Autoplay({ delay: AUTOPLAY_MS, stopOnInteraction: false, stopOnMouseEnter: true })]
  )
  const [selected, setSelected] = useState(0)

  useEffect(() => {
    const tail = movieIds.slice(1)
    let cancelled = false
    void Promise.all(
      tail.map(async (id) => {
        if (cancelled) return
        try {
          const details = await qc.ensureQueryData(movieDetailsQuery(id))
          if (cancelled) return
          const imdbId = details.imdb_id ?? undefined
          if (!imdbId) return
          const [, fanart] = await Promise.all([
            qc.ensureQueryData(imdbRatingsQuery(imdbId)).catch(() => undefined),
            qc.ensureQueryData(fanartMovieQuery(imdbId)).catch(() => null)
          ])
          if (cancelled) return
          preloadImage(pickMovieHeroLogo(details, fanart))
        } catch {
          // ignore
        }
      })
    )
    return (): void => {
      cancelled = true
    }
  }, [movieIds, qc])

  useEffect(() => {
    if (!embla) return
    const handler = (): void => setSelected(embla.selectedScrollSnap())
    embla.on('select', handler)
    handler()
    return (): void => {
      embla.off('select', handler)
    }
  }, [embla])

  const scrollTo = useCallback(
    (i: number): void => {
      embla?.scrollTo(i)
    },
    [embla]
  )

  const openMovie = useCallback(
    (id: number): void => {
      navigate({ to: '/movie/$id', params: { id: String(id) }, viewTransition: false })
    },
    [navigate]
  )

  return (
    <div className="relative">
      <div ref={emblaRef} className="overflow-hidden">
        <div className="flex">
          {movieIds.map((id, i) => (
            <div
              key={id}
              className="min-w-0 flex-[0_0_100%]"
              onClick={() => i === selected && openMovie(id)}
            >
              <FeaturedSlide movieId={id} />
            </div>
          ))}
        </div>
      </div>
      <div className="pointer-events-none absolute inset-x-0 bottom-4 flex items-center justify-center gap-2">
        {movieIds.map((id, i) => (
          <button
            key={id}
            type="button"
            aria-label={`Go to featured ${i + 1}`}
            onClick={(e) => {
              e.stopPropagation()
              scrollTo(i)
            }}
            className={cn(
              'pointer-events-auto h-1.5 rounded-full bg-white/40 transition-[width,background-color] duration-200 ease-out',
              selected === i ? 'w-6 bg-white' : 'w-1.5'
            )}
          />
        ))}
      </div>
    </div>
  )
}

function FeaturedSlide({ movieId }: { movieId: number }): React.JSX.Element {
  const details = useQuery(movieDetailsQuery(movieId))
  const imdbId = details.data?.imdb_id ?? undefined
  const ratings = useQuery(imdbRatingsQuery(imdbId))
  const fanart = useQuery(fanartMovieQuery(imdbId))
  const [pickerOpen, setPickerOpen] = useState(false)
  const navigate = useNavigate()
  const progress = useConvexQuery(api.playback.getForTitle, imdbId ? { imdbId } : 'skip')

  const resume =
    progress && progress.durationSec > 0 && progress.positionSec / progress.durationSec < 0.95
      ? {
          label: formatTimeLeft(progress.positionSec, progress.durationSec),
          percent: (progress.positionSec / progress.durationSec) * 100
        }
      : null

  const fanartLogo = pickFanartLogo(fanart.data?.hdmovielogo ?? fanart.data?.movielogo ?? undefined)
  const handlePlay = (): void => {
    if (!imdbId) return
    setPickerOpen(true)
  }

  return (
    <SkeletonSwap
      ready={details.data !== undefined}
      reserve="auto"
      label="Featured movie"
      skeleton={<HeroSkeleton />}
    >
      {details.data ? (
        <Hero
          {...detailsToHero(details.data, fanartLogo, ratings.data ?? null)}
          onPlay={handlePlay}
          resume={resume}
        />
      ) : null}
      {details.data && imdbId ? (
        <StreamPicker
          open={pickerOpen}
          onOpenChange={setPickerOpen}
          title={details.data.title}
          mediaType="movie"
          imdbId={imdbId}
          tmdbId={movieId}
          onPicked={({ url, stream }) => {
            void navigate({
              to: '/watch/$mediaType/$id',
              params: { mediaType: 'movie', id: String(movieId) },
              search: {
                url,
                title: details.data!.title,
                imdbId,
                mediaType: 'movie',
                resumeSec: resume ? progress!.positionSec : undefined,
                filename: stream.filename
              }
            })
          }}
        />
      ) : null}
    </SkeletonSwap>
  )
}

function detailsToHero(
  d: TmdbMovieDetails,
  fanartLogo: string | undefined,
  ratings: ImdbRatings | null
): HeroProps {
  const year = d.release_date ? Number(d.release_date.slice(0, 4)) : 0
  const logo = fanartLogo ?? pickEnglishLogo(d)
  return {
    title: d.title,
    logo,
    tags: ['Movie', ...d.genres.map((g) => g.name).slice(0, 3)],
    rating: pickCertification(d) || 'NR',
    description: d.overview,
    year,
    runtime: formatRuntime(d.runtime),
    metacritic: pickMetacritic(ratings),
    imdb: pickImdb(ratings),
    starring: pickStarring(d),
    director: pickDirector(d),
    backdrop: tmdbImage(d.backdrop_path, 'original') ?? '',
    poster: tmdbImage(d.poster_path, 'original') ?? '',
    mediaType: 'movie',
    tmdbId: d.id,
    posterPath: d.poster_path ?? undefined
  }
}

function HeroSkeleton(): React.JSX.Element {
  return (
    <div className={cn('relative w-full overflow-hidden rounded-lg bg-surface', HERO_HEIGHT)}>
      <div className="flex h-full flex-col justify-end gap-3 p-8">
        <Skeleton className="h-[110px] w-[300px]" />
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-10 w-[460px]" />
        <Skeleton className="h-5 w-64" />
        <div className="mt-2 flex gap-2">
          <Skeleton className="h-[38px] w-24 rounded-full" />
          <Skeleton className="size-10 rounded-full" />
        </div>
      </div>
    </div>
  )
}
