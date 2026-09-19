import { useRef } from 'react'
import { Button as BaseButton } from '@base-ui/react/button'
import { usePreloadRoute, type PreloadTarget } from '@renderer/lib/use-preload-route'
import { cn } from '@renderer/lib/cn'
import { IMAGE_EDGE } from '@renderer/components/ui/image-outline'

export interface PosterCardProps {
  title: string
  poster: string
  onClick?: () => void
  preload?: PreloadTarget | null
}

export function PosterCard({
  title,
  poster,
  onClick,
  preload
}: PosterCardProps): React.JSX.Element {
  const ref = useRef<HTMLButtonElement>(null)
  usePreloadRoute(ref, preload ?? null)
  return (
    <BaseButton
      ref={ref}
      onClick={onClick}
      className={cn(
        'relative h-[210px] w-[140px] shrink-0 overflow-hidden rounded-xl bg-surface-2 bg-cover bg-center outline-none focus-visible:ring-2 focus-visible:ring-white/40',
        IMAGE_EDGE
      )}
      style={{ backgroundImage: `url(${poster})` }}
      aria-label={title}
    />
  )
}
