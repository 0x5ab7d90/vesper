import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useMutation, type usePaginatedQuery } from 'convex/react'
import { useQueries } from '@tanstack/react-query'
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState
} from '@tanstack/react-table'
import { useVirtualizer } from '@tanstack/react-virtual'
import { MediaContextMenu } from '@renderer/components/library/media-context-menu'
import { tmdbImage } from '@renderer/lib/tmdb'
import { movieDetailsQuery, tvDetailsQuery } from '@renderer/lib/tmdb-queries'
import { StarSolidIcon } from '@renderer/components/icons'
import { api } from '@convex/_generated/api'
import type { Doc, Id } from '@convex/_generated/dataModel'
import { cn } from '@renderer/lib/cn'

const ROW_HEIGHT = 60
const SORT_STORAGE_PREFIX = 'vesper:list-sort:'

type ListItemRow = Doc<'listItems'>

interface EnrichedRow {
  item: ListItemRow
  year: string
  runtime: number
  typeLabel: string
  rating?: number
}

function readSort(listId: string): SortingState {
  try {
    const raw = localStorage.getItem(SORT_STORAGE_PREFIX + listId)
    if (!raw) return []
    const parsed = JSON.parse(raw) as SortingState
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeSort(listId: string, sorting: SortingState): void {
  try {
    localStorage.setItem(SORT_STORAGE_PREFIX + listId, JSON.stringify(sorting))
  } catch {
    // ignore
  }
}

function estimateShowRuntime(d: {
  episode_run_time?: number[]
  number_of_episodes?: number
  last_episode_to_air?: { runtime?: number | null } | null
}): number {
  const avg = d.episode_run_time?.[0] ?? d.last_episode_to_air?.runtime ?? 0
  return avg * (d.number_of_episodes ?? 0)
}

function formatHM(min: number): string {
  if (!min) return '—'
  const h = Math.floor(min / 60)
  const m = min % 60
  if (h && m) return `${h}h ${m}m`
  if (h) return `${h}h`
  return `${m}m`
}

function relativeTime(ms: number): string {
  const diff = Date.now() - ms
  const s = Math.floor(diff / 1000)
  const m = Math.floor(s / 60)
  const h = Math.floor(m / 60)
  const d = Math.floor(h / 24)
  const w = Math.floor(d / 7)
  const mo = Math.floor(d / 30)
  const y = Math.floor(d / 365)
  if (y >= 1) return `${y}y ago`
  if (mo >= 1) return `${mo}mo ago`
  if (w >= 1) return `${w}w ago`
  if (d >= 1) return `${d}d ago`
  if (h >= 1) return `${h}h ago`
  if (m >= 1) return `${m}m ago`
  return 'just now'
}

const columnHelper = createColumnHelper<EnrichedRow>()

export function ItemsTable({
  listId,
  items,
  status,
  loadMore,
  canRemove,
  showRating,
  ratingsMap
}: {
  listId: Id<'lists'>
  items: ListItemRow[]
  status: ReturnType<typeof usePaginatedQuery>['status']
  loadMore: (n: number) => void
  canRemove: boolean
  showRating: boolean
  ratingsMap?: Map<string, number>
}): React.JSX.Element {
  const navigate = useNavigate()
  const removeFromList = useMutation(api.lists.removeFromList)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const sentinelRef = useRef<HTMLDivElement | null>(null)
  const [scrollEl, setScrollEl] = useState<HTMLElement | null>(null)
  const [sorting, setSorting] = useState<SortingState>(() => readSort(listId))

  useEffect(() => {
    let el: HTMLElement | null = containerRef.current
    while (el) {
      const s = getComputedStyle(el)
      if (/(auto|scroll|overlay)/.test(s.overflowY)) {
        setScrollEl(el)
        return
      }
      el = el.parentElement
    }
    setScrollEl(document.scrollingElement as HTMLElement | null)
  }, [])

  useEffect(() => {
    writeSort(listId, sorting)
  }, [listId, sorting])

  useEffect(() => {
    const el = sentinelRef.current
    if (!el) return
    if (status !== 'CanLoadMore') return
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) loadMore(30)
      },
      { rootMargin: '600px' }
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [status, loadMore])

  const movieIds: number[] = []
  const tvIds: number[] = []
  for (const i of items) {
    if (i.mediaType === 'movie') movieIds.push(i.tmdbId)
    else if (i.mediaType === 'tv') tvIds.push(i.tmdbId)
  }
  const movieQueries = useQueries({
    queries: movieIds.map((id) => movieDetailsQuery(id))
  })
  const tvQueries = useQueries({
    queries: tvIds.map((id) => tvDetailsQuery(id))
  })

  const movieDataKey = movieQueries.map((q) => q.dataUpdatedAt).join(',')
  const tvDataKey = tvQueries.map((q) => q.dataUpdatedAt).join(',')

  const detailsByKey = useMemo(() => {
    const m = new Map<string, { year: string; runtime: number }>()
    movieIds.forEach((id, i) => {
      const d = movieQueries[i]?.data
      const year = d?.release_date?.slice(0, 4) ?? ''
      const runtime = d?.runtime ?? 0
      m.set(`movie:${id}`, { year, runtime })
    })
    tvIds.forEach((id, i) => {
      const d = tvQueries[i]?.data
      const year = d?.first_air_date?.slice(0, 4) ?? ''
      const runtime = d ? estimateShowRuntime(d) : 0
      m.set(`tv:${id}`, { year, runtime })
    })
    return m
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [movieDataKey, tvDataKey, items])

  const data = useMemo<EnrichedRow[]>(() => {
    return items.map((item) => {
      const k = `${item.mediaType}:${item.tmdbId}`
      const d = detailsByKey.get(k)
      return {
        item,
        year: d?.year ?? '',
        runtime: d?.runtime ?? 0,
        typeLabel: item.mediaType === 'movie' ? 'Movie' : 'Show',
        rating: ratingsMap?.get(k)
      }
    })
  }, [items, detailsByKey, ratingsMap])

  const columns = useMemo<ColumnDef<EnrichedRow>[]>(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cols: ColumnDef<EnrichedRow, any>[] = [
      columnHelper.display({
        id: 'index',
        header: () => <span className="text-right tabular-nums">#</span>,
        cell: ({ row }) => (
          <span className="text-right text-[12px] leading-4 font-medium text-text-tertiary tabular-nums">
            {row.index + 1}
          </span>
        ),
        size: 36,
        enableSorting: false
      }),
      columnHelper.accessor((r) => r.item.title, {
        id: 'title',
        header: 'Title',
        cell: ({ row }) => {
          const it = row.original.item
          const poster = tmdbImage(it.posterPath, 'w154')
          return (
            <div className="flex min-w-0 items-center gap-3">
              <div className="relative h-[44px] w-[31px] shrink-0 overflow-hidden rounded-[5px] bg-surface-3">
                {poster ? (
                  <div
                    className="absolute inset-0 bg-cover bg-center"
                    style={{ backgroundImage: `url(${poster})` }}
                  />
                ) : null}
              </div>
              <span className="truncate text-[14px] leading-5 font-medium text-text">
                {it.title}
              </span>
            </div>
          )
        },
        enableSorting: true,
        sortingFn: (a, b) => a.original.item.title.localeCompare(b.original.item.title),
        size: 320
      }),
      columnHelper.accessor('typeLabel', {
        id: 'type',
        header: 'Type',
        cell: ({ getValue }) => (
          <span className="text-[12px] leading-4 font-medium text-text-tertiary">{getValue()}</span>
        ),
        size: 80,
        enableSorting: false
      }),
      columnHelper.accessor((r) => Number(r.year) || 0, {
        id: 'year',
        header: 'Year',
        cell: ({ row }) => (
          <span className="text-[12px] leading-4 font-medium text-text-tertiary tabular-nums">
            {row.original.year || '—'}
          </span>
        ),
        size: 70,
        enableSorting: true
      }),
      columnHelper.accessor((r) => r.item.addedAt, {
        id: 'addedAt',
        header: 'Added',
        cell: ({ row }) => (
          <span className="text-[12px] leading-4 font-medium text-text-tertiary">
            {relativeTime(row.original.item.addedAt)}
          </span>
        ),
        size: 110,
        enableSorting: true
      }),
      columnHelper.accessor((r) => r.runtime, {
        id: 'runtime',
        header: () => <span className="block w-full text-right">Runtime</span>,
        cell: ({ row }) => (
          <span className="block w-full text-right text-[12px] leading-4 font-medium text-text-tertiary tabular-nums">
            {formatHM(row.original.runtime)}
          </span>
        ),
        size: 90,
        enableSorting: true
      })
    ]
    if (showRating) {
      cols.push(
        columnHelper.accessor((r) => r.rating ?? 0, {
          id: 'rating',
          header: () => <span className="block w-full text-right">Rating</span>,
          cell: ({ row }) => {
            const r = row.original.rating
            if (r === undefined) return null
            return (
              <span className="flex justify-end gap-0.5">
                {[1, 2, 3, 4, 5].map((n) => (
                  <StarSolidIcon
                    key={n}
                    className={cn('size-3', n <= r ? 'text-text' : 'text-text-muted/40')}
                  />
                ))}
              </span>
            )
          },
          size: 110,
          enableSorting: true
        })
      )
    }
    return cols
  }, [showRating])

  const table = useReactTable({
    data,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel()
  })

  const rows = table.getRowModel().rows
  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollEl,
    estimateSize: () => ROW_HEIGHT,
    overscan: 10
  })

  const go = (item: ListItemRow): void => {
    navigate({
      to: item.mediaType === 'movie' ? '/movie/$id' : '/tv/$id',
      params: { id: String(item.tmdbId) },
      viewTransition: false
    })
  }

  const totalSize = rowVirtualizer.getTotalSize()
  const virtualRows = rowVirtualizer.getVirtualItems()

  return (
    <div ref={containerRef} className="relative">
      <div className="sticky top-0 z-10 flex items-center border-b border-white/[0.06] bg-surface/95 backdrop-blur-md">
        {table.getHeaderGroups().map((hg) =>
          hg.headers.map((h) => {
            const canSort = h.column.getCanSort()
            const sorted = h.column.getIsSorted()
            return (
              <div
                key={h.id}
                style={{
                  width: h.getSize(),
                  flexGrow: h.column.id === 'title' ? 1 : 0,
                  flexShrink: 0
                }}
                className={cn(
                  'flex items-center px-3 py-2 text-[11px] leading-4 font-semibold tracking-[0.06em] uppercase text-text-tertiary select-none',
                  canSort && 'hover:text-text'
                )}
                onClick={canSort ? h.column.getToggleSortingHandler() : undefined}
              >
                <span className="inline-flex items-center gap-1">
                  {flexRender(h.column.columnDef.header, h.getContext())}
                  {sorted === 'asc' ? <span aria-hidden>↑</span> : null}
                  {sorted === 'desc' ? <span aria-hidden>↓</span> : null}
                </span>
              </div>
            )
          })
        )}
      </div>
      <div style={{ height: totalSize, position: 'relative' }}>
        {virtualRows.map((vr) => {
          const row = rows[vr.index]
          const it = row.original.item
          return (
            <MediaContextMenu
              key={row.id}
              mediaType={it.mediaType}
              tmdbId={it.tmdbId}
              title={it.title}
              posterPath={it.posterPath}
              onRemove={
                canRemove ? () => void removeFromList({ listId, listItemId: it._id }) : undefined
              }
            >
              <div
                role="button"
                tabIndex={0}
                onClick={() => go(it)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    go(it)
                  }
                }}
                className="absolute top-0 left-0 flex w-full items-center outline-none hover:bg-white/[0.04]"
                style={{
                  height: ROW_HEIGHT,
                  transform: `translateY(${vr.start}px)`
                }}
              >
                {row.getVisibleCells().map((cell) => (
                  <div
                    key={cell.id}
                    style={{
                      width: cell.column.getSize(),
                      flexGrow: cell.column.id === 'title' ? 1 : 0,
                      flexShrink: 0
                    }}
                    className="flex h-full items-center px-3"
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </div>
                ))}
              </div>
            </MediaContextMenu>
          )
        })}
      </div>
      <div ref={sentinelRef} className="h-4" />
    </div>
  )
}
