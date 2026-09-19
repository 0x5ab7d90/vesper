import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Popover } from '@base-ui/react/popover'
import { Checkbox } from '@base-ui/react/checkbox'
import { useMutation, useQuery } from 'convex/react'
import { ListCover } from '@renderer/components/library/list-cover'
import { CheckIcon, CloseIcon } from '@renderer/components/icons'
import { IconButton } from '@renderer/components/ui/icon-button'
import { Button } from '@renderer/components/ui/button'
import { tmdbImage } from '@renderer/lib/tmdb'
import { cn } from '@renderer/lib/cn'
import { api } from '@convex/_generated/api'
import type { Id } from '@convex/_generated/dataModel'
import { squircleStyle } from '@renderer/components/ui/squircle-surface'
import { POPUP_MOTION } from '@renderer/components/ui/popup-motion'

interface AddToListsPopoverProps {
  mediaType: 'movie' | 'tv'
  tmdbId: number
  title: string
  posterPath?: string
  children: React.ReactNode
}

export function AddToListsPopover({
  mediaType,
  tmdbId,
  title,
  posterPath,
  children
}: AddToListsPopoverProps): React.JSX.Element {
  const [open, setOpen] = useState(false)
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger render={children as React.ReactElement} />
      <Popover.Portal>
        <Popover.Positioner side="bottom" align="start" sideOffset={8} className="z-[100]">
          <Popover.Popup
            className={cn(
              'z-50 w-[300px] overflow-hidden bg-surface-2 shadow-edge outline-none',
              POPUP_MOTION
            )}
            style={squircleStyle('frame-sm')}
          >
            {open ? (
              <PopoverBody
                mediaType={mediaType}
                tmdbId={tmdbId}
                title={title}
                posterPath={posterPath}
                onClose={() => setOpen(false)}
              />
            ) : null}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  )
}

function PopoverBody({
  mediaType,
  tmdbId,
  title,
  posterPath,
  onClose
}: {
  mediaType: 'movie' | 'tv'
  tmdbId: number
  title: string
  posterPath?: string
  onClose: () => void
}): React.JSX.Element {
  const lists = useQuery(api.lists.myLists)
  const membership = useQuery(api.lists.membership, { mediaType, tmdbId })
  const setMembership = useMutation(api.lists.setMembership)

  const initial = useMemo(() => new Set(membership ?? []), [membership])
  const [selected, setSelected] = useState<Set<Id<'lists'>>>(initial)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setSelected(new Set(membership ?? []))
  }, [membership])

  const toggle = (listId: Id<'lists'>): void => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(listId)) next.delete(listId)
      else next.add(listId)
      return next
    })
  }

  const delta = useMemo(() => {
    let added = 0
    let removed = 0
    for (const id of selected) if (!initial.has(id)) added++
    for (const id of initial) if (!selected.has(id)) removed++
    return { added, removed }
  }, [selected, initial])

  const dirty = delta.added > 0 || delta.removed > 0
  const buttonLabel = !dirty
    ? 'Done'
    : delta.added > 0 && delta.removed === 0
      ? `Add to ${delta.added}`
      : delta.added === 0 && delta.removed > 0
        ? `Remove from ${delta.removed}`
        : 'Save'

  const onSave = async (): Promise<void> => {
    if (!dirty) {
      onClose()
      return
    }
    setSaving(true)
    try {
      await setMembership({
        mediaType,
        tmdbId,
        title,
        posterPath,
        listIds: Array.from(selected)
      })
      onClose()
    } finally {
      setSaving(false)
    }
  }

  const headerPoster = tmdbImage(posterPath, 'w154')

  const scrollRef = useRef<HTMLDivElement | null>(null)
  const [fadeTop, setFadeTop] = useState(false)
  const [fadeBottom, setFadeBottom] = useState(false)

  const recomputeFades = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    const overflow = el.scrollHeight - el.clientHeight
    if (overflow <= 1) {
      setFadeTop(false)
      setFadeBottom(false)
      return
    }
    setFadeTop(el.scrollTop > 0)
    setFadeBottom(el.scrollTop < overflow - 1)
  }, [])

  useLayoutEffect(() => {
    recomputeFades()
  }, [lists, recomputeFades])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const ro = new ResizeObserver(recomputeFades)
    ro.observe(el)
    return () => ro.disconnect()
  }, [recomputeFades])

  return (
    <div className="flex flex-col">
      <header className="flex items-center gap-2.5 px-2.5 py-2">
        <div
          className="h-9 w-6 shrink-0 overflow-hidden rounded-[5px] bg-surface-3 bg-cover bg-center"
          style={headerPoster ? { backgroundImage: `url(${headerPoster})` } : undefined}
        />
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="line-clamp-1 text-[13px] leading-4 font-semibold text-text">
            Add to lists
          </span>
          <span className="text-[11px] leading-[14px] font-medium text-text-tertiary">
            {selected.size} selected
          </span>
        </div>
        <IconButton variant="ghost" size="sm" aria-label="Close" onClick={onClose}>
          <CloseIcon className="size-4" />
        </IconButton>
      </header>
      <div className="h-px w-full bg-white/[0.06]" />
      <div className="relative">
        {fadeTop ? (
          <div
            className="pointer-events-none absolute top-0 right-0 left-0 z-10 h-8"
            style={{
              background: 'linear-gradient(to bottom, var(--color-surface-2) 0%, transparent 100%)'
            }}
          />
        ) : null}
        {fadeBottom ? (
          <div
            className="pointer-events-none absolute right-0 bottom-0 left-0 z-10 h-8"
            style={{
              background: 'linear-gradient(to top, var(--color-surface-2) 0%, transparent 100%)'
            }}
          />
        ) : null}
        <div
          ref={scrollRef}
          onScroll={recomputeFades}
          className="scroll-hide flex max-h-[240px] flex-col overflow-y-auto px-1.5 py-1"
        >
          {lists === undefined ? (
            <div className="px-2 py-5 text-center text-[12px] font-medium text-text-tertiary">
              Loading…
            </div>
          ) : lists.length === 0 ? (
            <div className="px-2 py-5 text-center text-[12px] font-medium text-text-tertiary">
              No lists yet
            </div>
          ) : (
            lists.map((list) => {
              const posters = list.recentItems
                .map((i) => tmdbImage(i.posterPath, 'w154'))
                .filter(Boolean) as string[]
              const isSelected = selected.has(list._id as Id<'lists'>)
              return (
                <button
                  type="button"
                  key={list._id}
                  onClick={() => toggle(list._id as Id<'lists'>)}
                  className="flex items-center gap-2.5 rounded-md bg-transparent px-1.5 py-1 text-left outline-none hover:bg-white/[0.04]"
                >
                  <ListCover
                    kind={list.kind}
                    posters={posters}
                    seed={list._id}
                    size="sm"
                    name={list.name}
                  />
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="line-clamp-1 text-[12px] leading-4 font-medium text-text">
                      {list.name}
                    </span>
                    <span className="text-[11px] leading-[14px] font-medium text-text-tertiary">
                      {list.itemCount} titles
                    </span>
                  </div>
                  <Checkbox.Root
                    checked={isSelected}
                    onCheckedChange={() => toggle(list._id as Id<'lists'>)}
                    className={cn(
                      'flex size-[18px] shrink-0 items-center justify-center rounded-[5px] outline-none transition-colors',
                      isSelected
                        ? 'bg-text text-black'
                        : 'bg-transparent ring-1 ring-inset ring-white/20'
                    )}
                  >
                    <Checkbox.Indicator>
                      <CheckIcon className="size-3" />
                    </Checkbox.Indicator>
                  </Checkbox.Root>
                </button>
              )
            })
          )}
        </div>
      </div>
      <div className="h-px w-full bg-white/[0.06]" />
      <footer className="flex justify-end gap-2 px-2.5 py-2">
        <Button
          type="button"
          variant="primary"
          size="sm"
          className="rounded-md"
          onClick={onSave}
          disabled={saving || lists === undefined}
        >
          {saving ? 'Saving…' : buttonLabel}
        </Button>
      </footer>
    </div>
  )
}
