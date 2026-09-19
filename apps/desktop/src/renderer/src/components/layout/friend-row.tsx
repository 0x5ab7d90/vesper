import { ProgressBar } from '@renderer/components/ui/progress-bar'
import { Tooltip } from '@renderer/components/ui/tooltip'
import { cn } from '@renderer/lib/cn'
import { IMG_OUTLINE } from '@renderer/components/ui/image-outline'

export type FriendStatus = 'watching' | 'paused' | 'idle' | 'offline'

const STATUS_LABEL: Record<FriendStatus, string> = {
  watching: 'Watching',
  paused: 'Paused',
  idle: 'Online',
  offline: 'Offline'
}

const STATUS_DOT: Record<FriendStatus, string> = {
  watching: 'bg-[#3ba55d]',
  paused: 'bg-[#3ba55d]',
  idle: 'bg-[#3ba55d]',
  offline: 'bg-[#747f8d]'
}

export interface FriendRowProps {
  name: string
  show: string
  poster: string
  status: FriendStatus
  glassSeed: string
  avatarUrl?: string
  progress?: number
  timestamp?: string
  pausedText?: string
  onClick?: () => void
}

function glassUrl(seed: string): string {
  return `https://api.dicebear.com/9.x/glass/svg?seed=${encodeURIComponent(seed)}`
}

function StatusDot({
  status,
  size,
  className,
  positionStyle
}: {
  status: FriendStatus
  size: number
  className?: string
  positionStyle?: React.CSSProperties
}): React.JSX.Element {
  return (
    <Tooltip label={STATUS_LABEL[status]} className={className} style={positionStyle}>
      <span
        className={cn('rounded-full ring-2 ring-surface', STATUS_DOT[status])}
        style={{ width: size, height: size }}
      />
    </Tooltip>
  )
}

function Avatar({
  avatarUrl,
  glassSeed,
  size,
  dotSize
}: {
  avatarUrl?: string
  glassSeed: string
  size: number
  dotSize?: { status: FriendStatus; size: number }
}): React.JSX.Element {
  const src = avatarUrl ?? glassUrl(glassSeed)
  const dotOffset = dotSize && dotSize.size <= 10 ? -2 : 0
  return (
    <span className="relative inline-flex shrink-0" style={{ width: size, height: size }}>
      <img
        src={src}
        alt=""
        aria-hidden
        className={cn('h-full w-full rounded-full object-cover', IMG_OUTLINE)}
      />
      {dotSize ? (
        <StatusDot
          status={dotSize.status}
          size={dotSize.size}
          className="absolute"
          positionStyle={{ right: dotOffset, bottom: dotOffset }}
        />
      ) : null}
    </span>
  )
}

export function FriendRow({
  name,
  show,
  poster,
  status,
  glassSeed,
  avatarUrl,
  progress,
  timestamp,
  pausedText,
  onClick
}: FriendRowProps): React.JSX.Element {
  const RowEl = onClick ? 'button' : 'div'
  const hasPoster = poster.length > 0

  return (
    <RowEl
      {...(onClick ? { type: 'button' as const, onClick } : {})}
      className={cn(
        // 22px outer = the poster's 14px + the 8px padding, so the corners stay concentric.
        'flex w-full gap-[10px] rounded-2xl bg-transparent p-2 text-left outline-none',
        onClick && 'hover:bg-white/[0.04]'
      )}
    >
      {hasPoster ? (
        <div
          className={cn('size-14 shrink-0 rounded-[14px] bg-cover bg-center', IMG_OUTLINE)}
          style={{ backgroundImage: `url(${poster})` }}
          aria-label={show}
        />
      ) : (
        <Avatar
          avatarUrl={avatarUrl}
          glassSeed={glassSeed}
          size={56}
          dotSize={{ status, size: 14 }}
        />
      )}

      <div className="flex min-w-0 flex-1 flex-col justify-center gap-1">
        <div className="flex min-w-0 items-center gap-2">
          {hasPoster ? (
            <Avatar
              avatarUrl={avatarUrl}
              glassSeed={glassSeed}
              size={18}
              dotSize={{ status, size: 8 }}
            />
          ) : null}
          <span className="truncate text-[13px] leading-4 font-medium text-text">{name}</span>
        </div>
        <span className="truncate text-[12px] leading-4 font-medium text-text-tertiary">
          {show}
        </span>
        {status === 'paused' && pausedText ? (
          <span className="text-[12px] leading-4 font-medium text-text-muted">{pausedText}</span>
        ) : progress !== undefined ? (
          <div className="flex items-center gap-2">
            <ProgressBar value={progress} variant="interior" className="flex-1" />
            <span className="shrink-0 text-[11px] leading-[14px] font-medium text-text-muted tabular-nums">
              {timestamp}
            </span>
          </div>
        ) : (
          <span className="text-[11px] leading-[14px] font-medium text-text-muted tabular-nums">
            {timestamp}
          </span>
        )}
      </div>
    </RowEl>
  )
}
