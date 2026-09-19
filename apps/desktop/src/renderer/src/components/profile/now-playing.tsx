import { useNavigate } from '@tanstack/react-router'
import type { FunctionReturnType } from 'convex/server'
import { ProgressBar } from '@renderer/components/ui/progress-bar'
import { squircleStyle } from '@renderer/components/ui/squircle-surface'
import { closeProfile } from '@renderer/lib/profile-modal'
import { tmdbImage } from '@renderer/lib/tmdb'
import { useInterpolatedProgress } from '@renderer/lib/use-interpolated-progress'
import { api } from '@convex/_generated/api'

export type NowPlayingData = FunctionReturnType<typeof api.playback.nowPlayingByUsername>
type Now = NonNullable<NowPlayingData>

/** "S03E07 · One Minute": the code, then the episode's name when we have it. */
function episodeText(season?: number, episode?: number, label?: string): string | null {
  const code =
    season !== undefined && episode !== undefined
      ? `S${String(season).padStart(2, '0')}E${String(episode).padStart(2, '0')}`
      : null
  if (code && label) return `${code} · ${label}`
  return code ?? label ?? null
}

/** h:mm:ss past an hour, m:ss under it; both sides of the readout use the same shape. */
function clock(sec: number, hours: boolean): string {
  const s = Math.max(0, Math.floor(sec))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const r = s % 60
  const mm = hours ? String(m).padStart(2, '0') : String(m)
  return `${hours ? `${h}:` : ''}${mm}:${String(r).padStart(2, '0')}`
}

/**
 * The card's live block: what this person is watching or paused on right now, with the same
 * shader bar the friends sidebar draws. Renders nothing when they are idle, so the card only
 * grows when there is something to say. No entrance animation: it lands with the rest of the
 * card, and popping in late would make it read as something that happened rather than a fact.
 */
export function NowPlaying({ now }: { now: NowPlayingData }): React.JSX.Element | null {
  return now ? <NowPlayingCard now={now} /> : null
}

function NowPlayingCard({ now }: { now: Now }): React.JSX.Element {
  const navigate = useNavigate()
  // Ticks forward between server updates while playing, so the seconds read as live.
  const pct = useInterpolatedProgress({
    positionSec: now.positionSec,
    durationSec: now.durationSec,
    updatedAt: now.updatedAt,
    state: now.status === 'watching' ? 'playing' : 'paused'
  })
  const currentSec = (pct / 100) * now.durationSec
  const hours = now.durationSec >= 3600
  const readout = `${clock(currentSec, hours)} of ${clock(now.durationSec, hours)}`
  const episode = episodeText(now.season, now.episode, now.episodeLabel)

  return (
    <button
      type="button"
      onClick={() => {
        closeProfile()
        navigate({
          to: now.mediaType === 'movie' ? '/movie/$id' : '/tv/$id',
          params: { id: String(now.tmdbId) },
          viewTransition: false
        })
      }}
      className="flex w-full items-center gap-3 bg-surface-2 p-2 text-left shadow-edge outline-none transition-[scale] duration-(--press-dur) ease-(--press-ease) hover:bg-surface-3 active:scale-[0.98]"
      style={squircleStyle('inset-sm')}
      aria-label={`${now.status === 'watching' ? 'Watching' : 'Paused on'} ${now.title}, ${readout}`}
    >
      <span
        aria-hidden
        className="h-[54px] w-9 shrink-0 rounded-[6px] bg-surface-3 bg-cover bg-center"
        style={{ backgroundImage: `url(${tmdbImage(now.posterPath, 'w154') ?? ''})` }}
      />
      <span className="flex min-w-0 flex-1 flex-col gap-1.5">
        <span className="flex min-w-0 flex-col">
          <span className="truncate text-[13px] leading-4 font-medium text-text">{now.title}</span>
          {episode ? (
            <span className="truncate text-[11px] leading-4 font-medium text-text-muted">
              {episode}
            </span>
          ) : null}
        </span>
        <span className="flex items-baseline justify-between gap-2 text-[11px] leading-4 font-medium tabular-nums text-text-tertiary">
          <span>
            {clock(currentSec, hours)}
            {now.status === 'paused' ? <span className="text-text-muted"> · Paused</span> : null}
          </span>
          <span>{clock(now.durationSec, hours)}</span>
        </span>
        <ProgressBar variant="interior" value={pct} />
      </span>
    </button>
  )
}
