import { memo, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { Popover } from '@base-ui/react/popover'
import { VoiceBeam } from 'voice-glow'
import { useNavigate } from '@tanstack/react-router'
import { useQuery as useTanstackQuery } from '@tanstack/react-query'
import { useMutation, useQuery as useConvexQuery } from 'convex/react'
import { SearchInput } from '@renderer/components/ui/search-input'
import { Skeleton } from '@renderer/components/ui/skeleton'
import { IconButton } from '@renderer/components/ui/icon-button'
import { Avatar } from '@renderer/components/ui/avatar'
import {
  ArrowDownIcon,
  ArrowUpIcon,
  ArrowUpRightIcon,
  ChevronRightIcon,
  CmdIcon,
  MicIcon,
  ProjectsIcon,
  ReturnIcon
} from '@renderer/components/icons'
import { MapDrop } from '@renderer/components/brand/map-drop'
import { useVoiceSearch, type VoiceSearch } from '@renderer/hooks/use-voice-search'
import { isMac } from '@renderer/lib/platform'
import { cn } from '@renderer/lib/cn'
import { openProfile } from '@renderer/lib/profile-modal'
import { searchMultiQuery, trendingAllQuery } from '@renderer/lib/tmdb-queries'
import {
  searchItemImage,
  searchItemTitle,
  searchItemYear,
  tmdbImage,
  type TmdbSearchMultiItem
} from '@renderer/lib/tmdb'
import { api } from '@convex/_generated/api'
import type { Doc } from '@convex/_generated/dataModel'
import { SHEET_MOTION } from '@renderer/components/ui/popup-motion'

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

  // A finished take lands in the field like typed text: the query updates, the
  // palette fills, the caret waits at the end for a correction.
  const voice = useVoiceSearch((text) => {
    setQuery(text)
    setOpen(true)
    inputRef.current?.focus()
  })
  const cancelVoice = voice.cancel

  const onClose = useCallback((): void => {
    cancelVoice()
    setOpen(false)
    inputRef.current?.blur()
  }, [cancelVoice])

  // Reported from one place so every route into the state, focus, typing, Escape, an outside
  // press, opening a row, is announced the same way.
  useEffect(() => {
    onOpenChange?.(open)
  }, [open, onOpenChange])

  useConvexQuery(api.search.recentSearches, { limit: 4 })

  // Both chords work from anywhere in the app. Cmd/Ctrl+M opens the palette on its way
  // to the microphone, so a voice search is one keypress from any page.
  const toggleVoice = voice.toggle
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (!(e.metaKey || e.ctrlKey) || e.shiftKey || e.altKey) return
      const key = e.key.toLowerCase()
      if (key === 'k') {
        e.preventDefault()
        inputRef.current?.focus()
        inputRef.current?.select()
      } else if (key === 'm') {
        e.preventDefault()
        inputRef.current?.focus()
        toggleVoice()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [toggleVoice])

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
          {...(voice.status === 'listening' ? { placeholder: 'Listening…' } : {})}
          trailing={<TrailingSlot open={open} voice={voice} />}
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
              className={cn(
                'z-[100] overflow-hidden rounded-t-none rounded-b-xl bg-surface-2 outline-none shadow-[0_8px_24px_rgba(0,0,0,0.4)]',
                SHEET_MOTION
              )}
              style={{
                width: 'var(--anchor-width)',
                clipPath: 'inset(0 -100px -100px -100px)'
              }}
              initialFocus={inputRef}
              finalFocus={false}
            >
              {open ? (
                <SearchBody
                  debounced={debounced}
                  inputRef={inputRef}
                  onClose={onClose}
                  voice={voice}
                />
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

type CellKey = 'movie' | 'tv' | 'person' | 'user'

const CELLS: { key: CellKey; title: string }[] = [
  { key: 'movie', title: 'Movies' },
  { key: 'tv', title: 'Series' },
  { key: 'person', title: 'People' },
  { key: 'user', title: 'Users' }
]

const PER_CELL = 3
const NO_RECENTS: Doc<'searchHistory'>[] = []

/* The palette: a row of recent chips, four fixed cells (movies, series, people, users)
   that fill as you type but never move, and a footer that names the keys. At rest the
   media cells show the week's trending titles and the people and user cells replay
   recents, so the grid is never a set of empty headers. */
const SearchBody = memo(function SearchBody({
  debounced,
  inputRef,
  onClose,
  voice
}: {
  debounced: string
  inputRef: React.MutableRefObject<HTMLInputElement | null>
  onClose: () => void
  voice: VoiceSearch
}): React.JSX.Element {
  const navigate = useNavigate()
  const isTyping = debounced.length > 0

  const recents = useConvexQuery(api.search.recentSearches, { limit: 6 }) ?? NO_RECENTS
  const multi = useTanstackQuery(searchMultiQuery(debounced))
  const trending = useTanstackQuery({ ...trendingAllQuery(), enabled: !isTyping })
  const users = useConvexQuery(api.search.searchUsers, isTyping ? { query: debounced } : 'skip')

  const recordHistory = useMutation(api.search.recordSearchHistory)

  // One chip per title: a rewatch or a re-search should not mint a twin.
  const chips = useMemo(() => {
    const seen = new Set<string>()
    return recents.filter((r) => {
      const key = `${r.kind}:${r.tmdbId ?? r.username ?? r.title}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  }, [recents])

  const cells = useMemo<Record<CellKey, Row[]>>(() => {
    const out: Record<CellKey, Row[]> = { movie: [], tv: [], person: [], user: [] }
    if (!isTyping) {
      const t = (trending.data?.results ?? []) as TmdbSearchMultiItem[]
      out.movie = t
        .filter((r) => r.media_type === 'movie')
        .slice(0, PER_CELL)
        .map((r) => ({ kind: 'movie', id: `m-${r.id}`, data: r }))
      out.tv = t
        .filter((r) => r.media_type === 'tv')
        .slice(0, PER_CELL)
        .map((r) => ({ kind: 'tv', id: `t-${r.id}`, data: r }))
      out.person = recents
        .filter((r) => r.kind === 'person')
        .slice(0, PER_CELL)
        .map((r) => ({ kind: 'recent', id: r._id, data: r }))
      out.user = recents
        .filter((r) => r.kind === 'user')
        .slice(0, PER_CELL)
        .map((r) => ({ kind: 'recent', id: r._id, data: r }))
      return out
    }
    const sorted = (multi.data?.results ?? []).slice().sort((a, b) => b.popularity - a.popularity)
    out.movie = sorted
      .filter((r) => r.media_type === 'movie')
      .slice(0, PER_CELL)
      .map((r) => ({ kind: 'movie', id: `m-${r.id}`, data: r }))
    out.tv = sorted
      .filter((r) => r.media_type === 'tv')
      .slice(0, PER_CELL)
      .map((r) => ({ kind: 'tv', id: `t-${r.id}`, data: r }))
    out.person = sorted
      .filter((r) => r.media_type === 'person')
      .slice(0, PER_CELL)
      .map((r) => ({ kind: 'person', id: `p-${r.id}`, data: r }))
    out.user = (users ?? []).slice(0, PER_CELL).map((u) => ({ kind: 'user', id: u._id, data: u }))
    return out
  }, [isTyping, trending.data, multi.data, users, recents])

  // Keyboard order walks the cells left to right, top to bottom.
  const rows = useMemo<Row[]>(() => CELLS.flatMap((c) => cells[c.key]), [cells])

  // The highlight is stamped with the query it belongs to, so a new query reads as
  // "nothing highlighted" without an effect resetting state after render.
  const [hl, setHl] = useState<{ q: string; i: number }>({ q: debounced, i: -1 })
  const highlight = hl.q === debounced ? hl.i : -1
  const setHighlight = (next: number | ((h: number) => number)): void =>
    setHl((prev) => {
      const cur = prev.q === debounced ? prev.i : -1
      return { q: debounced, i: typeof next === 'function' ? next(cur) : next }
    })

  const pending = isTyping ? multi.isPending : trending.isPending
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

  const seeAll = (): void => {
    onClose()
    void navigate({ to: '/search', search: { q: debounced } })
  }

  useEffect(() => {
    const input = inputRef.current
    if (!input) return
    const onKey = (e: KeyboardEvent): void => {
      if (voice.status === 'listening') {
        // While the microphone is open, Enter ends the take and Escape throws it away.
        if (e.key === 'Enter') {
          e.preventDefault()
          voice.toggle()
          return
        }
        if (e.key === 'Escape') {
          voice.cancel()
          return
        }
      }
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
          seeAll()
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
  }, [rows, highlight, onClose, isTyping, debounced, navigate, voice])

  const indexOf = (row: Row): number => rows.findIndex((r) => r.id === row.id)

  const voiceBusy = voice.status !== 'idle'
  const footerStatus = voice.status === 'listening' || voice.status === 'message'

  return (
    <VoiceBeam
      stream={voice.stream}
      active={voiceBusy}
      processing={voice.status === 'loading' || voice.status === 'transcribing'}
      theme="dark"
      colorVariant="ocean"
      borderRadius={18}
      className="flex max-h-[520px] flex-col overflow-hidden"
    >
      {chips.length > 0 ? (
        <div className="flex shrink-0 flex-col gap-2 border-b border-white/[0.06] px-4 pt-3 pb-3">
          <span className="text-[12px] leading-4 font-medium text-text-muted">Recent</span>
          <div className="scroll-hide flex gap-1.5 overflow-x-hidden">
            {chips.map((item) => (
              <RecentChip
                key={item._id}
                item={item}
                onClick={() => openRow({ kind: 'recent', id: item._id, data: item })}
              />
            ))}
          </div>
        </div>
      ) : null}

      <div className="scroll-hide min-h-0 overflow-y-auto overscroll-contain" aria-busy={pending}>
        {pending ? (
          <GridSkeleton />
        ) : showNoResults ? (
          <NoResultsState query={debounced} />
        ) : (
          <div className="grid grid-cols-2">
            {CELLS.map((cell, i) => (
              <Cell
                key={cell.key}
                title={cell.title}
                right={i % 2 === 0}
                bottom={i < 2}
                onOpenAll={isTyping ? seeAll : undefined}
              >
                {cells[cell.key].map((row) => (
                  <PaletteRow
                    key={row.id}
                    row={row}
                    highlighted={highlight >= 0 && indexOf(row) === highlight}
                    onMouseEnter={() => setHighlight(indexOf(row))}
                    onClick={() => openRow(row)}
                  />
                ))}
              </Cell>
            ))}
          </div>
        )}
      </div>

      <div className="flex shrink-0 items-center justify-between border-t border-white/[0.06] px-4 py-2.5 text-[12px] leading-4 font-medium text-text-muted">
        {footerStatus ? (
          <VoiceStatus voice={voice} />
        ) : (
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1.5">
              <Key>
                <ArrowUpIcon className="size-3" />
              </Key>
              <Key>
                <ArrowDownIcon className="size-3" />
              </Key>
              Navigate
            </span>
            <span className="flex items-center gap-1.5">
              <Key>
                <ReturnIcon className="size-3" />
              </Key>
              Select
            </span>
            <span className="flex items-center gap-1.5">
              <VoiceKeys />
              Voice
            </span>
          </div>
        )}
        {isTyping ? (
          <button
            type="button"
            onClick={seeAll}
            className="flex items-center gap-1.5 bg-transparent text-text-muted outline-none transition-colors duration-150 ease-out hover:text-text"
          >
            See all results
            <span className="flex items-center gap-0.5">
              <Key>
                {isMac ? <CmdIcon className="size-3" /> : <span className="text-[10px]">Ctrl</span>}
              </Key>
              <Key>
                <ReturnIcon className="size-3" />
              </Key>
            </span>
          </button>
        ) : null}
      </div>
    </VoiceBeam>
  )
})

/* The chord that opens the microphone, drawn the way the footer draws every key. */
function VoiceKeys(): React.JSX.Element {
  return (
    <span className="flex items-center gap-0.5">
      <Key>
        {isMac ? <CmdIcon className="size-3" /> : <span className="text-[10px]">Ctrl</span>}
      </Key>
      <Key>
        <span className="text-[10px]">M</span>
      </Key>
    </span>
  )
}

/* While the microphone is open the footer names the two keys that matter; while the
   model works, the glow carries the state and the footer stays as it was. Nothing
   here animates in or out: the hotkey is used constantly. */
function VoiceStatus({ voice }: { voice: VoiceSearch }): React.JSX.Element | null {
  switch (voice.status) {
    case 'listening':
      return (
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5">
            <Key>
              <ReturnIcon className="size-3" />
            </Key>
            Done
          </span>
          <span className="flex items-center gap-1.5">
            <Key>
              <span className="text-[10px]">Esc</span>
            </Key>
            Cancel
          </span>
        </div>
      )
    case 'message':
      return <span role="status">{voice.message}</span>
    default:
      return null
  }
}

function Key({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded-[6px] bg-white/[0.06] px-1 font-sans text-text-tertiary">
      {children}
    </kbd>
  )
}

function Cell({
  title,
  right,
  bottom,
  onOpenAll,
  children
}: {
  title: string
  right: boolean
  bottom: boolean
  onOpenAll?: () => void
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <div
      className={cn(
        'flex min-h-[148px] flex-col px-2 pt-2.5 pb-2',
        right && 'border-r border-white/[0.06]',
        bottom && 'border-b border-white/[0.06]'
      )}
    >
      <div className="flex h-7 items-center justify-between px-2">
        <span className="text-[12px] leading-4 font-medium text-text-muted">{title}</span>
        {onOpenAll ? (
          <button
            type="button"
            onClick={onOpenAll}
            aria-label={`See all ${title.toLowerCase()}`}
            className="-m-0.5 flex size-6 items-center justify-center rounded-full bg-transparent text-text-muted outline-none hover:text-text"
          >
            <ArrowUpRightIcon className="size-3.5" />
          </button>
        ) : null}
      </div>
      <div className="flex flex-col">{children}</div>
    </div>
  )
}

function rowThumb(row: Row): { src?: string; circle: boolean; seed: string; alt: string } {
  switch (row.kind) {
    case 'recent': {
      const circle = row.data.kind === 'person' || row.data.kind === 'user'
      const src = row.data.posterPath
        ? tmdbImage(row.data.posterPath, 'w154')
        : (row.data.avatarUrl ?? undefined)
      return { src, circle, seed: row.data.username ?? row.data.title, alt: row.data.title }
    }
    case 'movie':
    case 'tv':
    case 'person': {
      const img = searchItemImage(row.data)
      return {
        src: img ? tmdbImage(img, 'w154') : undefined,
        circle: row.kind === 'person',
        seed: searchItemTitle(row.data),
        alt: searchItemTitle(row.data)
      }
    }
    case 'user':
      return {
        src: row.data.avatarUrl,
        circle: true,
        seed: row.data.username,
        alt: row.data.displayName
      }
  }
}

function rowTitle(row: Row): string {
  switch (row.kind) {
    case 'recent':
      return row.data.title
    case 'user':
      return row.data.displayName
    default:
      return searchItemTitle(row.data)
  }
}

function PaletteRow({
  row,
  highlighted,
  onMouseEnter,
  onClick
}: {
  row: Row
  highlighted: boolean
  onMouseEnter: () => void
  onClick: () => void
}): React.JSX.Element {
  const thumb = rowThumb(row)
  return (
    <button
      type="button"
      onMouseEnter={onMouseEnter}
      onClick={onClick}
      className={cn(
        'flex h-9 w-full items-center gap-2.5 rounded-lg bg-transparent px-2 text-left outline-none transition-colors duration-150 ease-out',
        highlighted && 'bg-white/[0.06]'
      )}
    >
      {thumb.circle ? (
        <Avatar size="xs" shape="circle" src={thumb.src} alt={thumb.alt} seed={thumb.seed} />
      ) : (
        <span
          className="size-5 shrink-0 overflow-hidden rounded-[5px] bg-surface-3 bg-cover bg-center"
          style={thumb.src ? { backgroundImage: `url(${thumb.src})` } : undefined}
          aria-hidden
        />
      )}
      <span className="line-clamp-1 min-w-0 flex-1 text-[13px] leading-4 font-medium text-text">
        {rowTitle(row)}
      </span>
      <ChevronRightIcon
        className={cn(
          'size-3.5 shrink-0 text-text-muted transition-opacity duration-150 ease-out',
          highlighted ? 'opacity-100' : 'opacity-0'
        )}
      />
    </button>
  )
}

function RecentChip({
  item,
  onClick
}: {
  item: Doc<'searchHistory'>
  onClick: () => void
}): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-7 shrink-0 items-center rounded-full bg-white/[0.06] px-2.5 text-[12px] leading-4 font-medium whitespace-nowrap text-text-secondary outline-none hover:bg-white/[0.1] hover:text-text"
    >
      <span className="max-w-[160px] truncate">{item.title}</span>
    </button>
  )
}

/* Same footprint as the resting grid: four cells, a title, three rows. */
function GridSkeleton(): React.JSX.Element {
  return (
    <div className="grid grid-cols-2">
      {CELLS.map((cell, i) => (
        <div
          key={cell.key}
          className={cn(
            'flex min-h-[148px] flex-col px-2 pt-2.5 pb-2',
            i % 2 === 0 && 'border-r border-white/[0.06]',
            i < 2 && 'border-b border-white/[0.06]'
          )}
        >
          <div className="flex h-7 items-center px-2">
            <Skeleton className="h-3 w-14 rounded" />
          </div>
          {Array.from({ length: PER_CELL }).map((_, j) => (
            <div key={j} className="flex h-9 items-center gap-2.5 px-2">
              <Skeleton className="size-5 shrink-0 rounded-[5px]" />
              <Skeleton className="h-3 w-2/3 rounded" />
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

function NoResultsState({ query }: { query: string }): React.JSX.Element {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-4 py-10 text-center">
      <MapDrop size={96} />
      <div className="flex flex-col gap-1">
        <div className="text-[14px] font-medium text-text">No matches for &quot;{query}&quot;</div>
        <div className="text-[12px] font-medium text-text-tertiary">
          Try a different spelling or browse trending titles.
        </div>
      </div>
    </div>
  )
}

/**
 * The right end of the search bar holds the explore shortcut at rest and goes quiet
 * once the palette is open, cross-faded as an icon swap so the bar never reflows.
 */
function TrailingSlot({ open, voice }: { open: boolean; voice: VoiceSearch }): React.JSX.Element {
  const navigate = useNavigate()
  const listening = voice.status === 'listening'
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
          className="size-9 rounded-lg hover:text-text"
        >
          <ProjectsIcon className="size-[19px]" />
        </IconButton>
      </span>
      <span
        className={cn('t-icon flex items-center', !open && 'pointer-events-none')}
        data-icon="b"
        aria-hidden={!open}
      >
        <IconButton
          variant="ghost"
          aria-label={listening ? 'Stop listening' : 'Search by voice'}
          aria-pressed={listening}
          tabIndex={-1}
          onClick={(e) => {
            e.preventDefault()
            voice.toggle()
          }}
          className={cn('size-9 rounded-lg hover:text-text', listening && 'text-text')}
        >
          <MicIcon className="size-[19px]" />
        </IconButton>
      </span>
    </span>
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
    openProfile(username)
  }
}

function navigateToHistoryItem(item: Doc<'searchHistory'>, navigate: NavFn): void {
  navigateTo(item.kind, item.tmdbId, item.username, navigate)
}
