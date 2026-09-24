import { Dialog } from '@base-ui/react/dialog'
import { squircleStyle } from '@renderer/components/ui/squircle-surface'
import { cn } from '@renderer/lib/cn'

interface VideoModalProps {
  ytKey: string | null
  title: string
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Overrides the player's width; Big Picture plays trailers larger. */
  className?: string
}

export function VideoModal({
  ytKey,
  title,
  open,
  onOpenChange,
  className
}: VideoModalProps): React.JSX.Element {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md" />
        <Dialog.Popup
          className={cn(
            'fixed top-1/2 left-1/2 z-50 w-[min(1100px,90vw)] -translate-x-1/2 -translate-y-1/2 overflow-hidden bg-black shadow-2xl',
            className
          )}
          style={squircleStyle('frame')}
          aria-label={title}
        >
          <div className="aspect-video w-full">
            {ytKey ? (
              <iframe
                key={ytKey}
                src={`https://www.youtube-nocookie.com/embed/${ytKey}?autoplay=1&modestbranding=1&rel=0`}
                title={title}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                className="h-full w-full border-0"
              />
            ) : null}
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
