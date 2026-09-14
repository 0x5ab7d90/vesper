import { memo, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { Popover } from '@base-ui/react/popover'
import { useNavigate } from '@tanstack/react-router'
import { useQuery as useTanstackQuery } from '@tanstack/react-query'
import { useMutation, useQuery as useConvexQuery } from 'convex/react'
import { SearchInput } from '@renderer/components/ui/search-input'
import { SkeletonSwap } from '@renderer/components/ui/skeleton-swap'
import { IconButton } from '@renderer/components/ui/icon-button'
import { Avatar } from '@renderer/components/ui/avatar'
import { CloseIcon, CmdIcon, ProjectsIcon, ReturnIcon } from '@renderer/components/icons'
import { DropMascot } from '@renderer/components/brand/drop-mascot'
import { isMac } from '@renderer/lib/platform'
import { cn } from '@renderer/lib/cn'
import { searchMultiQuery } from '@renderer/lib/tmdb-queries'
import {
  searchItemImage,
  searchItemTitle,
  searchItemYear,
  tmdbImage,
  type TmdbSearchMultiItem
} from '@renderer/lib/tmdb'
import { api } from '@convex/_generated/api'
import type { Doc, Id } from '@convex/_generated/dataModel'

const DEBOUNCE_MS = 150

type Row =
  | { kind: 'recent'; id: string; data: Doc<'searchHistory'> }
  | { kind: 'movie'; id: string; data: TmdbSearchMultiItem }
  | { kind: 'tv'; id: string; data: TmdbSearchMultiItem }
  | { kind: 'person'; id: string; data: TmdbSearchMultiItem }
  | { kind: 'user'; id: string; data: Doc<'profiles'> }

interface SearchControlProps {
  /** Told whenever the popover opens or closes, so the title bar can give up its drag region. */
  onOpenChange?: (open: boolean) => void
}

export function SearchControl({ onOpenChange }: SearchControlProps): React.JSX.Element {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const anchorRef = useRef<HTMLDivElement | null>(null)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const debounced = useDebouncedValue(query.trim(), DEBOUNCE_MS)

  const onClose = useCallback((): void => {
    setOpen(false)
    inputRef.current?.blur()
  }, [])

  // Reported from one place so every route into the state, focus, typing, Escape, an outside
  // press, opening a row, is announced the same way.
  useEffect(() => {
    onOpenChange?.(open)
  }, [open, onOpenChange])

  useConvexQuery(api.search.recentSearches, { limit: 4 })

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        inputRef.current?.focus()
        inputRef.current?.select()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <>
      <div ref={anchorRef} className="w-full">
        <ControlledSearchInput
          ref={inputRef}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            if (!open) setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          className={open ? 'rounded-b-none' : ''}
          trailing={<TrailingSlot open={open} showHint={query.length > 0} />}
        />
      </div>
      <Popover.Root
        open={open}
        onOpenChange={(next, details) => {
          if (next) {
            setOpen(true)
            return
          }
          if (details.reason === 'outside-press' || details.reason === 'focus-out') {
            const target = details.event?.target as Node | null
            if (target && anchorRef.current?.contains(target)) return
          }
          setOpen(false)
        }}
        modal={false}
      >
        <Popover.Portal>
          <Popover.Positioner
            anchor={anchorRef}
            side="bottom"
            align="start"
            sideOffset={0}
            className="z-[100]"
          >
            <Popover.Popup
              className="z-[100] overflow-hidden rounded-t-none rounded-b-xl bg-surface-2 outline-none shadow-[0_8px_24px_rgba(0,0,0,0.4)]"
              style={{
                width: 'var(--anchor-width)',
                clipPath: 'inset(0 -100px -100px -100px)'
              }}
              initialFocus={inputRef}
              finalFocus={false}
            >
              {open ? (
                <SearchBody debounced={debounced} inputRef={inputRef} onClose={onClose} />
              ) : null}
            </Popover.Popup>
          </Popover.Positioner>
        </Popover.Portal>
      </Popover.Root>
    </>
  )
}

function ControlledSearchInput({
  ref,
  ...props
}: React.ComponentPropsWithoutRef<typeof SearchInput> & {
  ref?: React.Ref<HTMLInputElement>
}): React.JSX.Element {
  const localRef = useRef<HTMLInputElement | null>(null)
  useImperativeHandle(ref, () => localRef.current!)
  return <SearchInput {...props} ref={localRef} />
}

const SearchBody = memo(function SearchBody({
  debounced,
  inputRef,
  onClose
}: {
  debounced: string
  inputRef: React.MutableRefObject<HTMLInputElement | null>
  onClose: () => void
}): React.JSX.Element {
  const navigate = useNavigate()
  const isTyping = debounced.length > 0

  const recents = useConvexQuery(api.search.recentSearches, { limit: 4 }) ?? []
  const multi = useTanstackQuery(searchMultiQuery(debounced))
  const users = useConvexQuery(api.search.searchUsers, isTyping ? { query: debounced } : 'skip')

  const recordHistory = useMutation(api.search.recordSearchHistory)
  const removeHistory = useMutation(api.search.removeSearchHistoryItem)
  const clearHistory = useMutation(api.search.clearSearchHistory)

  const rows = useMemo<Row[]>(() => {
    if (!isTyping) {
      return recents.map((r) => ({ kind: 'recent', id: r._id, data: r }))
    }
    const all = (multi.data?.results ?? []).slice()
    const sorted = all.sort((a, b) => b.popularity - a.popularity)
    const movies = sorted.filter((r) => r.media_type === 'movie').slice(0, 3)
    const tv = sorted.filter((r) => r.media_type === 'tv').slice(0, 3)
    const people = sorted.filter((r) => r.media_type === 'person').slice(0, 2)
    const userRows: Row[] = users?.map((u) => ({ kind: 'user', id: u._id, data: u })) ?? []
    const result: Row[] = []
    movies.forEach((m) => result.push({ kind: 'movie', id: `m-${m.id}`, data: m }))
    tv.forEach((s) => result.push({ kind: 'tv', id: `t-${s.id}`, data: s }))
    people.forEach((p) => result.push({ kind: 'person', id: `p-${p.id}`, data: p }))
    result.push(...userRows)
    return result
  }, [isTyping, recents, multi.data, users])

  const [highlight, setHighlight] = useState(-1)
  useEffect(() => {
    setHighlight(-1)
  }, [debounced, isTyping])

  const showNoResults = isTyping && !multi.isPending && rows.length === 0 && users?.length === 0

  const openRow = async (row: Row): Promise<void> => {
    onClose()
    switch (row.kind) {
      case 'recent':
        return navigateToHistoryItem(row.data, navigate)
      case 'movie':
      case 'tv':
      case 'person':
        return navigateAndRecord(
          {
            kind: row.data.media_type,
            tmdbId: row.data.id,
            title: searchItemTitle(row.data),
            posterPath: searchItemImage(row.data) ?? undefined,
            subtitle:
              row.data.media_type === 'person'
                ? (row.data.known_for_department ?? '')
                : labelFor(row.data.media_type, searchItemYear(row.data))
          },
          navigate,
          recordHistory
        )
      case 'user':
        return navigateAndRecord(
          {
            kind: 'user',
            username: row.data.username,
            title: row.data.displayName,
            subtitle: `@${row.data.username}`,
            avatarUrl: row.data.avatarUrl
          },
          navigate,
          recordHistory
        )
    }
  }

  useEffect(() => {
    const input = inputRef.current
    if (!input) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        onClose()
        return
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setHighlight((h) => Math.min(rows.length - 1, h + 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setHighlight((h) => Math.max(-1, h - 1))
      } else if (e.key === 'Enter') {
        e.preventDefault()
        if ((e.metaKey || e.ctrlKey) && isTyping) {
          onClose()
          void navigate({ to: '/search', search: { q: debounced } })
          return
        }
        if (highlight >= 0) {
          const target = rows[highlight]
          if (target) void openRow(target)
          return
        }
        if (rows.length > 0) void openRow(rows[0]!)
      }
    }
    input.addEventListener('keydown', onKey)
    return () => input.removeEventListener('keydown', onKey)
  }, [rows, highlight, onClose, isTyping, debounced, navigate])

  const movies = rows.filter((r): r is Extract<Row, { kind: 'movie' }> => r.kind === 'movie')
  const tv = rows.filter((r): r is Extract<Row, { kind: 'tv' }> => r.kind === 'tv')
  const people = rows.filter((r): r is Extract<Row, { kind: 'person' }> => r.kind === 'person')
  const userRows = rows.filter((r): r is Extract<Row, { kind: 'user' }> => r.kind === 'user')

  const indexOf = (row: Row): number => rows.findIndex((r) => r.id === row.id)
  const rowProps = (row: Row): { highlighted: boolean; onMouseEnter: () => void } => ({
    highlighted: highlight >= 0 && indexOf(row) === highlight,
    onMouseEnter: () => setHighlight(indexOf(row))
  })

  let body: React.ReactNode
  if (!isTyping) {
    body = (
      <EmptyState
        recents={recents}
        rows={rows}
        highlight={highlight}
        setHighlight={setHighlight}
        onOpenRow={openRow}
        onRemoveRecent={async (id) => {
          await removeHistory({ itemId: id })
        }}
        onClearRecents={async () => {
          await clearHistory()
        }}
      />
    )
  } else {
    body = (
      <SkeletonSwap
        ready={!multi.isPending}
        reserve="auto"
        label="Search results"
        skeleton={<SkeletonState />}
        className="scroll-hide min-h-0 overflow-y-auto overscroll-contain"
      >
        {showNoResults ? (
          <NoResultsState query={debounced} />
        ) : (
          <div className="flex flex-col">
            {movies.length > 0 ? (
              <Section title="Movies">
                {movies.map((row) => (
                  <ResultRow
                    key={row.id}
                    item={row.data}
                    {...rowProps(row)}
                    onClick={() => openRow(row)}
                  />
                ))}
              </Section>
            ) : null}
            {tv.length > 0 ? (
              <>
                <Divider />
                <Section title="Series">
                  {tv.map((row) => (
                    <ResultRow
                      key={row.id}
                      item={row.data}
                      {...rowProps(row)}
                      onClick={() => openRow(row)}
                    />
                  ))}
                </Section>
              </>
            ) : null}
            {people.length > 0 ? (
              <>
                <Divider />
                <Section title="People">
                  {people.map((row) => (
                    <PersonRow
                      key={row.id}
                      item={row.data}
                      {...rowProps(row)}
                      onClick={() => openRow(row)}
                    />
                  ))}
                </Section>
              </>
            ) : null}
            {userRows.length > 0 ? (
              <>
                <Divider />
                <Section title="Users">
                  {userRows.map((row) => (
                    <UserRow
                      key={row.id}
                      item={row.data}
                      {...rowProps(row)}
                      onClick={() => openRow(row)}
                    />
                  ))}
                </Section>
              </>
            ) : null}
          </div>
        )}
      </SkeletonSwap>
    )
  }

  return <div className="flex max-h-[370px] flex-col overflow-hidden">{body}</div>
})

function EmptyState({
  recents,
  rows,
  highlight,
  setHighlight,
  onOpenRow,
  onRemoveRecent,
  onClearRecents
}: {
  recents: Doc<'searchHistory'>[]
  rows: Row[]
  highlight: number
  setHighlight: (i: number) => void
  onOpenRow: (row: Row) => void
  onRemoveRecent: (id: Id<'searchHistory'>) => void | Promise<void>
  onClearRecents: () => void | Promise<void>
}): React.JSX.Element {
  if (recents.length === 0) {
    return (
      <div className="px-4 py-6 text-center text-[13px] font-medium text-text-tertiary">
        Search movies, series, people, or users
      </div>
    )
  }
  const indexOf = (row: Row): number => rows.findIndex((r) => r.id === row.id)
  return (
    <div className="scroll-hide flex min-h-0 flex-col overflow-y-auto">
      <Section
        title="Recent"
        action={
          <button
            type="button"
            onClick={() => onClearRecents()}
            className="bg-transparent text-[12px] leading-4 font-medium text-text-tertiary outline-none"
          >
            Clear
          </button>
        }
      >
        {recents.map((item) => {
          const row: Row = { kind: 'recent', id: item._id, data: item }
          const isHighlighted = highlight >= 0 && indexOf(row) === highlight
          return (
            <RecentRow
              key={item._id}
              item={item}
              highlighted={isHighlighted}
              onMouseEnter={() => setHighlight(indexOf(row))}
              onClick={() => onOpenRow(row)}
              onRemove={() => onRemoveRecent(item._id)}
            />
          )
        })}
      </Section>
    </div>
  )
}

function SkeletonState(): React.JSX.Element {
  return (
    <div className="flex flex-col gap-3 px-3 py-4">
      <div className="h-3 w-20 rounded bg-white/[0.06]" />
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 py-1">
          <div className="size-9 shrink-0 rounded-md bg-white/[0.06]" />
          <div className="flex flex-1 flex-col gap-1.5">
            <div className="h-3 w-2/3 rounded bg-white/[0.06]" />
            <div className="h-2.5 w-1/3 rounded bg-white/[0.04]" />
          </div>
        </div>
      ))}
    </div>
  )
}

function NoResultsState({ query }: { query: string }): React.JSX.Element {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-4 py-8 text-center">
      <DropMascot mood="confused" size={72} />
      <div className="flex flex-col gap-1">
        <div className="text-[14px] font-semibold text-text">
          No matches for &quot;{query}&quot;
        </div>
        <div className="text-[12px] font-medium text-text-tertiary">
          Try a different spelling or browse trending titles.
        </div>
      </div>
    </div>
  )
}

function Section({
  title,
  action,
  children
}: {
  title: string
  action?: React.ReactNode
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <div className="flex flex-col py-2">
      <div className="flex items-center justify-between px-4 py-1.5">
        <span className="text-[11px] leading-[14px] font-bold tracking-[0.05em] text-text-muted uppercase">
          {title}
        </span>
        {action}
      </div>
      <div className="flex flex-col">{children}</div>
    </div>
  )
}

function Divider(): React.JSX.Element {
  return <div className="h-px w-full shrink-0 bg-white/[0.06]" />
}

function rowClass(highlighted: boolean): string {
  return cn(
    'flex w-full items-center gap-3 bg-transparent px-4 py-2 text-left outline-none transition-colors hover:bg-white/[0.04]',
    highlighted && 'bg-white/[0.04]'
  )
}

function RecentRow({
  item,
  highlighted,
  onMouseEnter,
  onClick,
  onRemove
}: {
  item: Doc<'searchHistory'>
  highlighted: boolean
  onMouseEnter: () => void
  onClick: () => void
  onRemove: () => void
}): React.JSX.Element {
  const thumb = item.posterPath ? tmdbImage(item.posterPath, 'w154') : (item.avatarUrl ?? undefined)
  return (
    <div onMouseEnter={onMouseEnter} className={rowClass(highlighted)}>
      <button
        type="button"
        onClick={onClick}
        className="flex flex-1 items-center gap-3 bg-transparent text-left outline-none"
      >
        {item.kind === 'person' || item.kind === 'user' ? (
          <Avatar
            size="md"
            shape="circle"
            className="size-9"
            src={thumb}
            alt={item.title}
            seed={item.username ?? item.title}
          />
        ) : (
          <div
            className="size-9 shrink-0 overflow-hidden rounded-md bg-surface-3 bg-cover bg-center"
            style={thumb ? { backgroundImage: `url(${thumb})` } : undefined}
          />
        )}
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="line-clamp-1 text-[13px] leading-4 font-medium text-text">
            {item.title}
          </span>
          {item.subtitle ? (
            <span className="line-clamp-1 text-[12px] leading-4 font-medium text-text-muted">
              {item.subtitle}
            </span>
          ) : null}
        </div>
      </button>
      <button
        type="button"
        aria-label="Remove from recents"
        onClick={(e) => {
          e.stopPropagation()
          onRemove()
        }}
        className="shrink-0 bg-transparent text-text-muted outline-none"
      >
        <CloseIcon className="size-3.5" />
      </button>
    </div>
  )
}

/**
 * The right end of the search bar holds two things in one slot: the explore
 * shortcut at rest, and the ⌘↵ hint once you are typing. Cross-faded as an
 * icon swap so the bar never reflows between the two.
 */
function TrailingSlot({ open, showHint }: { open: boolean; showHint: boolean }): React.JSX.Element {
  const navigate = useNavigate()
  return (
    <span className="t-icon-swap shrink-0" data-state={open ? 'b' : 'a'}>
      <span
        className={cn('t-icon flex items-center gap-2', open && 'pointer-events-none')}
        data-icon="a"
        aria-hidden={open}
      >
        <span className="h-6 w-px shrink-0 bg-white/[0.1]" />
        <IconButton
          variant="ghost"
          aria-label="Explore"
          tabIndex={open ? -1 : 0}
          onClick={(e) => {
            // The input is wrapped in a <label>, so let the click land on the
            // button instead of being forwarded to the field it labels.
            e.preventDefault()
            navigate({ to: '/explore' })
          }}
          className="size-9 rounded-lg transition-[color,opacity] duration-150 ease-out hover:text-text"
        >
          <ProjectsIcon className="size-[19px]" />
        </IconButton>
      </span>
      <span
        className="t-icon pointer-events-none flex items-center justify-end pr-1.5"
        data-icon="b"
      >
        {showHint ? <KbdHint /> : null}
      </span>
    </span>
  )
}

function KbdHint(): React.JSX.Element {
  return (
    <span
      className="pointer-events-none inline-flex shrink-0 items-center gap-1 text-text-muted"
      aria-hidden
    >
      {isMac ? (
        <CmdIcon className="size-3.5" />
      ) : (
        <span className="text-[11px] font-semibold">Ctrl</span>
      )}
      <ReturnIcon className="size-3.5" />
    </span>
  )
}

function ResultRow({
  item,
  highlighted,
  onMouseEnter,
  onClick
}: {
  item: TmdbSearchMultiItem
  highlighted: boolean
  onMouseEnter: () => void
  onClick: () => void
}): React.JSX.Element {
  const img = searchItemImage(item)
  const thumb = img ? tmdbImage(img, 'w154') : undefined
  return (
    <button
      type="button"
      onMouseEnter={onMouseEnter}
      onClick={onClick}
      className={rowClass(highlighted)}
    >
      <div
        className="h-11 w-8 shrink-0 overflow-hidden rounded bg-surface-3 bg-cover bg-center"
        style={thumb ? { backgroundImage: `url(${thumb})` } : undefined}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="line-clamp-1 text-[13px] leading-4 font-medium text-text">
          {searchItemTitle(item)}
        </span>
        <span className="line-clamp-1 text-[12px] leading-4 font-medium text-text-tertiary">
          {searchItemYear(item)}
        </span>
      </div>
    </button>
  )
}

function PersonRow({
  item,
  highlighted,
  onMouseEnter,
  onClick
}: {
  item: TmdbSearchMultiItem
  highlighted: boolean
  onMouseEnter: () => void
  onClick: () => void
}): React.JSX.Element {
  const img = searchItemImage(item)
  return (
    <button
      type="button"
      onMouseEnter={onMouseEnter}
      onClick={onClick}
      className={rowClass(highlighted)}
    >
      <Avatar
        size="md"
        shape="circle"
        src={img ? tmdbImage(img, 'w185') : undefined}
        alt={searchItemTitle(item)}
        seed={searchItemTitle(item)}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="line-clamp-1 text-[13px] leading-4 font-medium text-text">
          {searchItemTitle(item)}
        </span>
        <span className="line-clamp-1 text-[12px] leading-4 font-medium text-text-tertiary">
          {item.known_for_department || 'Person'}
        </span>
      </div>
    </button>
  )
}

function UserRow({
  item,
  highlighted,
  onMouseEnter,
  onClick
}: {
  item: Doc<'profiles'>
  highlighted: boolean
  onMouseEnter: () => void
  onClick: () => void
}): React.JSX.Element {
  return (
    <button
      type="button"
      onMouseEnter={onMouseEnter}
      onClick={onClick}
      className={rowClass(highlighted)}
    >
      <Avatar
        size="md"
        shape="circle"
        src={item.avatarUrl}
        alt={item.displayName}
        seed={item.username}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="line-clamp-1 text-[13px] leading-4 font-medium text-text">
          {item.displayName}
        </span>
        <span className="line-clamp-1 text-[12px] leading-4 font-medium text-text-tertiary">
          @{item.username}
        </span>
      </div>
    </button>
  )
}

function labelFor(type: 'movie' | 'tv' | 'person', year: string): string {
  const prefix = type === 'movie' ? 'Movie' : type === 'tv' ? 'Series' : 'Person'
  return year ? `${prefix}, ${year}` : prefix
}

function useDebouncedValue<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(value), ms)
    return () => window.clearTimeout(id)
  }, [value, ms])
  return debounced
}

type NavFn = ReturnType<typeof useNavigate>

async function navigateAndRecord(
  args: {
    kind: 'movie' | 'tv' | 'person' | 'user'
    tmdbId?: number
    username?: string
    title: string
    subtitle?: string
    posterPath?: string
    avatarUrl?: string
  },
  navigate: NavFn,
  recordHistory: (args: {
    kind: 'movie' | 'tv' | 'person' | 'user'
    tmdbId?: number
    username?: string
    title: string
    subtitle?: string
    posterPath?: string
    avatarUrl?: string
  }) => Promise<unknown>
): Promise<void> {
  await recordHistory(args)
  navigateTo(args.kind, args.tmdbId, args.username, navigate)
}

function navigateTo(
  kind: 'movie' | 'tv' | 'person' | 'user',
  tmdbId: number | undefined,
  username: string | undefined,
  navigate: NavFn
): void {
  if (kind === 'movie' && tmdbId) {
    navigate({ to: '/movie/$id', params: { id: String(tmdbId) }, viewTransition: false })
  } else if (kind === 'tv' && tmdbId) {
    navigate({ to: '/tv/$id', params: { id: String(tmdbId) }, viewTransition: false })
  } else if (kind === 'person' && tmdbId) {
    navigate({ to: '/person/$id', params: { id: String(tmdbId) }, viewTransition: false })
  } else if (kind === 'user' && username) {
    navigate({ to: '/user/$username', params: { username }, viewTransition: false })
  }
}

function navigateToHistoryItem(item: Doc<'searchHistory'>, navigate: NavFn): void {
  navigateTo(item.kind, item.tmdbId, item.username, navigate)
}
