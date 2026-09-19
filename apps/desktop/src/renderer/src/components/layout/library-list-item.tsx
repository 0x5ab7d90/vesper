import { ListCover, type ListKind } from '@renderer/components/library/list-cover'
import { PinSolidIcon } from '@renderer/components/icons'
import { cn } from '@renderer/lib/cn'

export interface LibraryListItemProps {
  name: string
  count: number
  kind: ListKind
  posters?: Array<string | undefined>
  seed?: string
  active?: boolean
  compact?: boolean
  coverUrl?: string
  pinned?: boolean
}

export function LibraryListItem({
  name,
  count,
  kind,
  posters,
  seed,
  active = false,
  compact = false,
  coverUrl,
  pinned = false
}: LibraryListItemProps): React.JSX.Element {
  const cover = (
    <div className="relative shrink-0">
      <ListCover
        kind={kind}
        posters={posters}
        seed={seed}
        size="md"
        name={name}
        coverUrl={coverUrl}
      />
    </div>
  )

  if (compact) {
    return (
      <div
        data-active={active || undefined}
        aria-label={name}
        className={cn(
          'flex size-12 items-center justify-center rounded-md',
          active ? 'bg-white/[0.06]' : 'bg-transparent hover:bg-white/[0.04]'
        )}
      >
        {cover}
      </div>
    )
  }

  return (
    <div
      data-active={active || undefined}
      className={cn(
        // 18px outer = the cover's 10px + the 8px padding, so the two corners stay concentric.
        'flex w-full items-center gap-3 rounded-xl p-2 text-left',
        // Only reorderable lists (unpinned custom) show the grab cursor; pinned + default are fixed.
        kind === 'custom' && !pinned && 'cursor-grab',
        active ? 'bg-white/[0.06]' : 'bg-transparent hover:bg-white/[0.04]'
      )}
    >
      {cover}
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex min-w-0 items-center gap-1.5 text-[13px] leading-4 font-medium text-text">
          <span className="truncate">{name}</span>
          {pinned ? (
            <PinSolidIcon className="size-3 shrink-0 text-text-tertiary" aria-hidden />
          ) : null}
        </span>
        <span className="truncate text-[12px] leading-4 font-medium text-text-tertiary tabular-nums">
          {count} titles
        </span>
      </div>
    </div>
  )
}
