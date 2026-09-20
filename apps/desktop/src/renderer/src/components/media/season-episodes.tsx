import { useEffect, useMemo, useState } from 'react'
import { Menu } from '@base-ui/react/menu'
import { useQuery } from '@tanstack/react-query'
import { useMutation, useQuery as useConvexQuery } from 'convex/react'
import { useRef } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { ScrollChevrons } from '@renderer/components/ui/scroll-chevrons'
import { EpisodeCard } from './episode-card'
import { tvSeasonQuery } from '@renderer/lib/tmdb-queries'
import { shareUrlForEpisode } from '@renderer/lib/share-url'
import type { TmdbEpisode, TmdbSeasonSummary, TmdbTvDetails } from '@renderer/lib/tmdb'
import { cn } from '@renderer/lib/cn'
import { api } from '@convex/_generated/api'
import { scrollFadeStyle, useScrollEdges } from '@renderer/lib/scroll-edges'

interface SeasonEpisodesProps {
  details: TmdbTvDetails
  imdbId?: string
  onPlay: (season: number, episode: number, episodeName?: string) => void
  season: number
  onSeasonChange: (n: number) => void
  focusSeason?: number
  focusEpisode?: number
}

export function SeasonEpisodes({
  details,
  imdbId,
  onPlay,
  season,
  onSeasonChange,
  focusSeason,
  focusEpisode
}: SeasonEpisodesProps): React.JSX.Element | null {
  const navigate = useNavigate()
  const seasons = useMemo(
    () => details.seasons.filter((s) => s.season_number > 0 && s.episode_count > 0),
    [details.seasons]
  )

  const progressRows = useConvexQuery(api.playback.listForSeries, imdbId ? { imdbId } : 'skip')

  // Last episode of the last season: marking it watched finishes the whole show.
  const finale = useMemo(() => {
    const last = seasons.reduce<TmdbSeasonSummary | null>(
      (best, s) => (!best || s.season_number > best.season_number ? s : best),
      null
    )
    return last ? { season: last.season_number, episode: last.episode_count } : null
  }, [seasons])

  if (seasons.length === 0) return null
  const seasonNum = season

  const onFocusApplied = (): void => {
    if (focusSeason === undefined && focusEpisode === undefined) return
    void navigate({
      to: '/tv/$id',
      params: { id: String(details.id) },
      search: (prev) => {
        const next = { ...(prev as Record<string, unknown>) }
        delete next.focusSeason
        delete next.focusEpisode
        return next
      },
      replace: true
    })
  }

  return (
    <section className="flex flex-col gap-4">
      <div className="px-6">
        <SeasonSelector seasons={seasons} active={seasonNum} onChange={onSeasonChange} />
      </div>
      <EpisodesRow
        tvId={details.id}
        seasonNumber={seasonNum}
        imdbId={imdbId}
        tmdbId={details.id}
        title={details.name}
        posterPath={details.poster_path ?? undefined}
        backdropPath={details.backdrop_path ?? undefined}
        progressRows={progressRows ?? null}
        finale={finale}
        onPlay={(ep, epName) => onPlay(seasonNum, ep, epName)}
        focusEpisode={focusSeason === seasonNum ? focusEpisode : undefined}
        onFocusApplied={onFocusApplied}
      />
    </section>
  )
}

function SeasonSelector({
  seasons,
  active,
  onChange
}: {
  seasons: TmdbSeasonSummary[]
  active: number
  onChange: (n: number) => void
}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const activeName = seasons.find((s) => s.season_number === active)?.name ?? `Season ${active}`

  return (
    <Menu.Root open={open} onOpenChange={setOpen}>
      <Menu.Trigger className="inline-flex items-center gap-2 self-start rounded-md bg-transparent p-1 outline-none">
        <span className="text-[20px] leading-7 font-bold tracking-[-0.01em] text-text">
          {activeName}
        </span>
        <svg
          viewBox="0 0 24 24"
          width="14"
          height="14"
          className={cn('text-text-tertiary transition-transform', open && 'rotate-180')}
          aria-hidden
        >
          <path d="M7 10l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="2" />
        </svg>
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner side="bottom" align="start" sideOffset={6} className="z-[100]">
          <Menu.Popup className="flex max-h-[320px] w-[200px] flex-col overflow-y-auto rounded-lg bg-surface-2 p-1 shadow-[0_4px_16px_rgba(0,0,0,0.3)] outline-none">
            {seasons.map((s) => (
              <Menu.Item
                key={s.id}
                onClick={() => onChange(s.season_number)}
                className={cn(
                  'rounded-md px-3 py-2 text-left text-[13px] font-medium outline-none data-[highlighted]:bg-white/[0.06]',
                  s.season_number === active ? 'text-text' : 'text-text-secondary'
                )}
              >
                {s.name}
              </Menu.Item>
            ))}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  )
}

interface EpisodesRowProps {
  tvId: number
  seasonNumber: number
  imdbId?: string
  tmdbId: number
  title: string
  posterPath?: string
  backdropPath?: string
  progressRows: Array<{
    season?: number
    episode?: number
    positionSec: number
    durationSec: number
    watchedAt?: number
  }> | null
  finale: { season: number; episode: number } | null
  onPlay: (episode: number, episodeName?: string) => void
  focusEpisode?: number
  onFocusApplied?: () => void
}

function EpisodesRow({
  tvId,
  seasonNumber,
  imdbId,
  tmdbId,
  title,
  posterPath,
  backdropPath,
  progressRows,
  finale,
  onPlay,
  focusEpisode,
  onFocusApplied
}: EpisodesRowProps): React.JSX.Element {
  const season = useQuery(tvSeasonQuery(tvId, seasonNumber))
  const markWatched = useMutation(api.playback.markWatched)
  const removeProgress = useMutation(api.playback.remove)
  const scrollRef = useRef<HTMLDivElement>(null)
  const edges = useScrollEdges(scrollRef)

  const progressByEpisode = useMemo(() => {
    const map = new Map<number, { pct: number; watched: boolean }>()
    for (const r of progressRows ?? []) {
      if (r.season !== seasonNumber || r.episode === undefined) continue
      const pct = r.durationSec > 0 ? (r.positionSec / r.durationSec) * 100 : 0
      map.set(r.episode, { pct, watched: r.watchedAt !== undefined || pct >= 95 })
    }
    return map
  }, [progressRows, seasonNumber])

  const episodes: TmdbEpisode[] = season.data?.episodes ?? []
  const [highlight, setHighlight] = useState<number | undefined>()

  useEffect(() => {
    if (focusEpisode === undefined) return
    if (episodes.length === 0) return
    const target = scrollRef.current?.querySelector<HTMLElement>(`[data-episode="${focusEpisode}"]`)
    if (!target) return
    target.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'instant' })
    setHighlight(focusEpisode)
    const t = setTimeout(() => setHighlight(undefined), 2600)
    onFocusApplied?.()
    return () => clearTimeout(t)
  }, [focusEpisode, episodes, onFocusApplied])

  const onMarkWatched = (ep: TmdbEpisode): void => {
    if (!imdbId) return
    void markWatched({
      imdbId,
      mediaType: 'tv',
      season: seasonNumber,
      episode: ep.episode_number,
      tmdbId,
      title,
      posterPath,
      backdropPath,
      episodeLabel: `${title} · S${pad(seasonNumber)}E${pad(ep.episode_number)}`,
      runtimeSec: ep.runtime ? ep.runtime * 60 : undefined,
      isSeriesFinale: finale?.season === seasonNumber && finale?.episode === ep.episode_number
    })
  }

  const onMarkUnwatched = (ep: TmdbEpisode): void => {
    if (!imdbId) return
    void removeProgress({ imdbId, season: seasonNumber, episode: ep.episode_number })
  }

  const onShare = (ep: TmdbEpisode): void => {
    void navigator.clipboard
      ?.writeText(shareUrlForEpisode(tmdbId, seasonNumber, ep.episode_number))
      .catch(() => {})
  }

  if (season.isLoading && episodes.length === 0) {
    return (
      <div className="flex gap-3 py-1 pl-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="h-[140px] w-[220px] shrink-0 animate-pulse rounded-xl bg-white/[0.04]"
          />
        ))}
      </div>
    )
  }

  if (episodes.length === 0) {
    return <p className="px-6 text-[13px] text-text-muted">No episodes.</p>
  }

  return (
    <div className="group relative">
      <div
        ref={scrollRef}
        className="scroll-hide flex gap-3 overflow-x-auto py-1 pl-6"
        style={scrollFadeStyle(edges)}
      >
        {episodes.map((ep) => {
          const prog = progressByEpisode.get(ep.episode_number)
          return (
            <EpisodeCard
              key={ep.id}
              episode={ep}
              progressPct={prog?.pct}
              watched={prog?.watched}
              focused={highlight === ep.episode_number}
              onPlay={() => onPlay(ep.episode_number, ep.name)}
              onMarkWatched={() => onMarkWatched(ep)}
              onMarkUnwatched={() => onMarkUnwatched(ep)}
              onShare={() => onShare(ep)}
            />
          )
        })}
      </div>
      <ScrollChevrons scrollRef={scrollRef} />
    </div>
  )
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n)
}
