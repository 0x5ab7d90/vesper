import { useMemo, useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useSuspenseQuery, useQuery } from '@tanstack/react-query'
import { useQuery as useConvexQuery } from 'convex/react'
import type { QueryClient } from '@tanstack/react-query'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import { Hero, type HeroProps } from '@renderer/components/media/hero'

dayjs.extend(relativeTime)
import { CastCard } from '@renderer/components/media/cast-card'
import { VideoCard } from '@renderer/components/media/video-card'
import { VideoModal } from '@renderer/components/media/video-modal'
import { PosterRow, type PosterRowItem } from '@renderer/components/media/poster-row'
import { ScrollSection } from '@renderer/components/ui/scroll-section'
import { tvDetailsQuery } from '@renderer/lib/tmdb-queries'
import {
  fanartTvQuery,
  imdbRatingsQuery,
  pickTvHeroLogo,
  preloadImage
} from '@renderer/lib/external-queries'
import type { FanartTv } from '@renderer/lib/fanart'
import { pickFanartLogo } from '@renderer/lib/fanart'
import { pickImdb, pickMetacritic, type ImdbRatings } from '@renderer/lib/imdb'
import { StreamPicker } from '@renderer/components/player/stream-picker'
import { SeasonEpisodes } from '@renderer/components/media/season-episodes'
import { EpisodeRatings } from '@renderer/components/media/episode-ratings'
import { fetchSeriesStreams } from '@renderer/lib/streams'
import { formatTimeLeft } from '@renderer/lib/next-episode'
import { api } from '@convex/_generated/api'
import {
  formatRuntime,
  pickEnglishLogo,
  pickStarring,
  pickTvCertification,
  pickTvCreator,
  tmdbImage,
  type TmdbTvDetails,
  type TmdbVideo
} from '@renderer/lib/tmdb'

const PREFETCH_TIMEOUT_MS = 1500

function timeout(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function prefetchHeroExtras(qc: QueryClient, details: TmdbTvDetails): Promise<void> {
  const imdbId = details.external_ids?.imdb_id ?? undefined
  const tvdbId = details.external_ids?.tvdb_id ?? undefined
  await Promise.race([
    Promise.all([
      imdbId
        ? qc.ensureQueryData(imdbRatingsQuery(imdbId)).catch(() => undefined)
        : Promise.resolve(undefined),
      tvdbId
        ? qc.ensureQueryData(fanartTvQuery(tvdbId)).catch(() => undefined)
        : Promise.resolve(undefined)
    ]),
    timeout(PREFETCH_TIMEOUT_MS)
  ])
  const fanart = tvdbId
    ? (qc.getQueryData(fanartTvQuery(tvdbId).queryKey) as FanartTv | null | undefined)
    : undefined
  preloadImage(pickTvHeroLogo(details, fanart))
}

export const Route = createFileRoute('/_authenticated/tv/$id')({
  validateSearch: (
    search
  ): {
    play?: boolean
    playSeason?: number
    playEpisode?: number
    focusSeason?: number
    focusEpisode?: number
  } => {
    const raw = search as {
      play?: unknown
      playSeason?: unknown
      playEpisode?: unknown
      focusSeason?: unknown
      focusEpisode?: unknown
    }
    const play = raw.play === true || raw.play === 'true'
    const playSeason = typeof raw.playSeason === 'number' ? raw.playSeason : undefined
    const playEpisode = typeof raw.playEpisode === 'number' ? raw.playEpisode : undefined
    const toNum = (v: unknown): number | undefined => {
      if (typeof v === 'number' && Number.isFinite(v)) return v
      if (typeof v === 'string') {
        const n = parseInt(v, 10)
        if (Number.isFinite(n)) return n
      }
      return undefined
    }
    const focusSeason = toNum(raw.focusSeason)
    const focusEpisode = toNum(raw.focusEpisode)
    return {
      ...(play ? { play: true, playSeason, playEpisode } : {}),
      ...(focusSeason !== undefined ? { focusSeason } : {}),
      ...(focusEpisode !== undefined ? { focusEpisode } : {})
    }
  },
  loader: async ({ context, params }) => {
    const qc = context.queryClient
    const id = Number(params.id)
    const details = await qc.ensureQueryData(tvDetailsQuery(id))
    preloadImage(tmdbImage(details.backdrop_path, 'original'))
    preloadImage(tmdbImage(details.poster_path, 'original'))
    // Ratings and fanart render into the hero as they arrive (non-suspense queries), so
    // don't hold the navigation on them — fanart.tv alone can take over a second.
    void prefetchHeroExtras(qc, details)
  },
  component: TvPage
})

function TvPage(): React.JSX.Element {
  const { id } = Route.useParams()
  const tvId = Number(id)
  const details = useSuspenseQuery(tvDetailsQuery(tvId))
  const imdbId = details.data.external_ids?.imdb_id ?? undefined
  const tvdbId = details.data.external_ids?.tvdb_id ?? undefined
  const ratings = useQuery(imdbRatingsQuery(imdbId))
  const fanart = useQuery(fanartTvQuery(tvdbId))

  const fanartLogo = pickFanartLogo(fanart.data?.hdtvlogo ?? fanart.data?.clearlogo ?? undefined)
  const trailers = pickPlayableVideos(details.data.videos?.results ?? [])
  const heroProps = tvDetailsToHero(details.data, fanartLogo, ratings.data ?? null)
  const cast = details.data.credits?.cast.slice(0, 12) ?? []
  const recs: PosterRowItem[] =
    details.data.recommendations?.results.map((s) => ({
      id: s.id,
      title: s.name,
      poster: tmdbImage(s.poster_path, 'w342') ?? '',
      type: 'tv' as const
    })) ?? []

  const search = Route.useSearch()
  const [openVideo, setOpenVideo] = useState<TmdbVideo | null>(null)
  const [pickerOpen, setPickerOpen] = useState<boolean>(!!search.play)
  const initialOverride =
    search.play && search.playSeason && search.playEpisode
      ? { season: search.playSeason, episode: search.playEpisode }
      : null
  const [pickerOverride, setPickerOverride] = useState<{
    season: number
    episode: number
    episodeName?: string
  } | null>(initialOverride)
  const navigate = useNavigate()

  const progressRows = useConvexQuery(api.playback.listForSeries, imdbId ? { imdbId } : 'skip')

  const playTarget = computePlayTarget(progressRows ?? null)

  // Season selection is shared by the episode rail and the ratings graph, so
  // switching seasons in one keeps the other in step.
  const seasons = useMemo(
    () => details.data.seasons.filter((s) => s.season_number > 0 && s.episode_count > 0),
    [details.data.seasons]
  )
  const defaultSeason = useMemo(() => {
    if (!seasons.length) return 1
    if (search.focusSeason && seasons.some((s) => s.season_number === search.focusSeason)) {
      return search.focusSeason
    }
    if (progressRows && progressRows.length > 0) {
      const latest = progressRows.toSorted((a, b) => b.updatedAt - a.updatedAt)[0]!
      if (latest.season !== undefined) return latest.season
    }
    return seasons[0]!.season_number
  }, [seasons, progressRows, search.focusSeason])
  // Keyed by show so navigating to another series drops the stale choice.
  const [seasonChoice, setSeasonChoice] = useState<{ tvId: number; season: number } | null>(null)
  const activeSeason = seasonChoice?.tvId === tvId ? seasonChoice.season : defaultSeason

  useQuery({
    queryKey: ['streams', 'tv', imdbId, playTarget.ref.season, playTarget.ref.episode],
    queryFn: () => fetchSeriesStreams(imdbId!, playTarget.ref.season, playTarget.ref.episode, tvId),
    enabled: !!imdbId,
    staleTime: 5 * 60_000
  })

  const resume =
    playTarget.state === 'resume' && playTarget.latest
      ? {
          label: `S${playTarget.ref.season} E${playTarget.ref.episode} · ${formatTimeLeft(
            playTarget.latest.positionSec,
            playTarget.latest.durationSec
          )}`,
          percent: (playTarget.latest.positionSec / playTarget.latest.durationSec) * 100
        }
      : null

  const handlePlay = (): void => {
    if (!imdbId) return
    setPickerOverride(null)
    setPickerOpen(true)
  }

  const handlePlayEpisode = (season: number, episode: number, episodeName?: string): void => {
    if (!imdbId) return
    setPickerOverride({ season, episode, episodeName })
    setPickerOpen(true)
  }

  const pickerSeason = pickerOverride?.season ?? playTarget.ref.season
  const pickerEpisode = pickerOverride?.episode ?? playTarget.ref.episode
  const pickerEpisodeName = pickerOverride?.episodeName
  const episodeLabel = pickerEpisodeName ?? `S${pickerSeason}E${pickerEpisode}`
  const isResumeTarget =
    pickerOverride === null && playTarget.state === 'resume' && playTarget.latest !== undefined

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

      <SeasonEpisodes
        details={details.data}
        imdbId={imdbId}
        onPlay={handlePlayEpisode}
        season={activeSeason}
        onSeasonChange={(n) => setSeasonChoice({ tvId, season: n })}
        focusSeason={search.focusSeason}
        focusEpisode={search.focusEpisode}
      />

      {seasons.length > 0 ? <EpisodeRatings tmdbId={tvId} season={activeSeason} /> : null}

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
          title={`${details.data.name} · ${episodeLabel}`}
          mediaType="tv"
          imdbId={imdbId}
          tmdbId={tvId}
          season={pickerSeason}
          episode={pickerEpisode}
          onPicked={({ url, stream }) => {
            void navigate({
              to: '/watch/$mediaType/$id',
              params: { mediaType: 'tv', id: String(tvId) },
              search: {
                url,
                title: details.data.name,
                episodeLabel,
                imdbId,
                mediaType: 'tv',
                season: pickerSeason,
                episode: pickerEpisode,
                resumeSec: isResumeTarget ? playTarget.latest?.positionSec : undefined,
                filename: stream.filename,
                bingeGroup: stream.bingeGroup
              }
            })
          }}
        />
      ) : null}
    </div>
  )
}

interface PlayTarget {
  ref: { season: number; episode: number }
  state: 'fresh' | 'resume' | 'next'
  latest?: { positionSec: number; durationSec: number }
}

function computePlayTarget(
  rows: Array<{
    season?: number
    episode?: number
    positionSec: number
    durationSec: number
    updatedAt: number
  }> | null
): PlayTarget {
  if (!rows || rows.length === 0) {
    return { ref: { season: 1, episode: 1 }, state: 'fresh' }
  }
  const withEp = rows.filter((r) => r.season !== undefined && r.episode !== undefined)
  if (withEp.length === 0) return { ref: { season: 1, episode: 1 }, state: 'fresh' }
  const latest = withEp.toSorted((a, b) => b.updatedAt - a.updatedAt)[0]!
  const pct = latest.durationSec > 0 ? latest.positionSec / latest.durationSec : 0
  if (pct < 0.95) {
    return {
      ref: { season: latest.season!, episode: latest.episode! },
      state: 'resume',
      latest: { positionSec: latest.positionSec, durationSec: latest.durationSec }
    }
  }
  return {
    ref: { season: latest.season!, episode: latest.episode! + 1 },
    state: 'next'
  }
}

function pickPlayableVideos(videos: TmdbVideo[]): TmdbVideo[] {
  const keep = videos.filter(
    (v) =>
      v.site === 'YouTube' && (v.type === 'Trailer' || v.type === 'Teaser' || v.type === 'Clip')
  )
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

function tvDetailsToHero(
  d: TmdbTvDetails,
  fanartLogo: string | undefined,
  ratings: ImdbRatings | null
): HeroProps {
  const year = d.first_air_date ? Number(d.first_air_date.slice(0, 4)) : 0
  const logo = fanartLogo ?? pickEnglishLogo(d as unknown as Parameters<typeof pickEnglishLogo>[0])
  const epMin = d.episode_run_time?.[0]
  const runtime = epMin ? `${formatRuntime(epMin)}/ep` : ''
  const airDay = d.first_air_date ? dayjs(d.first_air_date) : null
  const unreleased = !!airDay && airDay.isAfter(dayjs())
  return {
    title: d.name,
    logo,
    tags: ['Series', ...d.genres.map((g) => g.name).slice(0, 3)],
    rating: pickTvCertification(d) || 'NR',
    description: d.overview,
    year,
    runtime,
    metacritic: pickMetacritic(ratings),
    imdb: pickImdb(ratings),
    starring: pickStarring(d as unknown as Parameters<typeof pickStarring>[0]),
    director: pickTvCreator(d),
    backdrop: tmdbImage(d.backdrop_path, 'original') ?? '',
    poster: tmdbImage(d.poster_path, 'original') ?? '',
    releaseLabel: unreleased && airDay ? `Premieres ${airDay.fromNow()}` : undefined,
    mediaType: 'tv',
    tmdbId: d.id,
    posterPath: d.poster_path ?? undefined
  }
}
