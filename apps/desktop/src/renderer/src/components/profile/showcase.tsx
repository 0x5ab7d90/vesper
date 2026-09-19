import { useEffect, useState } from 'react'
import { Popover } from '@base-ui/react/popover'
import { useNavigate } from '@tanstack/react-router'
import { useQuery as useTanstackQuery } from '@tanstack/react-query'
import { useMutation } from 'convex/react'
import { PlusIcon, SearchIcon } from '@renderer/components/icons'
import { squircleStyle } from '@renderer/components/ui/squircle-surface'
import { Skeleton } from '@renderer/components/ui/skeleton'
import { closeProfile } from '@renderer/lib/profile-modal'
import { searchMultiQuery } from '@renderer/lib/tmdb-queries'
import { searchItemTitle, searchItemYear, tmdbImage } from '@renderer/lib/tmdb'
import { cn } from '@renderer/lib/cn'
import { api } from '@convex/_generated/api'
import type { Doc } from '@convex/_generated/dataModel'

const SLOTS = 4

type ShowcaseItem = NonNullable<NonNullable<Doc<'profiles'>['showcase']>[number]>

/**
 * Four hand-picked titles on the profile card. The owner sees dashed empty slots and can tap
 * any slot to search and pick, or swap what is there; visitors see only the filled ones.
 */
export function Showcase({
  profile,
  isMe
}: {
  profile: Doc<'profiles'>
  isMe: boolean
}): React.JSX.Element | null {
  const slots = Array.from({ length: SLOTS }, (_, i) => profile.showcase?.[i] ?? null)
  const anyFilled = slots.some(Boolean)
  if (!isMe && !anyFilled) return null

  return (
    <div className="flex flex-col gap-2">
      <span className="text-[11px] leading-4 font-medium text-text-muted">Favorites</span>
      <div className="grid grid-cols-4 gap-2">
        {slots.map((item, index) =>
          isMe ? (
            <SlotPicker key={index} index={index} item={item}>
              <Slot item={item} editable />
            </SlotPicker>
          ) : item ? (
            <VisitorSlot key={index} item={item} />
          ) : null
        )}
      </div>
    </div>
  )
}

/* ---------- slots ---------- */

const SLOT_BASE =
  'relative aspect-[2/3] w-full overflow-hidden rounded-[10px] outline-none transition-transform duration-150 ease-out active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-white/40'

function Slot({
  item,
  editable,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  item: ShowcaseItem | null
  editable?: boolean
}): React.JSX.Element {
  if (item) {
    return (
      <button
        type="button"
        aria-label={editable ? `Change favorite: ${item.title}` : item.title}
        className={cn(SLOT_BASE, 'bg-surface-3 bg-cover bg-center')}
        style={{ backgroundImage: `url(${tmdbImage(item.posterPath, 'w342') ?? ''})` }}
        {...props}
      />
    )
  }
  return (
    <button
      type="button"
      aria-label="Add a favorite"
      className={cn(
        SLOT_BASE,
        'flex items-center justify-center border border-dashed border-white/15 text-text-muted transition-colors hover:border-white/30 hover:text-text-tertiary'
      )}
      {...props}
    >
      <PlusIcon className="size-4" />
    </button>
  )
}

function VisitorSlot({ item }: { item: ShowcaseItem }): React.JSX.Element {
  const navigate = useNavigate()
  return (
    <Slot
      item={item}
      onClick={() => {
        closeProfile()
        navigate({
          to: item.mediaType === 'movie' ? '/movie/$id' : '/tv/$id',
          params: { id: String(item.tmdbId) },
          viewTransition: false
        })
      }}
    />
  )
}

/* ---------- picker ---------- */

function SlotPicker({
  index,
  item,
  children
}: {
  index: number
  item: ShowcaseItem | null
  children: React.ReactElement
}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger render={children} />
      <Popover.Portal>
        <Popover.Positioner side="right" align="start" sideOffset={10} className="z-[110]">
          <Popover.Popup
            className={cn(
              'w-[300px] overflow-hidden border border-white/[0.06] bg-surface-2 shadow-[0_12px_32px_rgba(0,0,0,0.45)] outline-none',
              // Grows from the slot it belongs to, not from its own centre.
              'origin-[var(--transform-origin)] transition-[transform,opacity] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)]',
              'data-[starting-style]:scale-[0.97] data-[starting-style]:opacity-0',
              'data-[ending-style]:scale-[0.97] data-[ending-style]:opacity-0 data-[ending-style]:duration-100'
            )}
            style={squircleStyle('frame-sm')}
          >
            {open ? <PickerBody index={index} item={item} onDone={() => setOpen(false)} /> : null}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  )
}

function useDebounced(value: string, ms: number): string {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), ms)
    return () => clearTimeout(id)
  }, [value, ms])
  return debounced
}

function PickerBody({
  index,
  item,
  onDone
}: {
  index: number
  item: ShowcaseItem | null
  onDone: () => void
}): React.JSX.Element {
  const [text, setText] = useState('')
  const query = useDebounced(text.trim(), 180)
  const results = useTanstackQuery({ ...searchMultiQuery(query), enabled: query.length > 0 })
  const setSlot = useMutation(api.profiles.setShowcaseSlot)

  const hits = (results.data?.results ?? [])
    .filter((r) => r.media_type !== 'person' && r.poster_path)
    .slice(0, 8)

  const pick = async (hit: (typeof hits)[number]): Promise<void> => {
    await setSlot({
      index,
      item: {
        tmdbId: hit.id,
        mediaType: hit.media_type === 'movie' ? 'movie' : 'tv',
        title: searchItemTitle(hit),
        posterPath: hit.poster_path ?? undefined
      }
    })
    onDone()
  }

  const remove = async (): Promise<void> => {
    await setSlot({ index, item: null })
    onDone()
  }

  return (
    <div className="flex flex-col p-1">
      <label className="flex h-9 items-center gap-2 px-2.5">
        <SearchIcon className="size-3.5 shrink-0 text-text-muted" />
        <input
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={item ? 'Swap for something else' : 'Search movies and shows'}
          aria-label="Search titles"
          className="h-full flex-1 bg-transparent text-[13px] leading-4 font-medium text-text outline-none placeholder:text-text-muted"
        />
      </label>
      <div
        className="flex min-h-[44px] flex-col gap-0.5 border border-white/[0.05] bg-surface p-1"
        style={squircleStyle('inset-sm')}
      >
        {query.length === 0 ? (
          <p className="px-2 py-2.5 text-[12px] leading-4 font-medium text-text-muted">
            {item ? `Currently ${item.title}` : 'Type to find a title'}
          </p>
        ) : results.isPending ? (
          Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="flex items-center gap-2.5 px-1.5 py-1">
              <Skeleton className="h-9 w-6 rounded-[4px]" />
              <Skeleton className="h-3 w-32" />
            </div>
          ))
        ) : hits.length === 0 ? (
          <p className="px-2 py-2.5 text-[12px] leading-4 font-medium text-text-muted">
            Nothing matched
          </p>
        ) : (
          hits.map((hit) => (
            <button
              key={`${hit.media_type}-${hit.id}`}
              type="button"
              onClick={() => void pick(hit)}
              className="flex items-center gap-2.5 rounded-lg px-1.5 py-1 text-left outline-none transition-colors duration-100 hover:bg-white/[0.06] focus-visible:bg-white/[0.06]"
            >
              <span
                aria-hidden
                className="h-9 w-6 shrink-0 rounded-[4px] bg-surface-3 bg-cover bg-center"
                style={{ backgroundImage: `url(${tmdbImage(hit.poster_path, 'w92') ?? ''})` }}
              />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-[13px] leading-4 font-medium text-text">
                  {searchItemTitle(hit)}
                </span>
                <span className="text-[11px] leading-4 font-medium text-text-muted">
                  {[hit.media_type === 'movie' ? 'Movie' : 'Show', searchItemYear(hit)]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              </span>
            </button>
          ))
        )}
      </div>
      {item ? (
        <button
          type="button"
          onClick={() => void remove()}
          className="mt-1 h-8 rounded-lg px-2.5 text-left text-[12px] leading-4 font-medium text-text-muted outline-none transition-colors duration-100 hover:bg-white/[0.06] hover:text-red-400"
        >
          Remove from favorites
        </button>
      ) : null}
    </div>
  )
}
