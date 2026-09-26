import { cn } from '@renderer/lib/cn'
import { IMG_OUTLINE } from '@renderer/components/ui/image-outline'

export interface FightEventCardProps {
  title: string
  poster?: string
  live: boolean
  /** Local start time label for upcoming fights, e.g. "4:30 PM". */
  timeLabel?: string
  onClick?: () => void
}

// A Fight is an event, not a title: the card is landscape like Continue
// Watching, with the state pill (LIVE or start time) where the viewer's eye
// lands first. Without an onClick the card renders inert.
// Central Icons "people-versus" — the placeholder mark for fights without a poster.
function VersusGlyph(): React.JSX.Element {
  return (
    <svg
      width="40"
      height="40"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      className="text-white/15"
    >
      <path
        d="M19.25 12.75C19.25 13.9926 18.2426 15 17 15C15.7574 15 14.75 13.9926 14.75 12.75C14.75 11.5074 15.7574 10.5 17 10.5C18.2426 10.5 19.25 11.5074 19.25 12.75Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M17.0006 17C14.9962 17 13.4962 18.3307 12.9517 20.1788C12.7858 20.7417 13.2554 21.25 13.8422 21.25H20.1591C20.7458 21.25 21.2154 20.7417 21.0496 20.1788C20.505 18.3307 19.0051 17 17.0006 17Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M9.25 5C9.25 6.24264 8.24264 7.25 7 7.25C5.75736 7.25 4.75 6.24264 4.75 5C4.75 3.75736 5.75736 2.75 7 2.75C8.24264 2.75 9.25 3.75736 9.25 5Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M9.50064 10.0892C8.81878 9.56026 7.96853 9.25 7.00064 9.25C4.99617 9.25 3.49623 10.5807 2.95169 12.4288C2.78584 12.9917 3.25544 13.5 3.84222 13.5H8.00064"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M8.25 21.25L15.75 2.75"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function FightEventCard({
  title,
  poster,
  live,
  timeLabel,
  onClick
}: FightEventCardProps): React.JSX.Element {
  const clickable = Boolean(onClick)
  const content = (
    <>
      <div className="absolute inset-0 flex items-center justify-center bg-surface-2">
        <VersusGlyph />
      </div>
      {poster ? (
        <img
          src={poster}
          alt=""
          decoding="async"
          loading="lazy"
          className={cn('absolute inset-0 h-full w-full object-cover', IMG_OUTLINE)}
          onError={(e) => {
            e.currentTarget.style.display = 'none'
          }}
        />
      ) : null}
      <div
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(180deg, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0) 40%, rgba(0,0,0,0.85) 100%)'
        }}
      />
      <div className="relative flex items-start">
        {live ? (
          <span className="flex items-center gap-1.5 rounded-full bg-black/60 px-2.5 py-1 text-[11px] leading-[14px] font-bold tracking-[0.08em] text-white uppercase backdrop-blur-sm">
            <span aria-hidden className="size-1.5 rounded-full bg-[#f43]" />
            Live
          </span>
        ) : timeLabel ? (
          <span className="rounded-full bg-black/60 px-2.5 py-1 text-[11px] leading-[14px] font-bold text-white/90 tabular-nums backdrop-blur-sm">
            {timeLabel}
          </span>
        ) : null}
      </div>
      <div className="relative flex-1" />
      <span className="relative line-clamp-2 text-[14px] leading-[18px] font-semibold text-white drop-shadow-[0_2px_6px_rgba(0,0,0,0.5)]">
        {title}
      </span>
    </>
  )

  const className = cn(
    'relative flex h-[140px] w-[248px] shrink-0 flex-col overflow-hidden rounded-xl p-3 text-left outline-none',
    !clickable && 'cursor-default'
  )

  if (!clickable) {
    return (
      <div className={className} aria-label={title}>
        {content}
      </div>
    )
  }
  return (
    <button type="button" onClick={onClick} className={className} aria-label={title}>
      {content}
    </button>
  )
}
