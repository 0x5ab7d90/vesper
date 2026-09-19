import { useState } from 'react'
import { Menu } from '@base-ui/react/menu'
import { PlayIcon } from '@renderer/components/icons'
import { ProgressBar } from '@renderer/components/ui/progress-bar'
import { tmdbImage, type TmdbEpisode } from '@renderer/lib/tmdb'
import { cn } from '@renderer/lib/cn'
import { IMAGE_EDGE } from '@renderer/components/ui/image-outline'
import { POPUP_MOTION } from '@renderer/components/ui/popup-motion'

interface EpisodeCardProps {
  episode: TmdbEpisode
  progressPct?: number
  watched?: boolean
  focused?: boolean
  onPlay: () => void
  onMarkWatched: () => void
  onMarkUnwatched: () => void
  onShare: () => void
}

const DOTS_ICON = (
  <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden>
    <circle cx="5" cy="12" r="1.5" fill="currentColor" />
    <circle cx="12" cy="12" r="1.5" fill="currentColor" />
    <circle cx="19" cy="12" r="1.5" fill="currentColor" />
  </svg>
)

function formatMinutes(min: number | null): string {
  if (!min || min <= 0) return ''
  return `${min}m`
}

export function EpisodeCard({
  episode,
  progressPct,
  watched,
  focused,
  onPlay,
  onMarkWatched,
  onMarkUnwatched,
  onShare
}: EpisodeCardProps): React.JSX.Element {
  const [menuOpen, setMenuOpen] = useState(false)
  const still = tmdbImage(episode.still_path, 'w500') ?? ''
  const showProgress = progressPct !== undefined && progressPct > 0 && !watched
  const duration = formatMinutes(episode.runtime)

  return (
    <div
      data-episode={episode.episode_number}
      className={cn('group/episode relative rounded-xl', focused && 'episode-focus-pulse')}
    >
      <button
        type="button"
        onClick={onPlay}
        aria-label={`${episode.name}, S${episode.season_number} E${episode.episode_number}`}
        className={cn(
          'relative flex h-[140px] w-[220px] shrink-0 flex-col overflow-hidden rounded-xl bg-surface-2 bg-cover bg-center p-3 text-left outline-none',
          IMAGE_EDGE
        )}
        style={still ? { backgroundImage: `url(${still})` } : undefined}
      >
        <div
          className="absolute inset-0"
          style={{
            background:
              'linear-gradient(180deg, rgba(0,0,0,0.15) 0%, rgba(0,0,0,0) 40%, rgba(0,0,0,0.85) 100%)'
          }}
        />
        <div className="relative flex-1" />
        <div className="relative flex flex-col gap-1.5">
          <span className="line-clamp-1 max-w-[200px] text-[14px] leading-tight font-semibold text-white tabular-nums drop-shadow-[0_2px_6px_rgba(0,0,0,0.5)]">
            S{episode.season_number}E{episode.episode_number}, {episode.name}
          </span>
          <div className="flex items-center gap-2">
            <PlayIcon className="size-3.5 text-white" />
            {showProgress ? (
              <ProgressBar value={progressPct ?? 0} tone="light" className="flex-1" />
            ) : (
              <div className="flex-1" />
            )}
            {duration ? (
              <span className="shrink-0 text-[12px] leading-4 font-medium text-white tabular-nums">
                {duration}
              </span>
            ) : null}
          </div>
        </div>
      </button>

      <Menu.Root open={menuOpen} onOpenChange={setMenuOpen}>
        <Menu.Trigger
          aria-label="Episode options"
          className={cn(
            'absolute top-2 right-2 flex size-6 items-center justify-center rounded-md bg-black/40 text-white/80 outline-none hover:bg-black/60 hover:text-white',
            menuOpen ? 'opacity-100' : 'opacity-0 group-hover/episode:opacity-100'
          )}
        >
          {DOTS_ICON}
        </Menu.Trigger>
        <Menu.Portal>
          <Menu.Positioner side="bottom" align="end" sideOffset={4} className="z-[100]">
            <Menu.Popup
              className={cn(
                'flex w-[180px] flex-col rounded-lg bg-surface-2 p-1 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06),0_4px_16px_rgba(0,0,0,0.3)] outline-none',
                POPUP_MOTION
              )}
            >
              {watched ? (
                <Menu.Item
                  onClick={onMarkUnwatched}
                  className="rounded-md px-3 py-2 text-[13px] font-medium text-text outline-none data-[highlighted]:bg-white/[0.06]"
                >
                  Mark unwatched
                </Menu.Item>
              ) : (
                <Menu.Item
                  onClick={onMarkWatched}
                  className="rounded-md px-3 py-2 text-[13px] font-medium text-text outline-none data-[highlighted]:bg-white/[0.06]"
                >
                  Mark watched
                </Menu.Item>
              )}
              <Menu.Item
                onClick={onShare}
                className="rounded-md px-3 py-2 text-[13px] font-medium text-text outline-none data-[highlighted]:bg-white/[0.06]"
              >
                Share link
              </Menu.Item>
            </Menu.Popup>
          </Menu.Positioner>
        </Menu.Portal>
      </Menu.Root>

      {watched ? (
        <div
          className={cn(
            'pointer-events-none absolute top-2 left-2 flex size-5 items-center justify-center rounded-full bg-white/90 text-black'
          )}
          aria-label="Watched"
        >
          <svg viewBox="0 0 24 24" width="12" height="12" fill="none" aria-hidden>
            <path d="M5 12.5l5 5 10-10" stroke="currentColor" strokeWidth="2.5" />
          </svg>
        </div>
      ) : null}
    </div>
  )
}
