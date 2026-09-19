import { useRef } from 'react'
import { ProgressBar } from '@renderer/components/ui/progress-bar'
import { PlayIcon } from '@renderer/components/icons'
import { usePreloadRoute, type PreloadTarget } from '@renderer/lib/use-preload-route'
import { cn } from '@renderer/lib/cn'
import { IMAGE_EDGE } from '@renderer/components/ui/image-outline'

export interface ContinueCardProps {
  title: string
  backdrop: string
  logo?: string
  remaining: string
  progress: number
  onClick?: () => void
  preload?: PreloadTarget | null
}

export function ContinueCard({
  title,
  backdrop,
  logo,
  remaining,
  progress,
  onClick,
  preload
}: ContinueCardProps): React.JSX.Element {
  const ref = useRef<HTMLButtonElement>(null)
  usePreloadRoute(ref, preload ?? null)
  return (
    <button
      ref={ref}
      type="button"
      onClick={onClick}
      className={cn(
        'relative flex h-[140px] w-[220px] shrink-0 flex-col overflow-hidden rounded-xl bg-cover bg-center p-3 text-left outline-none',
        IMAGE_EDGE
      )}
      style={{ backgroundImage: `url(${backdrop})` }}
      aria-label={title}
    >
      <div
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(180deg, rgba(0,0,0,0.15) 0%, rgba(0,0,0,0) 40%, rgba(0,0,0,0.85) 100%)'
        }}
      />
      {logo ? (
        <img
          src={logo}
          alt={title}
          width={130}
          height={36}
          decoding="async"
          fetchPriority="high"
          className="relative max-h-9 w-auto max-w-[130px] self-start object-contain object-left drop-shadow-[0_2px_6px_rgba(0,0,0,0.5)]"
        />
      ) : (
        <span className="relative max-w-[180px] truncate text-[15px] leading-tight font-semibold text-white drop-shadow-[0_2px_6px_rgba(0,0,0,0.5)]">
          {title}
        </span>
      )}
      <div className="relative flex-1" />
      <div className="relative flex items-center gap-2">
        <PlayIcon className="size-3.5 text-white" />
        <ProgressBar value={progress} tone="light" className="flex-1" />
        <span className="shrink-0 text-[12px] leading-4 font-medium text-white tabular-nums">
          {remaining}
        </span>
      </div>
    </button>
  )
}
