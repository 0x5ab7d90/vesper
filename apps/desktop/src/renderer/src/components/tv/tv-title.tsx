import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { CheckIcon, ClapboardIcon, PlayIcon, PlusIcon } from '@renderer/components/icons'
import { AddToListsPopover } from '@renderer/components/library/add-to-lists-popover'
import type { HeroProps } from '@renderer/components/media/hero'
import type { PosterRowItem } from '@renderer/components/media/poster-row'
import { VideoModal } from '@renderer/components/media/video-modal'
import { ProgressBar } from '@renderer/components/ui/progress-bar'
import { IMAGE_EDGE } from '@renderer/components/ui/image-outline'
import { TvHero, TvPlayButton, TvSecondaryButton } from '@renderer/components/tv/tv-hero'
import { TV_HOVER_LIFT, TvPillRow, TvPosterRow, TvRow } from '@renderer/components/tv/tv-row'
import { tvSeasonQuery } from '@renderer/lib/tmdb-queries'
import {
  formatRuntime,
  tmdbImage,
  type TmdbSeasonSummary,
  type TmdbVideo
} from '@renderer/lib/tmdb'
import { cn } from '@renderer/lib/cn'

interface TvTitleProps {
  hero: HeroProps
  onPlay: () => void
  resume: { label: string; percent: number } | null
  recs: PosterRowItem[]
  /** Trailers and clips, best first; the first one also backs the hero's Trailer button. */
  videos: TmdbVideo[]
  /** Series episodes, the stream picker, anything else the page owns. */
  children?: React.ReactNode
}

// A movie or series page at ten feet. The route keeps its data and its play flow; this only
// decides how the page looks, so both layouts start playback the same way.
export function TvTitle({
  hero,
  onPlay,
  resume,
  recs,
  videos,
  children
}: TvTitleProps): React.JSX.Element {
  const unreleased = !!hero.releaseLabel
  const [openVideo, setOpenVideo] = useState<TmdbVideo | null>(null)
  const trailer = videos[0]
  return (
    <div className="flex flex-col gap-12 pb-16">
      <TvHero
        title={hero.title}
        logo={hero.logo}
        backdrop={hero.backdrop}
        description={hero.description}
        year={hero.year}
        timing={unreleased ? (hero.releaseLabel ?? '') : hero.runtime}
        rating={hero.rating}
        // The first tag names the kind ("Movie", "Series"); the TV hero lists genres only.
        genres={hero.tags.slice(1)}
        imdb={hero.imdb}
        metacritic={hero.metacritic}
        starring={hero.starring}
        director={hero.director}
        actions={
          <>
            <TvPlayButton onClick={onPlay} disabled={unreleased} resume={resume} />
            {trailer ? (
              <TvSecondaryButton onClick={() => setOpenVideo(trailer)}>
                <ClapboardIcon className="size-6" />
                Trailer
              </TvSecondaryButton>
            ) : null}
            <AddToListsPopover
              mediaType={hero.mediaType}
              tmdbId={hero.tmdbId}
              title={hero.title}
              posterPath={hero.posterPath}
            >
              <TvSecondaryButton>
                <PlusIcon className="size-6" />
                My lists
              </TvSecondaryButton>
            </AddToListsPopover>
          </>
        }
      />
      {videos.length > 0 ? (
        <TvRow title="Videos">
          {videos.map((v) => (
            <TvVideoCard key={v.id} video={v} onOpen={() => setOpenVideo(v)} />
          ))}
        </TvRow>
      ) : null}
      {children}
      {recs.length > 0 ? <TvPosterRow title="More like this" items={recs} /> : null}
      <VideoModal
        ytKey={openVideo?.key ?? null}
        title={openVideo?.name ?? ''}
        open={!!openVideo}
        onOpenChange={(o) => {
          if (!o) setOpenVideo(null)
        }}
        className="w-[min(1760px,85vw)]"
      />
    </div>
  )
}

function TvVideoCard({
  video,
  onOpen
}: {
  video: TmdbVideo
  onOpen: () => void
}): React.JSX.Element {
  // hqdefault always exists; its letterbox bars fall outside the 16:9 crop.
  const thumb = `https://i.ytimg.com/vi/${video.key}/hqdefault.jpg`
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group/video flex w-[400px] shrink-0 flex-col gap-4 text-left outline-none"
    >
      <span
        className={cn(
          'relative block h-[225px] w-full overflow-hidden rounded-xl bg-surface-2 bg-cover bg-center',
          IMAGE_EDGE,
          TV_HOVER_LIFT,
          'group-hover/video:scale-[1.05] group-hover/video:after:ring-white/20 group-focus-visible/video:scale-[1.05] group-focus-visible/video:after:ring-white/30'
        )}
        style={{ backgroundImage: `url(${thumb})` }}
      >
        <span
          aria-hidden
          className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity duration-(--hover-dur) group-hover/video:opacity-100"
        >
          <span className="flex size-16 items-center justify-center rounded-full bg-white text-black">
            <PlayIcon className="size-7" />
          </span>
        </span>
      </span>
      <span className="flex flex-col gap-1">
        <span className="line-clamp-1 text-[22px] leading-7 font-medium text-text">
          {video.name}
        </span>
        <span className="text-[18px] leading-6 font-medium text-text-muted">{video.type}</span>
      </span>
    </button>
  )
}

interface TvEpisodesProps {
  tvId: number
  seasons: TmdbSeasonSummary[]
  season: number
  onSeasonChange: (n: number) => void
  progressRows: Array<{
    season?: number
    episode?: number
    positionSec: number
    durationSec: number
    watchedAt?: number
  }> | null
  onPlay: (season: number, episode: number, episodeName?: string) => void
}

export function TvEpisodes({
  tvId,
  seasons,
  season,
  onSeasonChange,
  progressRows,
  onPlay
}: TvEpisodesProps): React.JSX.Element | null {
  const data = useQuery(tvSeasonQuery(tvId, season))
  const episodes = data.data?.episodes ?? []

  const progressByEpisode = useMemo(() => {
    const map = new Map<number, { pct: number; watched: boolean }>()
    for (const r of progressRows ?? []) {
      if (r.season !== season || r.episode === undefined) continue
      const pct = r.durationSec > 0 ? (r.positionSec / r.durationSec) * 100 : 0
      map.set(r.episode, { pct, watched: r.watchedAt !== undefined || pct >= 95 })
    }
    return map
  }, [progressRows, season])

  const seasonOptions = useMemo(
    () => seasons.map((s) => ({ value: s.season_number, label: s.name })),
    [seasons]
  )

  if (seasons.length === 0) return null

  return (
    <section className="flex flex-col gap-2">
      {seasons.length > 1 ? (
        <div className="pb-3">
          <TvPillRow
            label="Seasons"
            options={seasonOptions}
            value={season}
            onChange={onSeasonChange}
          />
        </div>
      ) : null}
      <TvRow title={seasons.length > 1 ? 'Episodes' : (seasons[0]?.name ?? 'Episodes')}>
        {data.isLoading && episodes.length === 0
          ? Array.from({ length: 5 }).map((_, i) => (
              <div key={i} aria-hidden className="flex w-[400px] shrink-0 flex-col gap-4">
                <div className="h-[225px] animate-pulse rounded-xl bg-surface-2" />
                <div className="h-6 w-60 animate-pulse rounded-md bg-surface-2" />
                <div className="h-12 w-full animate-pulse rounded-md bg-surface-2" />
              </div>
            ))
          : episodes.map((ep) => {
              const prog = progressByEpisode.get(ep.episode_number)
              const still = tmdbImage(ep.still_path, 'w780')
              const runtime = ep.runtime ? formatRuntime(ep.runtime) : ''
              return (
                <button
                  key={ep.id}
                  type="button"
                  onClick={() => onPlay(season, ep.episode_number, ep.name)}
                  className="group/ep flex w-[400px] shrink-0 flex-col gap-4 text-left outline-none"
                >
                  <span
                    className={cn(
                      'relative block h-[225px] w-full overflow-hidden rounded-xl bg-surface-2 bg-cover bg-center',
                      IMAGE_EDGE,
                      'transition-[scale] duration-(--hover-dur) ease-(--hover-ease) group-active/ep:scale-[1.02]',
                      'group-hover/ep:scale-[1.05] group-hover/ep:after:ring-white/20 group-focus-visible/ep:scale-[1.05] group-focus-visible/ep:after:ring-white/30'
                    )}
                    style={{ backgroundImage: still ? `url(${still})` : undefined }}
                  >
                    <span
                      aria-hidden
                      className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity duration-(--hover-dur) group-hover/ep:opacity-100"
                    >
                      <span className="flex size-16 items-center justify-center rounded-full bg-white text-black">
                        <PlayIcon className="size-7" />
                      </span>
                    </span>
                    {prog?.watched ? (
                      <span className="absolute top-3 right-3 flex size-9 items-center justify-center rounded-full bg-black/70 text-white backdrop-blur-md">
                        <CheckIcon className="size-5" />
                        <span className="sr-only">Watched</span>
                      </span>
                    ) : null}
                    {prog && !prog.watched && prog.pct > 0 ? (
                      <span className="absolute inset-x-4 bottom-4">
                        <ProgressBar value={prog.pct} tone="light" />
                      </span>
                    ) : null}
                  </span>
                  <span className="flex items-baseline justify-between gap-4">
                    <span className="line-clamp-1 text-[22px] leading-7 font-medium text-text">
                      {ep.episode_number}. {ep.name}
                    </span>
                    {runtime ? (
                      <span className="shrink-0 text-[18px] leading-6 font-medium text-text-muted tabular-nums">
                        {runtime}
                      </span>
                    ) : null}
                  </span>
                  {ep.overview ? (
                    <span className="line-clamp-2 text-[18px] leading-[26px] font-normal text-text-tertiary">
                      {ep.overview}
                    </span>
                  ) : null}
                </button>
              )
            })}
      </TvRow>
    </section>
  )
}
