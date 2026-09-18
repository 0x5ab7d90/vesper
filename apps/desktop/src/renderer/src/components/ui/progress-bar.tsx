import { cva, type VariantProps } from 'class-variance-authority'
import { m as motion, useReducedMotion } from 'motion/react'
import { cn } from '@renderer/lib/cn'
import { ShaderFill } from '@renderer/components/ui/shader-fill'

const trackVariants = cva('relative overflow-hidden rounded-[2px]', {
  variants: {
    tone: {
      dark: 'bg-surface-3',
      light: 'bg-white/25'
    },
    size: {
      sm: 'h-[3px]',
      md: 'h-1'
    }
  },
  defaultVariants: { tone: 'dark', size: 'sm' }
})

// Same spring as the splash's interior.dev port, so both bars settle at the same pace.
const FILL = { type: 'spring', stiffness: 210, damping: 34, mass: 0.9 } as const
const INSTANT = { duration: 0 } as const

type ProgressBarProps = React.HTMLAttributes<HTMLDivElement> &
  VariantProps<typeof trackVariants> & {
    value: number
    /**
     * flat: the hairline track used across cards.
     * interior: the interior.dev bar from the splash, a recessed padded track holding a violet
     * fill with a lit top edge, sized for a list row. Ignores `tone` and `size`.
     */
    variant?: 'flat' | 'interior'
    ref?: React.Ref<HTMLDivElement>
  }

export function ProgressBar({
  className,
  tone,
  size,
  value,
  variant = 'flat',
  ref,
  ...props
}: ProgressBarProps): React.JSX.Element {
  const clamped = Math.max(0, Math.min(100, value))
  const aria = {
    role: 'progressbar' as const,
    'aria-valuenow': clamped,
    'aria-valuemin': 0,
    'aria-valuemax': 100
  }

  if (variant === 'interior') {
    return <InteriorBar ref={ref} value={clamped} className={className} {...aria} {...props} />
  }

  return (
    <div ref={ref} {...aria} className={cn(trackVariants({ tone, size }), className)} {...props}>
      <div className="h-full rounded-[2px] bg-white" style={{ width: `${clamped}%` }} />
    </div>
  )
}

function InteriorBar({
  value,
  className,
  ref,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & {
  value: number
  ref?: React.Ref<HTMLDivElement>
}): React.JSX.Element {
  const reduced = useReducedMotion()
  // The fill is the full-width field revealed by a clip, not a stretched box, so the shader's
  // texture keeps its scale as the bar grows.
  const clip = `inset(0 ${100 - value}% 0 0 round 2px)`
  return (
    <div
      ref={ref}
      className={cn(
        'rounded-[4px] bg-[#171515] p-0.5 shadow-[inset_0_1px_2px_rgba(0,0,0,0.5),inset_0_0_0_1px_rgba(255,255,255,0.04)]',
        className
      )}
      {...props}
    >
      <div className="relative h-[5px] overflow-hidden rounded-[2px]">
        <motion.span
          aria-hidden
          className="absolute inset-0 block overflow-hidden rounded-[2px] bg-[#7a3fe4]"
          initial={false}
          animate={{ clipPath: clip }}
          transition={reduced ? INSTANT : FILL}
        >
          <ShaderFill bleed={28} timeScale={3} />
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 rounded-[2px] shadow-[inset_0_1px_0_rgba(255,255,255,0.35),inset_0_-1px_0_rgba(0,0,0,0.3)]"
          />
        </motion.span>
      </div>
    </div>
  )
}
