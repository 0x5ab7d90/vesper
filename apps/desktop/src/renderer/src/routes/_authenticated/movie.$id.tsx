import { useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useSuspenseQuery, useQuery } from '@tanstack/react-query'
import { useQuery as useConvexQuery } from 'convex/react'
import type { QueryClient } from '@tanstack/react-query'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'

dayjs.extend(relativeTime)
import { Hero, type HeroProps } from '@renderer/components/media/hero'
import { CastCard } from '@renderer/components/media/cast-card'
import { VideoCard } from '@renderer/components/media/video-card'
import { VideoModal } from '@renderer/components/media/video-modal'
import { PosterRow, type PosterRowItem } from '@renderer/components/media/poster-row'
import { ScrollSection } from '@renderer/components/ui/scroll-section'
import { movieDetailsQuery } from '@renderer/lib/tmdb-queries'
import {
  fanartMovieQuery,
  imdbRatingsQuery,
  pickMovieHeroLogo,
  preloadImage
} from '@renderer/lib/external-queries'
import type { FanartMovie } from '@renderer/lib/fanart'
import { pickFanartLogo } from '@renderer/lib/fanart'
import { pickImdb, pickMetacritic, type ImdbRatings } from '@renderer/lib/imdb'
import { StreamPicker } from '@renderer/components/player/stream-picker'
import { fetchMovieStreams } from '@renderer/lib/streams'
import { ensureScrape } from '@renderer/lib/stream-orchestrator'
import { formatTimeLeft } from '@renderer/lib/next-episode'
import { api } from '@convex/_generated/api'
import {
  formatRuntime,
  pickCertification,
  pickDirector,
  pickEnglishLogo,
  pickStarring,
  tmdbImage,
  type TmdbMovieDetails,
  type TmdbVideo
} from '@renderer/lib/tmdb'

const PREFETCH_TIMEOUT_MS = 1500

function timeout(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function prefetchHeroExtras(qc: QueryClient, details: TmdbMovieDetails): Promise<void> {
  const imdbId = details.imdb_id ?? undefined
  if (imdbId) {
    await Promise.race([
      Promise.all([
        qc.ensureQueryData(imdbRatingsQuery(imdbId)).catch(() => undefined),
        qc.ensureQueryData(fanartMovieQuery(imdbId)).catch(() => undefined)
      ]),
      timeout(PREFETCH_TIMEOUT_MS)
    ])
  }
  const fanart = imdbId
    ? (qc.getQueryData(fanartMovieQuery(imdbId).queryKey) as FanartMovie | null | undefined)
    : undefined
  preloadImage(pickMovieHeroLogo(details, fanart))
}

export const Route = createFileRoute('/_authenticated/movie/$id')({
  validateSearch: (search): { play?: boolean } => {
    const raw = (search as { play?: unknown }).play
    return raw === true || raw === 'true' ? { play: true } : {}
  },
  loader: async ({ context, params }) => {
    const qc = context.queryClient
    const id = Number(params.id)
    const details = await qc.ensureQueryData(movieDetailsQuery(id))
    preloadImage(tmdbImage(details.backdrop_path, 'original'))
    preloadImage(tmdbImage(details.poster_path, 'original'))
    // Ratings and fanart render into the hero as they arrive (non-suspense queries), so
    // don't hold the navigation on them — fanart.tv alone can take over a second.
    void prefetchHeroExtras(qc, details)
    if (details.imdb_id) {
      void ensureScrape({ mediaType: 'movie', imdbId: details.imdb_id }).catch(() => {
        /* torrentio may be down/rate-limited; non-fatal */
      })
    }
  },
  component: MoviePage
})

function MoviePage(): React.JSX.Element {
  const { id } = Route.useParams()
  const movieId = Number(id)
  const details = useSuspenseQuery(movieDetailsQuery(movieId))
  const imdbId = details.data.imdb_id ?? undefined
  const ratings = useQuery(imdbRatingsQuery(imdbId))
  const fanart = useQuery(fanartMovieQuery(imdbId))

  const fanartLogo = pickFanartLogo(fanart.data?.hdmovielogo ?? fanart.data?.movielogo ?? undefined)
  const trailers = pickPlayableVideos(details.data.videos?.results ?? [])
  const heroProps = detailsToHero(details.data, fanartLogo, ratings.data ?? null)
  const cast = details.data.credits?.cast.slice(0, 12) ?? []
  const recs: PosterRowItem[] =
    details.data.recommendations?.results.map((m) => ({
      id: m.id,
      title: m.title,
      poster: tmdbImage(m.poster_path, 'w342') ?? '',
      type: 'movie' as const
    })) ?? []

  const search = Route.useSearch()
  const [openVideo, setOpenVideo] = useState<TmdbVideo | null>(null)
  const [pickerOpen, setPickerOpen] = useState<boolean>(!!search.play)
  const navigate = useNavigate()

  const progress = useConvexQuery(api.playback.getForTitle, imdbId ? { imdbId } : 'skip')

  useQuery({
    queryKey: ['streams', 'movie', imdbId, undefined, undefined],
    queryFn: () => fetchMovieStreams(imdbId!),
    enabled: !!imdbId,
    staleTime: 5 * 60_000
  })

  const resume =
    progress && progress.durationSec > 0 && progress.positionSec / progress.durationSec < 0.95
      ? {
          label: formatTimeLeft(progress.positionSec, progress.durationSec),
          percent: (progress.positionSec / progress.durationSec) * 100
        }
      : null

  const handlePlay = (): void => {
    if (!imdbId) return
    setPickerOpen(true)
  }

  return (
    <div className="flex flex-col gap-8 pb-8">
      <Hero {...heroProps} onPlay={handlePlay} resume={resume} />

      {trailers.length > 0 ? (
        <ScrollSection title="Videos">
          {trailers.map((v) => (
            <VideoCard key={v.id} title={v.name} ytKey={v.key} onOpen={() => setOpenVideo(v)} />
          ))}
        </ScrollSection>
      ) : null}

      {cast.length > 0 ? (
        <ScrollSection title="Cast" gapClass="gap-4">
          {cast.map((p) => (
            <CastCard
              key={p.id}
              personId={p.id}
              name={p.name}
              character={p.character}
              profilePath={p.profile_path}
            />
          ))}
        </ScrollSection>
      ) : null}

      {recs.length > 0 ? <PosterRow title="You Might Also Like" items={recs} /> : null}

      <VideoModal
        ytKey={openVideo?.key ?? null}
        title={openVideo?.name ?? ''}
        open={!!openVideo}
        onOpenChange={(o) => {
          if (!o) setOpenVideo(null)
        }}
      />

      {imdbId ? (
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
                title: details.data.title,
                imdbId,
                mediaType: 'movie',
                resumeSec: resume ? progress!.positionSec : undefined,
                filename: stream.filename
              }
            })
          }}
        />
      ) : null}
    </div>
  )
}

function pickPlayableVideos(videos: TmdbVideo[]): TmdbVideo[] {
  const keep = videos.filter(
    (v) =>
      v.site === 'YouTube' && (v.type === 'Trailer' || v.type === 'Teaser' || v.type === 'Clip')
  )
  // Sort: trailers first, then teasers, then clips; official before fan-cut
  const typeRank = { Trailer: 0, Teaser: 1, Clip: 2 } as const
  return keep
    .sort((a, b) => {
      const t =
        (typeRank[a.type as keyof typeof typeRank] ?? 99) -
        (typeRank[b.type as keyof typeof typeRank] ?? 99)
      if (t !== 0) return t
      return Number(b.official) - Number(a.official)
    })
    .slice(0, 8)
}

function detailsToHero(
  d: TmdbMovieDetails,
  fanartLogo: string | undefined,
  ratings: ImdbRatings | null
): HeroProps {
  const year = d.release_date ? Number(d.release_date.slice(0, 4)) : 0
  const logo = fanartLogo ?? pickEnglishLogo(d)
  const releaseDay = d.release_date ? dayjs(d.release_date) : null
  const unreleased = !!releaseDay && releaseDay.isAfter(dayjs())
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
    releaseLabel: unreleased && releaseDay ? `Releasing ${releaseDay.fromNow()}` : undefined,
    mediaType: 'movie',
    tmdbId: d.id,
    posterPath: d.poster_path ?? undefined
  }
}
