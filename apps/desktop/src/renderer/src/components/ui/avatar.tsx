import { useState } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { PersonSilhouette } from '@renderer/components/brand/person-silhouette'
import { DitherAvatar } from '@renderer/components/dither-kit/avatar'
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
    /** Seeds the generated mark when there is no picture. Falls back to `alt` when missing. */
    seed?: string
    /** What stands in when there is no picture: the generated mark, or a person's bust. */
    fallback?: 'mark' | 'silhouette'
    /** TMDB gender code, picking which bust the silhouette fallback draws. */
    gender?: number
    ref?: React.Ref<HTMLImageElement>
  }

export function Avatar({
  className,
  src,
  alt,
  seed,
  fallback = 'mark',
  gender,
  size,
  shape,
  ref,
  ...props
}: AvatarProps): React.JSX.Element {
  const [errored, setErrored] = useState(false)
  const classes = cn(avatarVariants({ size, shape }), className)

  // No picture, or one that failed to load. People from TMDB get a bust, which reads as the
  // headshot that is missing; everyone else gets the generated mark the rest of the app uses,
  // seeded by name so they look like themselves every time. Still, so a cast row of twenty
  // does not all animate at once.
  if (!src || errored) {
    if (fallback === 'silhouette') {
      return <PersonSilhouette gender={gender} alt={alt} className={classes} />
    }
    return <DitherAvatar name={seed ?? alt ?? 'vesper'} animate={false} className={classes} />
  }

  return (
    <img
      ref={ref}
      src={src}
      alt={alt ?? ''}
      onError={() => setErrored(true)}
      className={classes}
      {...props}
    />
  )
}
