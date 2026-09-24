import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { useInfiniteQuery } from '@tanstack/react-query'
import { useVirtualizer } from '@tanstack/react-virtual'
import { LoadMore } from '@renderer/components/ui/load-more'
import type { PosterRowItem } from '@renderer/components/media/poster-row'
import { TV_GUTTER, TvPill, TvPillRow, TvPosterCard } from '@renderer/components/tv/tv-row'
import { useScrollContainer } from '@renderer/lib/scroll-container'
import {
  discoverInfiniteQuery,
  EXPLORE_MOVIE_GENRES,
  EXPLORE_SORTS,
  EXPLORE_TV_GENRES,
  type ExploreSort
} from '@renderer/lib/tmdb-queries'
import { tmdbImage } from '@renderer/lib/tmdb'
import { cn } from '@renderer/lib/cn'

type BrowseType = 'movie' | 'tv'
type GenreChoice = number | 'all'

const CARD_MIN_WIDTH = 220
const GRID_GAP = 24
const POSTER_RATIO = 3 / 2
const SKELETON_ROWS = 2

// Explore at ten feet. It shares Explore's URL (type, sort, genre), so a filter picked here
// survives leaving Big Picture, and the other way round.
export function TvBrowse(): React.JSX.Element {
  const {
    type = 'movie',
    sort = 'popular',
    genre
  } = useSearch({
    from: '/_authenticated/explore'
  })
  const navigate = useNavigate()
  const genres = useMemo(() => (genre !== undefined ? [genre] : []), [genre])
  const query = useInfiniteQuery(discoverInfiniteQuery(type, sort, genres))

  const items = useMemo<PosterRowItem[]>(() => {
    const seen = new Set<number>()
    const out: PosterRowItem[] = []
    for (const page of query.data?.pages ?? []) {
      for (const item of page.results) {
        if (!item.poster_path || seen.has(item.id)) continue
        seen.add(item.id)
        out.push({
          id: item.id,
          title: 'title' in item ? item.title : item.name,
          poster: tmdbImage(item.poster_path, 'w500') ?? '',
          posterPath: item.poster_path,
          type
        })
      }
    }
    return out
  }, [query.data, type])

  const patch = (next: { type?: BrowseType; sort?: ExploreSort; genre?: number }): void => {
    void navigate({
      to: '/explore',
      search: (prev) => {
        const merged = { ...prev, ...next }
        // Defaults stay out of the URL, as on the desktop page.
        return {
          type: merged.type === 'tv' ? 'tv' : undefined,
          sort: merged.sort && merged.sort !== 'popular' ? merged.sort : undefined,
          genre: merged.genre
        }
      },
      replace: true
    })
  }

  const genreOptions = useMemo(
    () => [
      { value: 'all' as GenreChoice, label: 'All' },
      ...(type === 'movie' ? EXPLORE_MOVIE_GENRES : EXPLORE_TV_GENRES).map((g) => ({
        value: g.id as GenreChoice,
        label: g.label
      }))
    ],
    [type]
  )

  return (
    <div className="flex flex-col gap-6 pt-32 pb-16">
      <div className={cn(TV_GUTTER, 'flex flex-wrap items-center gap-3')}>
        <div role="group" aria-label="Type" className="flex gap-3">
          <TvPill
            active={type === 'movie'}
            onClick={() => patch({ type: 'movie', genre: undefined })}
          >
            Movies
          </TvPill>
          <TvPill active={type === 'tv'} onClick={() => patch({ type: 'tv', genre: undefined })}>
            Series
          </TvPill>
        </div>
        <span aria-hidden className="mx-3 h-8 w-px bg-white/15" />
        <div role="group" aria-label="Sort by" className="flex gap-3">
          {EXPLORE_SORTS.map((s) => (
            <TvPill
              key={s.value}
              active={sort === s.value}
              onClick={() => patch({ sort: s.value })}
            >
              {s.label}
            </TvPill>
          ))}
        </div>
      </div>
      {/* Keyed by type: movie and series genres differ, so the row re-centres on its pick. */}
      <TvPillRow
        key={type}
        label="Genre"
        options={genreOptions}
        value={genre ?? 'all'}
        onChange={(v) => patch({ genre: v === 'all' ? undefined : v })}
      />

      <div className={cn(TV_GUTTER, 'pt-4')}>
        {query.isPending ? (
          <SkeletonGrid />
        ) : items.length === 0 ? (
          <div className="flex flex-col gap-3 pt-8">
            <p className="text-[28px] leading-8 font-medium text-text">
              Nothing matches these filters
            </p>
            <p className="text-[20px] leading-7 font-normal text-text-tertiary">
              Try another genre or a different sort.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-8">
            <VirtualGrid items={items} />
            <LoadMore
              hasMore={query.hasNextPage}
              onLoad={() => query.fetchNextPage()}
              rootMargin="1500px 0px"
              className="py-2"
            />
          </div>
        )}
      </div>
    </div>
  )
}

function useColumns(width: number): { cols: number; cardWidth: number } {
  const cols =
    width > 0 ? Math.max(1, Math.floor((width + GRID_GAP) / (CARD_MIN_WIDTH + GRID_GAP))) : 1
  const cardWidth = width > 0 ? (width - (cols - 1) * GRID_GAP) / cols : CARD_MIN_WIDTH
  return { cols, cardWidth }
}

// Only on-screen rows mount, same as the desktop Explore grid: after a few pages there are
// hundreds of posters, and mounting them all is what makes scrolling hitch.
function VirtualGrid({ items }: { items: PosterRowItem[] }): React.JSX.Element {
  const scrollRef = useScrollContainer()
  const wrapRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  const [scrollMargin, setScrollMargin] = useState(0)

  useLayoutEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const update = (): void => setWidth(el.clientWidth)
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useLayoutEffect(() => {
    const el = wrapRef.current
    const scroller = scrollRef?.current
    if (!el || !scroller) return
    setScrollMargin(
      el.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop
    )
  }, [scrollRef, width])

  const { cols, cardWidth } = useColumns(width)
  const rowHeight = cardWidth * POSTER_RATIO + GRID_GAP
  const rowCount = Math.ceil(items.length / cols)

  const virtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => scrollRef?.current ?? null,
    estimateSize: () => rowHeight,
    overscan: 2,
    scrollMargin
  })

  useLayoutEffect(() => {
    virtualizer.measure()
  }, [virtualizer, rowHeight])

  return (
    <div
      ref={wrapRef}
      className="relative"
      style={{ height: Math.max(0, virtualizer.getTotalSize() - GRID_GAP) }}
    >
      {width > 0
        ? virtualizer.getVirtualItems().map((row) => (
            <div
              key={row.key}
              className="absolute inset-x-0 top-0 grid"
              style={{
                gap: GRID_GAP,
                transform: `translateY(${row.start - scrollMargin}px)`,
                gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`
              }}
            >
              {items.slice(row.index * cols, row.index * cols + cols).map((item) => (
                <TvPosterCard
                  key={item.id}
                  item={item}
                  preloadOnView={false}
                  className="aspect-[2/3] h-auto w-full"
                />
              ))}
            </div>
          ))
        : null}
    </div>
  )
}

function SkeletonGrid(): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  useLayoutEffect(() => {
    setWidth(ref.current?.clientWidth ?? 0)
  }, [])
  const { cols } = useColumns(width)
  return (
    <div
      ref={ref}
      aria-busy
      aria-label="Loading titles"
      className="grid"
      style={{ gap: GRID_GAP, gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
    >
      {Array.from({ length: cols * SKELETON_ROWS }).map((_, i) => (
        <div key={i} className="aspect-[2/3] w-full animate-pulse rounded-xl bg-surface-2" />
      ))}
    </div>
  )
}
