import { DitherAvatar } from '@renderer/components/dither-kit/avatar'
import { HeartIcon } from '@renderer/components/icons'
import { cn } from '@renderer/lib/cn'
import { IMAGE_EDGE, IMG_OUTLINE } from '@renderer/components/ui/image-outline'

export type ListKind = 'liked' | 'watched' | 'custom'

export type ListCoverSize = 'sm' | 'md' | 'lg' | 'xl'

export interface ListCoverProps {
  kind: ListKind
  posters?: Array<string | undefined>
  size?: ListCoverSize
  seed?: string
  name?: string
  className?: string
  coverUrl?: string
}

const SIZE_CLASS: Record<ListCoverSize, string> = {
  sm: 'size-8 rounded-md',
  md: 'size-12 rounded-[10px]',
  lg: 'size-28 rounded-[22px]',
  xl: 'size-40 rounded-[28px]'
}

export function ListCover({
  kind,
  posters = [],
  size = 'md',
  seed,
  name,
  className,
  coverUrl
}: ListCoverProps): React.JSX.Element {
  if (coverUrl) {
    return (
      <div
        className={cn(
          SIZE_CLASS[size],
          'shrink-0 overflow-hidden bg-surface-3 bg-cover bg-center',
          IMG_OUTLINE,
          className
        )}
        style={{ backgroundImage: `url(${coverUrl})` }}
        aria-label={name}
      />
    )
  }
  if (kind === 'liked') {
    return (
      <div
        className={cn(
          SIZE_CLASS[size],
          'flex shrink-0 items-center justify-center overflow-hidden',
          className
        )}
        style={{ backgroundImage: 'linear-gradient(135deg, #9200A5 0%, #FC9687 100%)' }}
        aria-label={name}
      >
        <HeartIcon className={heartSize(size)} />
      </div>
    )
  }

  if (kind === 'watched') {
    return (
      <div
        className={cn(
          SIZE_CLASS[size],
          'flex shrink-0 items-center justify-center overflow-hidden',
          className
        )}
        style={{ backgroundImage: 'linear-gradient(135deg, #1f6fb2 0%, #4ec0a5 100%)' }}
        aria-label={name}
      >
        <ClapperboardGlyph className={heartSize(size)} />
      </div>
    )
  }

  // A list with nothing in it yet gets a generated mark instead of a hole: same name, same
  // avatar, so it is recognisable in the sidebar before the first poster lands.
  const visible = posters.filter(Boolean) as string[]
  if (visible.length === 0) {
    return (
      <DitherAvatar
        name={seed ?? name ?? 'list'}
        className={cn(
          SIZE_CLASS[size],
          'shrink-0 overflow-hidden bg-surface-3',
          IMG_OUTLINE,
          className
        )}
      />
    )
  }

  const [a, b, c, d] = padTo4(visible)
  return (
    <div
      className={cn(
        SIZE_CLASS[size],
        'relative shrink-0 overflow-hidden bg-surface-3',
        IMAGE_EDGE,
        className
      )}
      aria-label={name}
    >
      <div className="flex h-full w-full gap-px">
        <Poster src={a} className="h-full w-3/5" />
        <div className="flex h-full w-2/5 flex-col gap-px">
          <Poster src={b} className="h-1/3 w-full" />
          <Poster src={c} className="h-1/3 w-full" />
          <Poster src={d} className="h-1/3 w-full" />
        </div>
      </div>
    </div>
  )
}

function padTo4(posters: string[]): string[] {
  const out = [...posters]
  while (out.length < 4) out.push(out[0]!)
  return out
}

function heartSize(size: ListCoverSize): string {
  switch (size) {
    case 'sm':
      return 'size-3.5 text-white'
    case 'md':
      return 'size-5 text-white'
    case 'lg':
      return 'size-10 text-white'
    case 'xl':
      return 'size-16 text-white'
  }
}

function Poster({ src, className }: { src: string; className?: string }): React.JSX.Element {
  return (
    <div
      className={cn('bg-surface-3 bg-cover bg-center', className)}
      style={{ backgroundImage: `url(${src})` }}
    />
  )
}

function ClapperboardGlyph({ className }: { className?: string }): React.JSX.Element {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden
    >
      <g>
        <path
          d="M21 15.60L20.56 15.43L19.94 13.83C19.63 13.03 18.86 12.5 18 12.5C17.19 12.5 16.46 12.96 16.12 13.68L16.05 13.83L15.43 15.43L13.83 16.05C13.03 16.36 12.5 17.13 12.5 18C12.5 18.86 13.03 19.63 13.83 19.94L15.43 20.56L15.60 21H5.75C4.23 21 3 19.76 3 18.25V9.5H21V15.60Z"
          fill="currentColor"
        />
        <path d="M7.20 8H3V5.75C3 4.23 4.23 3 5.75 3H8.87L7.20 8Z" fill="currentColor" />
        <path d="M13.45 8H8.79L10.45 3H15.12L13.45 8Z" fill="currentColor" />
        <path d="M18.25 3C19.76 3 21 4.23 21 5.75V8H15.04L16.70 3H18.25Z" fill="currentColor" />
        <path
          d="M19.24 16.18L18.54 14.37C18.45 14.14 18.24 14 18 14C17.75 14 17.54 14.14 17.45 14.37L16.75 16.18C16.65 16.44 16.44 16.65 16.18 16.75L14.37 17.45C14.14 17.54 14 17.75 14 18C14 18.24 14.14 18.45 14.37 18.54L16.18 19.24C16.44 19.34 16.65 19.55 16.75 19.81L17.45 21.62C17.54 21.85 17.75 22 18 22C18.24 22 18.45 21.85 18.54 21.62L19.24 19.81C19.34 19.55 19.55 19.34 19.81 19.24L21.62 18.54C21.85 18.45 22 18.24 22 18C22 17.75 21.85 17.54 21.62 17.45L19.81 16.75C19.55 16.65 19.34 16.44 19.24 16.18Z"
          fill="currentColor"
        />
      </g>
    </svg>
  )
}
