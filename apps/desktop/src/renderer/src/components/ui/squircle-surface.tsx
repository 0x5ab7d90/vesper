import { cn } from '@renderer/lib/cn'
import { SQUIRCLE_CLIP } from '@renderer/lib/squircle'

/**
 * The surface system from oa-design in Vesper's palette: a raised frame
 * (surface-2) holding a recessed inset (surface), both with continuous-
 * curvature corners. Geometry uses inline styles (not Tailwind arbitrary
 * values) so variants stay JIT-safe.
 *
 * Padding is left to callers: frames typically take p-1.5 (p-1 for sm).
 */

export type SquircleVariant = 'frame' | 'inset' | 'frame-sm' | 'inset-sm'

const GEOMETRY: Record<SquircleVariant, { radius: number; clip: number; handle: number }> = {
  frame: { radius: 26, clip: 14, handle: 2.25 },
  inset: { radius: 20, clip: 12, handle: 2.25 },
  'frame-sm': { radius: 18, clip: 10, handle: 2 },
  'inset-sm': { radius: 14, clip: 8, handle: 2 }
}

// The edge is an inset ring rather than a border: it takes no space, so nested surfaces keep
// their geometry, and it reads as light on the rim rather than a line drawn around the box.
const CHROME: Record<SquircleVariant, string> = {
  frame: 'bg-surface-2 shadow-edge',
  inset: 'bg-surface shadow-edge-soft',
  'frame-sm': 'bg-surface-2 shadow-edge',
  'inset-sm': 'bg-surface shadow-edge-soft'
}

export function squircleStyle(variant: SquircleVariant): React.CSSProperties {
  const g = GEOMETRY[variant]
  return {
    borderRadius: g.radius,
    clipPath: SQUIRCLE_CLIP,
    cornerShape: 'squircle',
    '--card-clip-radius': `${g.clip}px`,
    '--card-clip-handle': `${g.handle}px`
  } as React.CSSProperties
}

interface SquircleSurfaceProps extends React.HTMLAttributes<HTMLDivElement> {
  variant: SquircleVariant
}

export function SquircleSurface({
  variant,
  className,
  style,
  children,
  ...props
}: SquircleSurfaceProps): React.JSX.Element {
  return (
    <div
      className={cn('relative flex min-w-0 flex-col', CHROME[variant], className)}
      style={{ ...squircleStyle(variant), ...style }}
      {...props}
    >
      {children}
    </div>
  )
}
