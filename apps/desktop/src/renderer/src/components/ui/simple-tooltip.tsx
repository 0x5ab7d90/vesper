import { Tooltip } from '@base-ui/react/tooltip'
import { cn } from '@renderer/lib/cn'

/**
 * A plain tooltip in the shadcn shape: hover the trigger, a small dark bubble appears above it.
 * Base UI positions it in a portal and keeps it inside the viewport, so it works from inside
 * clipped or scrolling containers where the inline `Tooltip` would be cut off.
 */
export function SimpleTooltip({
  content,
  children,
  side = 'top',
  className
}: {
  content: React.ReactNode
  /** The trigger. Rendered as-is; hover and focus handlers are attached to it. */
  children: React.ReactElement
  side?: 'top' | 'bottom' | 'left' | 'right'
  className?: string
}): React.JSX.Element {
  // Delay and grouping come from the app-wide Tooltip.Provider in main.tsx: the first tooltip
  // waits, then its neighbours open at once.
  return (
    <>
      <Tooltip.Root>
        <Tooltip.Trigger render={children} />
        <Tooltip.Portal>
          <Tooltip.Positioner side={side} sideOffset={6} collisionPadding={8} className="z-[100]">
            <Tooltip.Popup
              className={cn(
                'max-w-[240px] rounded-md bg-surface-3 px-2.5 py-1.5 text-[12px] leading-4 font-medium text-text shadow-[0_4px_16px_rgba(0,0,0,0.3)] outline-none',
                'origin-(--transform-origin) transition-[opacity,scale] duration-150 ease-(--ease-out) data-[starting-style]:scale-95 data-[starting-style]:opacity-0 data-[ending-style]:opacity-0 data-[ending-style]:duration-75',
                className
              )}
            >
              {content}
            </Tooltip.Popup>
          </Tooltip.Positioner>
        </Tooltip.Portal>
      </Tooltip.Root>
    </>
  )
}
