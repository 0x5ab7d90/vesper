import { useState } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@renderer/lib/cn'

// The inset outline gives a pale or mostly-white avatar an edge against the surface.
const avatarVariants = cva(
  'block shrink-0 overflow-hidden bg-surface-3 object-cover outline-1 -outline-offset-1 outline-white/10',
  {
    variants: {
      size: {
        xs: 'size-5',
        sm: 'size-6',
        md: 'size-8',
        lg: 'size-14',
        xl: 'size-16',
        '2xl': 'size-20',
        '3xl': 'size-[100px]'
      },
      shape: {
        circle: 'rounded-full',
        square: 'rounded-md'
      }
    },
    defaultVariants: {
      size: 'md',
      shape: 'circle'
    }
  }
)

type AvatarProps = Omit<React.ImgHTMLAttributes<HTMLImageElement>, 'src' | 'alt'> &
  VariantProps<typeof avatarVariants> & {
    src?: string
    alt?: string
    /** Seed for the dicebear glass fallback. Falls back to `alt` when missing. */
    seed?: string
    ref?: React.Ref<HTMLImageElement>
  }

function glassUrl(seed: string): string {
  return `https://api.dicebear.com/9.x/glass/svg?seed=${encodeURIComponent(seed)}`
}

export function Avatar({
  className,
  src,
  alt,
  seed,
  size,
  shape,
  ref,
  ...props
}: AvatarProps): React.JSX.Element {
  const [errored, setErrored] = useState(false)
  const fallbackSeed = seed ?? alt ?? 'vesper'
  const actualSrc = src && !errored ? src : glassUrl(fallbackSeed)
  return (
    <img
      ref={ref}
      src={actualSrc}
      alt={alt ?? ''}
      onError={() => setErrored(true)}
      className={cn(avatarVariants({ size, shape }), className)}
      {...props}
    />
  )
}
