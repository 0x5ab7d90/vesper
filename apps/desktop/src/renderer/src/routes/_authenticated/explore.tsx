import { memo, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useInfiniteQuery } from '@tanstack/react-query'
import { useVirtualizer } from '@tanstack/react-virtual'
import { Button as BaseButton } from '@base-ui/react/button'
import { Segmented } from '@renderer/components/ui/segmented'
import { Select } from '@renderer/components/ui/select'
import { Skeleton } from '@renderer/components/ui/skeleton'
import { LoadMore } from '@renderer/components/ui/load-more'
import { genreIcon } from '@renderer/components/explore-icons'
import { usePreloadRoute } from '@renderer/lib/use-preload-route'
import { useScrollContainer } from '@renderer/lib/scroll-container'
import {
  discoverInfiniteQuery,
  EXPLORE_MOVIE_GENRES,
  EXPLORE_PAGE_SIZE,
  EXPLORE_SORTS,
  EXPLORE_TV_GENRES,
  type ExploreSort
} from '@renderer/lib/tmdb-queries'
import { tmdbImage, type TmdbMovie, type TmdbShow } from '@renderer/lib/tmdb'
import { cn } from '@renderer/lib/cn'
import { IMG_OUTLINE } from '@renderer/components/ui/image-outline'
import { useTvMode } from '@renderer/lib/tv-mode'
import { TvBrowse } from '@renderer/components/tv/tv-browse'

type ExploreType = 'movie' | 'tv'

// Defaults ('movie', 'popular', all genres) are left out of the URL so a plain /explore link works.
interface ExploreSearch {
  type?: ExploreType
  sort?: ExploreSort
  genre?: number
}

const SORT_VALUES = EXPLORE_SORTS.map((s) => s.value)
const ALL_GENRES = 'all'

function isSort(v: unknown): v is ExploreSort {
  return typeof v === 'string' && (SORT_VALUES as string[]).includes(v)
}

function parseGenre(value: unknown, type: ExploreType | undefined): number | undefined {
  const id = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
  if (!Number.isFinite(id)) return undefined
  const ids = type === 'tv' ? EXPLORE_TV_GENRES : EXPLORE_MOVIE_GENRES
  return ids.some((g) => g.id === id) ? id : undefined
}

export const Route = createFileRoute('/_authenticated/explore')({
  validateSearch: (search): ExploreSearch => {
    const type = search.type === 'tv' ? 'tv' : undefined
    return {
      type,
      sort: isSort(search.sort) && search.sort !== 'popular' ? search.sort : undefined,
      genre: parseGenre(search.genre, type)
    }
  },
  component: ExploreRoute
})

function ExploreRoute(): React.JSX.Element {
  return useTvMode() ? <TvBrowse /> : <ExplorePage />
}

interface ExploreItem {
  id: number
  title: string
  posterPath: string
}

function itemTitle(item: TmdbMovie | TmdbShow): string {
  return 'title' in item ? item.title : item.name
}

function ExplorePage(): React.JSX.Element {
  const { type = 'movie', sort = 'popular', genre } = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  const selected = useMemo(() => (genre !== undefined ? [genre] : []), [genre])

  const query = useInfiniteQuery(discoverInfiniteQuery(type, sort, selected))

  const items = useMemo<ExploreItem[]>(() => {
    const seen = new Set<number>()
    const out: ExploreItem[] = []
    for (const page of query.data?.pages ?? []) {
      for (const item of page.results) {
        if (!item.poster_path || seen.has(item.id)) continue
        seen.add(item.id)
        out.push({ id: item.id, title: itemTitle(item), posterPath: item.poster_path })
      }
    }
    return out
  }, [query.data])

  const patchSearch = (patch: Partial<ExploreSearch>): void => {
    void navigate({ search: (prev) => ({ ...prev, ...patch }), replace: true })
  }

  const genreOptions = type === 'movie' ? EXPLORE_MOVIE_GENRES : EXPLORE_TV_GENRES

  return (
    <div className="flex flex-col gap-5 px-6 pt-5 pb-12">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[24px] leading-tight font-bold tracking-[-0.02em] text-text">
          Explore
        </h1>
        <div className="flex items-center gap-2">
          <Segmented<ExploreType>
            options={[
              { value: 'movie', label: 'Movies' },
              { value: 'tv', label: 'Series' }
            ]}
            value={type}
            onChange={(next) => {
              // Movie and series genre ids don't overlap, so a type switch drops the pick.
              if (next !== type) patchSearch({ type: next, genre: undefined })
            }}
          />
          <Select
            ariaLabel="Genre"
            value={genre !== undefined ? String(genre) : ALL_GENRES}
            onChange={(v) => {
              if (v === ALL_GENRES) {
                patchSearch({ genre: undefined })
                return
              }
              const id = Number(v)
              if (Number.isFinite(id)) patchSearch({ genre: id })
            }}
            options={[
              { value: ALL_GENRES, label: 'All genres' },
              ...genreOptions.map((g) => {
                const Icon = genreIcon(g.id)
                return { value: String(g.id), label: g.label, icon: Icon ? <Icon /> : undefined }
              })
            ]}
          />
          <Select
            ariaLabel="Sort by"
            value={sort}
            onChange={(v) => {
              if (isSort(v)) patchSearch({ sort: v })
            }}
            options={EXPLORE_SORTS.map((s) => ({ value: s.value, label: s.label }))}
          />
        </div>
      </header>

      {query.isPending ? (
        <SkeletonGrid />
      ) : items.length === 0 ? (
        <EmptyResults
          hasFilters={genre !== undefined}
          onClear={() => patchSearch({ genre: undefined })}
        />
      ) : (
        <div className="flex flex-col gap-6">
          <VirtualGrid items={items} type={type} />
          <LoadMore
            hasMore={query.hasNextPage}
            onLoad={() => query.fetchNextPage()}
            rootMargin="1500px 0px"
            className="py-2"
          />
        </div>
      )}
    </div>
  )
}

// Shared by the grid and its skeleton so both lay out identically: as many
// CARD_MIN_WIDTH columns as fit, GRID_GAP between them.
const CARD_MIN_WIDTH = 140
const GRID_GAP = 16
const POSTER_RATIO = 3 / 2

// Renders only the on-screen rows. The full result set lives in the react-query cache
// (hundreds of items after a few load-mores), and mounting every card at once is what
// made entering and scrolling this page hitch.
function VirtualGrid({
  items,
  type
}: {
  items: ExploreItem[]
  type: ExploreType
}): React.JSX.Element {
  const scrollRef = useScrollContainer()
  const wrapRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  const [scrollMargin, setScrollMargin] = useState(0)

  useLayoutEffect(() => {
    const el = wrapRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const update = (): void => setWidth(el.clientWidth)
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Offset of the grid inside the scroll pane (header, page padding) so virtual row
  // positions line up with the pane's scrollTop.
  useLayoutEffect(() => {
    const el = wrapRef.current
    const scroller = scrollRef?.current
    if (!el || !scroller) return
    setScrollMargin(
      el.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop
    )
  }, [scrollRef, width])

  const cols =
    width > 0 ? Math.max(1, Math.floor((width + GRID_GAP) / (CARD_MIN_WIDTH + GRID_GAP))) : 1
  const cardWidth = width > 0 ? (width - (cols - 1) * GRID_GAP) / cols : CARD_MIN_WIDTH
  const rowHeight = cardWidth * POSTER_RATIO + GRID_GAP
  const rowCount = Math.ceil(items.length / cols)

  const virtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => scrollRef?.current ?? null,
    estimateSize: () => rowHeight,
    overscan: 3,
    scrollMargin
  })

  useLayoutEffect(() => {
    virtualizer.measure()
  }, [virtualizer, rowHeight])

  return (
    <div
      ref={wrapRef}
      // The last row's built-in gap stands in for the column gap above LoadMore.
      style={{ height: Math.max(0, virtualizer.getTotalSize() - GRID_GAP) }}
      className="relative"
    >
      {width > 0
        ? virtualizer.getVirtualItems().map((row) => (
            <div
              key={row.key}
              className="absolute inset-x-0 top-0 grid gap-4"
              style={{
                transform: `translateY(${row.start - scrollMargin}px)`,
                gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`
              }}
            >
              {items.slice(row.index * cols, row.index * cols + cols).map((item) => (
                <ExploreCard
                  key={item.id}
                  id={item.id}
                  title={item.title}
                  posterPath={item.posterPath}
                  type={type}
                />
              ))}
            </div>
          ))
        : null}
    </div>
  )
}

const ExploreCard = memo(function ExploreCard({
  id,
  title,
  posterPath,
  type
}: {
  id: number
  title: string
  posterPath: string
  type: ExploreType
}): React.JSX.Element {
  const navigate = useNavigate()
  const ref = useRef<HTMLButtonElement>(null)
  const target = {
    to: type === 'movie' ? ('/movie/$id' as const) : ('/tv/$id' as const),
    params: { id: String(id) }
  }
  usePreloadRoute(ref, target, { viewport: false })
  return (
    <BaseButton
      ref={ref}
      onClick={() => navigate({ ...target, viewTransition: false })}
      className="relative aspect-[2/3] w-full overflow-hidden rounded-xl bg-surface-2 outline-none focus-visible:ring-2 focus-visible:ring-white/40"
      aria-label={title}
    >
      <img
        src={tmdbImage(posterPath, 'w342')}
        alt=""
        loading="lazy"
        decoding="async"
        draggable={false}
        className={cn('absolute inset-0 size-full rounded-[inherit] object-cover', IMG_OUTLINE)}
      />
    </BaseButton>
  )
})

// One tile per card in the first batch, on the same track sizing as VirtualGrid, so the
// grid keeps its height and column width when the real cards take over.
function SkeletonGrid(): React.JSX.Element {
  return (
    <div
      aria-busy
      aria-label="Loading results"
      className="grid"
      style={{
        gap: GRID_GAP,
        gridTemplateColumns: `repeat(auto-fill, minmax(${CARD_MIN_WIDTH}px, 1fr))`
      }}
    >
      {Array.from({ length: EXPLORE_PAGE_SIZE }).map((_, i) => (
        <Skeleton key={i} className="aspect-[2/3] w-full rounded-xl" />
      ))}
    </div>
  )
}

function EmptyResults({
  hasFilters,
  onClear
}: {
  hasFilters: boolean
  onClear: () => void
}): React.JSX.Element {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-4 py-20 text-center">
      <div className="text-[16px] font-semibold text-text">Nothing matches these filters</div>
      <div className="text-[13px] font-medium text-text-tertiary">
        Try another genre or switching the sort.
      </div>
      {hasFilters ? (
        <button
          type="button"
          onClick={onClear}
          className="mt-1 flex h-8 items-center rounded-full bg-white/[0.06] px-4 text-[13px] font-medium text-text outline-none transition-colors hover:bg-white/[0.10] active:opacity-70"
        >
          Clear genre
        </button>
      ) : null}
    </div>
  )
}
