import { memo, useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { Link, useMatch } from '@tanstack/react-router'
import { AnimatePresence, m as motion, Reorder, useReducedMotion } from 'motion/react'
import type { FunctionReturnType } from 'convex/server'
import { IconButton } from '@renderer/components/ui/icon-button'
import { LibraryListItem } from './library-list-item'
import { PlusIcon, SidebarLeftIcon } from '@renderer/components/icons'
import { ListFormModal } from '@renderer/components/library/list-form-modal'
import { ListContextMenu } from '@renderer/components/library/list-context-menu'
import { FeedbackModal } from '@renderer/components/feedback/feedback-modal'
import { UpdateCard } from './update-card'
import { useSmoothScroll } from '@renderer/hooks/use-smooth-scroll'
import { useAppVersion } from '@renderer/hooks/use-app-version'
import { tmdbImage } from '@renderer/lib/tmdb'
import { api } from '@convex/_generated/api'
import type { Id } from '@convex/_generated/dataModel'
import { EASE_OUT, EXIT_FADE } from '@renderer/lib/motion'

const ROW_ANIM = { duration: 0.18, ease: EASE_OUT }

const DRAG_LIFT = {
  zIndex: 50
}

const AUTOSCROLL_HOT = 48
const AUTOSCROLL_MAX_SPEED = 14

type ListRow = FunctionReturnType<typeof api.lists.myLists>[number]

function useEdgeAutoScroll(scrollRef: RefObject<HTMLDivElement | null>, active: boolean): void {
  useEffect(() => {
    if (!active) return
    const el = scrollRef.current
    if (!el) return
    let raf = 0
    let speed = 0
    const tick = (): void => {
      if (speed !== 0) el.scrollTop += speed
      raf = requestAnimationFrame(tick)
    }
    const onMove = (e: PointerEvent): void => {
      const r = el.getBoundingClientRect()
      const fromTop = e.clientY - r.top
      const fromBot = r.bottom - e.clientY
      if (fromTop < AUTOSCROLL_HOT) {
        speed = -Math.round(((AUTOSCROLL_HOT - fromTop) / AUTOSCROLL_HOT) * AUTOSCROLL_MAX_SPEED)
      } else if (fromBot < AUTOSCROLL_HOT) {
        speed = Math.round(((AUTOSCROLL_HOT - fromBot) / AUTOSCROLL_HOT) * AUTOSCROLL_MAX_SPEED)
      } else {
        speed = 0
      }
    }
    window.addEventListener('pointermove', onMove)
    raf = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('pointermove', onMove)
    }
  }, [active, scrollRef])
}

function DragSection({
  lists,
  renderItem,
  scrollRef,
  onReorderConfirmed
}: {
  lists: ListRow[]
  renderItem: (list: ListRow) => React.ReactNode
  scrollRef: RefObject<HTMLDivElement | null>
  onReorderConfirmed: (
    movedId: Id<'lists'>,
    prevId: Id<'lists'> | undefined,
    nextId: Id<'lists'> | undefined
  ) => Promise<void>
}): React.JSX.Element {
  const [snapshot, setSnapshot] = useState<ListRow[] | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [draggingId, setDraggingId] = useState<Id<'lists'> | null>(null)
  useEdgeAutoScroll(scrollRef, isDragging)

  useEffect(() => {
    document.body.classList.toggle('is-reordering', isDragging)
    return () => document.body.classList.remove('is-reordering')
  }, [isDragging])

  useEffect(() => {
    if (isDragging || !snapshot) return
    const sameOrder =
      snapshot.length === lists.length && snapshot.every((s, i) => s._id === lists[i]?._id)
    if (sameOrder) setSnapshot(null)
  }, [lists, snapshot, isDragging])

  const display = snapshot ?? lists

  return (
    <Reorder.Group
      as="ul"
      axis="y"
      values={display}
      onReorder={setSnapshot}
      className="flex flex-col gap-0.5"
    >
      <AnimatePresence initial={false} mode="popLayout">
        {display.map((list) => (
          <Reorder.Item
            key={list._id}
            value={list}
            layout="position"
            transition={{ duration: 0 }}
            whileDrag={DRAG_LIFT}
            dragTransition={{ bounceStiffness: 1e9, bounceDamping: 1e9 }}
            className={
              draggingId === list._id ? 'relative z-50 rounded-md bg-[#202020]' : undefined
            }
            onDragStart={() => {
              setIsDragging(true)
              setDraggingId(list._id)
              if (!snapshot) setSnapshot(lists)
            }}
            onDragEnd={async () => {
              setIsDragging(false)
              setDraggingId(null)
              const next = snapshot
              if (!next) return
              const idx = next.findIndex((l) => l._id === list._id)
              if (idx === -1) {
                setSnapshot(null)
                return
              }
              const liveIdx = lists.findIndex((l) => l._id === list._id)
              if (liveIdx === idx) {
                setSnapshot(null)
                return
              }
              try {
                await onReorderConfirmed(list._id, next[idx - 1]?._id, next[idx + 1]?._id)
              } catch (e) {
                console.error('reorderList failed', e)
                setSnapshot(null)
              }
            }}
          >
            {renderItem(list)}
          </Reorder.Item>
        ))}
      </AnimatePresence>
    </Reorder.Group>
  )
}

export const LeftSidebar = memo(function LeftSidebar({
  onCollapse
}: {
  onCollapse: () => void
}): React.JSX.Element {
  const lists = useQuery(api.lists.myLists) ?? []
  const [newListOpen, setNewListOpen] = useState(false)
  const [feedbackOpen, setFeedbackOpen] = useState(false)
  const listMatch = useMatch({ from: '/_authenticated/list/$id', shouldThrow: false })
  const activeListId = listMatch?.params.id as Id<'lists'> | undefined
  const reduced = useReducedMotion()
  const reorderListMutation = useMutation(api.lists.reorderList)
  const version = useAppVersion()

  const systemLists = useMemo<ListRow[]>(() => lists.filter((l) => l.kind !== 'custom'), [lists])
  const pinnedCustom = useMemo<ListRow[]>(
    () => lists.filter((l) => l.kind === 'custom' && l.pinned),
    [lists]
  )
  const unpinnedCustom = useMemo<ListRow[]>(
    () => lists.filter((l) => l.kind === 'custom' && !l.pinned),
    [lists]
  )

  const scrollRef = useRef<HTMLDivElement | null>(null)
  const scrollContentRef = useRef<HTMLDivElement | null>(null)
  useSmoothScroll(scrollRef, scrollContentRef)

  const confirmReorder = async (
    movedId: Id<'lists'>,
    prevId: Id<'lists'> | undefined,
    nextId: Id<'lists'> | undefined
  ): Promise<void> => {
    await reorderListMutation({ listId: movedId, prevListId: prevId, nextListId: nextId })
  }

  const renderItem = (list: ListRow): React.ReactNode => {
    const posters = list.recentItems
      .map((item) => tmdbImage(item.posterPath, 'w154'))
      .filter(Boolean) as string[]
    const active = activeListId === list._id
    return (
      <ListContextMenu list={list}>
        <Link
          to="/list/$id"
          params={{ id: list._id }}
          viewTransition={false}
          className="block rounded-md outline-none"
          draggable={false}
        >
          <LibraryListItem
            name={list.name}
            count={list.itemCount}
            kind={list.kind}
            posters={posters}
            seed={list._id}
            active={active}
            coverUrl={list.coverUrl}
            pinned={list.pinned}
          />
        </Link>
      </ListContextMenu>
    )
  }

  return (
    <aside className="relative flex h-full w-full flex-col gap-2 overflow-hidden rounded-lg bg-surface px-2 pt-3">
      <header className="flex h-12 items-center justify-between px-2">
        <h1 className="text-[16px] leading-5 font-medium text-text">Library</h1>
        <div className="flex items-center gap-2">
          <IconButton
            variant="ghost"
            size="md"
            aria-label="New list"
            onClick={() => setNewListOpen(true)}
          >
            <PlusIcon className="size-[18px]" />
          </IconButton>
          <IconButton variant="ghost" size="md" aria-label="Collapse" onClick={onCollapse}>
            <SidebarLeftIcon className="size-[18px]" />
          </IconButton>
        </div>
      </header>
      <div ref={scrollRef} className="scroll-hide flex-1 overflow-y-auto">
        <div ref={scrollContentRef} className="flex flex-col gap-0.5">
          <ul className="flex flex-col gap-0.5">
            <AnimatePresence initial={false} mode="popLayout">
              {systemLists.map((list) => (
                <motion.li
                  key={list._id}
                  layout={reduced ? false : true}
                  initial={reduced ? false : { opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={EXIT_FADE}
                  transition={ROW_ANIM}
                >
                  {renderItem(list)}
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
          {pinnedCustom.length > 0 ? (
            <ul className="flex flex-col gap-0.5">
              <AnimatePresence initial={false} mode="popLayout">
                {pinnedCustom.map((list) => (
                  <motion.li
                    key={list._id}
                    layout={reduced ? false : true}
                    initial={reduced ? false : { opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={EXIT_FADE}
                    transition={ROW_ANIM}
                  >
                    {renderItem(list)}
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          ) : null}
          {unpinnedCustom.length > 0 ? (
            <DragSection
              lists={unpinnedCustom}
              renderItem={renderItem}
              scrollRef={scrollRef}
              onReorderConfirmed={confirmReorder}
            />
          ) : null}
        </div>
      </div>
      <UpdateCard />
      <div className="relative flex items-center gap-1.5 px-2 pb-2 text-[12px] leading-4 font-medium text-text-muted">
        <span>{version ? `Vesper ${version}` : 'Vesper'}</span>
        <span aria-hidden>·</span>
        <button
          type="button"
          onClick={() => setFeedbackOpen(true)}
          className="bg-transparent outline-none hover:text-text"
        >
          Feedback
        </button>
      </div>
      <ListFormModal mode="new" open={newListOpen} onOpenChange={setNewListOpen} />
      <FeedbackModal open={feedbackOpen} onOpenChange={setFeedbackOpen} />
    </aside>
  )
})
