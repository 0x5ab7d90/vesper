import { memo, useRef } from 'react'
import { useQuery } from 'convex/react'
import { useNavigate } from '@tanstack/react-router'
import { IconButton } from '@renderer/components/ui/icon-button'
import { Button } from '@renderer/components/ui/button'
import { PeopleGroupIcon, SidebarRightIcon } from '@renderer/components/icons'
import { FriendRow, type FriendStatus } from './friend-row'
import { FriendContextMenu } from './friend-context-menu'
import { tmdbImage } from '@renderer/lib/tmdb'
import { useInterpolatedProgress } from '@renderer/lib/use-interpolated-progress'
import { useSmoothScroll } from '@renderer/hooks/use-smooth-scroll'
import { cn } from '@renderer/lib/cn'
import { openProfile } from '@renderer/lib/profile-modal'
import { api } from '@convex/_generated/api'
import type { FunctionReturnType } from 'convex/server'

type ActivityRow = FunctionReturnType<typeof api.friendships.listActivity>[number]

export const RightSidebar = memo(function RightSidebar({
  onCollapse
}: {
  onCollapse: () => void
}): React.JSX.Element {
  const navigate = useNavigate()
  const rows = useQuery(api.friendships.listActivity)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const scrollContentRef = useRef<HTMLDivElement | null>(null)
  useSmoothScroll(scrollRef, scrollContentRef)

  return (
    <aside
      className={cn(
        'relative flex h-full w-full min-w-0 flex-col overflow-hidden rounded-lg bg-surface px-2 pt-4'
      )}
    >
      <header className={cn('flex h-12 items-center justify-between px-2')}>
        <h2 className={cn('text-[16px] leading-5 font-medium text-text')}>Friends</h2>
        <IconButton variant="ghost" size="md" aria-label="Collapse" onClick={onCollapse}>
          <SidebarRightIcon className={cn('size-[18px]')} />
        </IconButton>
      </header>
      <div ref={scrollRef} className={cn('scroll-hide flex-1 overflow-y-auto')}>
        <div ref={scrollContentRef}>
          {rows === undefined ? null : rows.length === 0 ? (
            <EmptyState onFindFriends={() => navigate({ to: '/friends' })} />
          ) : (
            <ul className={cn('flex flex-col')}>
              {rows.map((row) => (
                <li key={row.userId}>
                  <ActivityRow row={row} onClick={() => openProfile(row.username)} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </aside>
  )
})

function ActivityRow({
  row,
  onClick
}: {
  row: ActivityRow
  onClick: () => void
}): React.JSX.Element {
  const status: FriendStatus = row.status
  const poster = row.playback?.posterPath ? (tmdbImage(row.playback.posterPath, 'w154') ?? '') : ''
  const showLine = row.playback
    ? row.playback.season && row.playback.episode
      ? `${row.playback.title ?? 'Untitled'}, S${pad(row.playback.season)}E${pad(row.playback.episode)}`
      : (row.playback.title ?? 'Untitled')
    : ''

  const interpolatedPct = useInterpolatedProgress({
    positionSec: row.playback?.positionSec ?? 0,
    durationSec: row.playback?.durationSec ?? 0,
    updatedAt: row.playback?.updatedAt ?? 0,
    state: row.playback?.state
  })

  const progress = status === 'watching' && row.playback ? Math.round(interpolatedPct) : undefined
  const elapsedTimestamp =
    status === 'watching' && row.playback
      ? `${formatRemaining(row.playback.durationSec - row.playback.positionSec)} left`
      : undefined
  const idleSince = row.playback?.updatedAt ?? row.lastDisconnected
  const idleTimestamp =
    status === 'idle' || status === 'offline' ? formatRelative(idleSince) : undefined
  const pausedText =
    status === 'paused' && row.playback
      ? `Paused, ${formatRemaining(row.playback.durationSec - row.playback.positionSec)} left`
      : undefined

  const showText = showLine
    ? showLine
    : status === 'offline'
      ? idleTimestamp
        ? `Active ${idleTimestamp}`
        : 'Offline'
      : status === 'idle'
        ? idleTimestamp
          ? `Active ${idleTimestamp}`
          : 'Online'
        : '—'

  return (
    <FriendContextMenu
      username={row.username}
      playback={
        row.playback
          ? {
              tmdbId: row.playback.tmdbId,
              mediaType: row.playback.mediaType,
              title: row.playback.title,
              posterPath: row.playback.posterPath
            }
          : null
      }
    >
      <FriendRow
        name={row.displayName}
        show={showText}
        poster={poster}
        status={status}
        glassSeed={row.username}
        avatarUrl={row.avatarUrl}
        progress={progress}
        timestamp={elapsedTimestamp ?? (showLine ? idleTimestamp : undefined)}
        pausedText={pausedText}
        onClick={onClick}
      />
    </FriendContextMenu>
  )
}

function EmptyState({ onFindFriends }: { onFindFriends: () => void }): React.JSX.Element {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-3 px-4 py-12 text-center')}>
      <PeopleGroupIcon className={cn('size-7 text-text-muted')} />
      <p className={cn('text-[13px] leading-4 font-medium text-text-tertiary')}>
        No activity yet — add friends to see what they&rsquo;re watching.
      </p>
      <Button variant="secondary" size="sm" onClick={onFindFriends}>
        Find friends
      </Button>
    </div>
  )
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n)
}

function formatRemaining(sec: number): string {
  const m = Math.max(0, Math.floor(sec / 60))
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  const rm = m % 60
  return rm ? `${h}h ${rm}m` : `${h}h`
}

function formatRelative(ts: number): string {
  if (!ts) return ''
  const diffMs = Date.now() - ts
  if (diffMs < 60_000) return 'just now'
  const m = Math.floor(diffMs / 60_000)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  return `${d}d ago`
}
