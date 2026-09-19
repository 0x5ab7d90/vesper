import { Dialog } from '@base-ui/react/dialog'
import { SquircleSurface } from '@renderer/components/ui/squircle-surface'
import { DitherCorner } from '@renderer/components/brand/dither-corner'
import { cn } from '@renderer/lib/cn'
import { BACKDROP_MOTION, DIALOG_MOTION } from '@renderer/components/ui/popup-motion'

interface OverviewModalProps {
  title: string
  overview: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function OverviewModal({
  title,
  overview,
  open,
  onOpenChange
}: OverviewModalProps): React.JSX.Element {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop
          className={cn('fixed inset-0 z-50 bg-black/60 backdrop-blur-sm', BACKDROP_MOTION)}
        />
        <Dialog.Popup
          className={cn(
            'fixed top-1/2 left-1/2 z-50 w-[min(560px,90vw)] -translate-x-1/2 -translate-y-1/2 outline-none',
            DIALOG_MOTION
          )}
          aria-label={title}
        >
          <SquircleSurface
            variant="frame"
            className="max-h-[70vh] p-1.5 shadow-[0_24px_64px_rgba(0,0,0,0.5)]"
          >
            {/* The frame's corner dither, as on the feedback and stream frames; the title and
                inset sit on their own layer above it. */}
            <DitherCorner />
            <h2 className="relative shrink-0 pt-1.5 pb-2 pl-2.5 text-[15px] leading-4 font-medium text-balance text-text">
              {title}
            </h2>
            <SquircleSurface variant="inset" className="relative min-h-0 overflow-hidden">
              <p className="scroll-hide overflow-y-auto px-4 py-3.5 text-[14px] leading-[1.6] font-medium text-pretty text-text-secondary">
                {overview}
              </p>
            </SquircleSurface>
          </SquircleSurface>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
