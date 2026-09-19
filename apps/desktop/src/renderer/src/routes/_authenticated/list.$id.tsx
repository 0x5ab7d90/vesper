import { useEffect, useRef, useState } from 'react'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useMutation, useQuery as useConvexQuery, usePaginatedQuery } from 'convex/react'
import { useQueries } from '@tanstack/react-query'
import { ItemsTable } from '@renderer/components/library/items-table'
import { ListCover } from '@renderer/components/library/list-cover'
import { ListContextMenu } from '@renderer/components/library/list-context-menu'
import { MediaContextMenu } from '@renderer/components/library/media-context-menu'
import { IconButton } from '@renderer/components/ui/icon-button'
import { ExpandingSearch } from '@renderer/components/ui/expanding-search'
import { MenuDotsIcon } from '@renderer/components/icons'
import { movieDetailsQuery, tvDetailsQuery } from '@renderer/lib/tmdb-queries'
import { openProfile } from '@renderer/lib/profile-modal'
import { tmdbImage } from '@renderer/lib/tmdb'
import { api } from '@convex/_generated/api'
import type { Doc, Id } from '@convex/_generated/dataModel'

const PAGE_SIZE = 30

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs)
    return () => clearTimeout(id)
  }, [value, delayMs])
  return debounced
}

export const Route = createFileRoute('/_authenticated/list/$id')({
  component: ListPage
})

type ViewMode = 'list' | 'grid'

function ListPage(): React.JSX.Element {
  const { id } = Route.useParams()
  const listId = id as Id<'lists'>
  const list = useConvexQuery(api.lists.listById, { listId })
  const [view, setView] = useState<ViewMode>('list')

  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedValue(search, 200)
  const searching = debouncedSearch.trim().length > 0

  const base = usePaginatedQuery(api.lists.listItems, { listId }, { initialNumItems: PAGE_SIZE })
  const found = usePaginatedQuery(
    api.lists.searchListItems,
    searching ? { listId, query: debouncedSearch } : 'skip',
    { initialNumItems: PAGE_SIZE }
  )
  const items = base.results
  const { results: tableItems, status, loadMore } = searching ? found : base

  const showRatings = list ? list.kind === 'watched' || list.kind === 'liked' : false
  const ratingsList = useConvexQuery(
    api.ratings.getRatingsForCurrentUser,
    showRatings && list?.viewerRole === 'owner' ? {} : 'skip'
  )

  if (list === undefined) return <div className="px-6 py-8" />
  if (list === null) {
    return (
      <div className="flex h-[60vh] items-center justify-center text-text-tertiary">
        List not found
      </div>
    )
  }

  const isOwner = list.viewerRole === 'owner'
  const ratingsMap = new Map<string, number>()
  if (ratingsList) {
    for (const r of ratingsList) {
      ratingsMap.set(`${r.mediaType}:${r.tmdbId}`, r.score)
    }
  }

  return (
    <div className="flex flex-col gap-6 px-6 pt-6 pb-8">
      <ListHeader
        list={list}
        isOwner={isOwner}
        items={items}
        view={view}
        onViewChange={setView}
        search={search}
        onSearchChange={setSearch}
      />
      {tableItems.length === 0 && status !== 'LoadingFirstPage' ? (
        searching ? (
          <p className="py-12 text-center text-[13px] text-text-tertiary">
            No titles match “{debouncedSearch.trim()}”.
          </p>
        ) : (
          <EmptyState />
        )
      ) : view === 'list' ? (
        <ItemsTable
          listId={listId}
          items={tableItems}
          status={status}
          loadMore={loadMore}
          canRemove={isOwner}
          showRating={showRatings}
          ratingsMap={ratingsMap}
        />
      ) : (
        <ItemsGrid
          listId={listId}
          items={tableItems}
          status={status}
          loadMore={loadMore}
          canRemove={isOwner}
        />
      )}
    </div>
  )
}

type ListItem = Doc<'listItems'>

interface ListOwner {
  userId: Id<'users'>
  username: string
  displayName: string
  avatarUrl?: string
}

type ListWithOwner = Doc<'lists'> & {
  owner: ListOwner | null
  viewerRole: 'owner' | 'viewer'
}

function ListHeader({
  list,
  isOwner,
  items,
  view,
  onViewChange,
  search,
  onSearchChange
}: {
  list: ListWithOwner
  isOwner: boolean
  items: ListItem[]
  view: ViewMode
  onViewChange: (v: ViewMode) => void
  search: string
  onSearchChange: (v: string) => void
}): React.JSX.Element {
  const [menuOpen, setMenuOpen] = useState(false)
  const navigate = useNavigate()
  const cloneList = useMutation(api.lists.cloneList)
  const [cloning, setCloning] = useState(false)
  const posters = items
    .slice(0, 4)
    .map((i) => tmdbImage(i.posterPath, 'w342'))
    .filter(Boolean) as string[]
  const totalMin = useMoviesRuntimeSum(items) + useShowsRuntimeSum(items)

  const ownerName = list.owner?.displayName ?? list.owner?.username ?? 'Unknown'
  const ownerUsername = list.owner?.username
  const ownerAvatar = list.owner?.avatarUrl

  const ownerNode = (
    <span className="flex items-center gap-2 text-text">
      <span
        className="inline-block size-5 rounded-full bg-surface-3 bg-cover bg-center"
        style={ownerAvatar ? { backgroundImage: `url(${ownerAvatar})` } : undefined}
      />
      <span>{ownerName}</span>
    </span>
  )

  const handleClone = async (): Promise<void> => {
    if (cloning) return
    setCloning(true)
    try {
      const newListId = await cloneList({ sourceListId: list._id })
      navigate({ to: '/list/$id', params: { id: newListId }, viewTransition: false })
    } finally {
      setCloning(false)
    }
  }

  return (
    <header className="flex gap-6">
      <ListCover
        kind={list.kind}
        posters={posters}
        seed={list._id}
        size="xl"
        name={list.name}
        coverUrl={list.coverUrl}
      />
      <div className="flex min-w-0 flex-1 flex-col justify-end gap-2 pb-1">
        <h1 className="text-[28px] leading-8 font-semibold tracking-[-0.02em] text-balance text-text">
          {list.name}
        </h1>
        {list.description ? (
          <p className="text-[14px] leading-5 text-text-secondary">{list.description}</p>
        ) : null}
        <div className="flex items-center justify-between gap-4 pt-1">
          <div className="flex items-center gap-2 text-[12px] leading-4 font-medium text-text-tertiary">
            {ownerUsername ? (
              <button
                type="button"
                onClick={() => openProfile(ownerUsername)}
                className="bg-transparent outline-none"
              >
                {ownerNode}
              </button>
            ) : (
              ownerNode
            )}
            <span>·</span>
            <span>{list.itemCount} titles</span>
            {totalMin > 0 ? (
              <>
                <span>·</span>
                <span>{formatHM(totalMin)}</span>
              </>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            <ExpandingSearch
              value={search}
              onValueChange={onSearchChange}
              placeholder="Search in list"
            />
            <IconButton
              variant="soft"
              size="md"
              aria-label={view === 'list' ? 'Switch to grid view' : 'Switch to list view'}
              onClick={() => onViewChange(view === 'list' ? 'grid' : 'list')}
            >
              {view === 'list' ? (
                <GridGlyph className="size-[16px]" />
              ) : (
                <ListGlyph className="size-[16px]" />
              )}
            </IconButton>
            {!isOwner ? (
              <IconButton
                variant="soft"
                size="md"
                aria-label="Save a copy to my lists"
                onClick={() => void handleClone()}
                disabled={cloning}
              >
                <ForkCodeGlyph className="size-[16px]" />
              </IconButton>
            ) : list.kind === 'custom' ? (
              <ListContextMenu
                list={list}
                onDelete={() => navigate({ to: '/', viewTransition: false })}
                asPopover={{
                  open: menuOpen,
                  onOpenChange: setMenuOpen,
                  trigger: (
                    <IconButton variant="soft" size="md" aria-label="More options">
                      <MenuDotsIcon className="size-[16px]" />
                    </IconButton>
                  )
                }}
              />
            ) : null}
          </div>
        </div>
      </div>
    </header>
  )
}

function EmptyState(): React.JSX.Element {
  return (
    <div className="flex h-[40vh] flex-col items-center justify-center gap-3 text-text-tertiary">
      <span className="text-[14px] font-medium">No titles yet</span>
      <Link
        to="/"
        viewTransition={false}
        className="text-[13px] font-medium text-text underline-offset-4 hover:underline"
      >
        Browse titles
      </Link>
    </div>
  )
}

function useMoviesRuntimeSum(items: ListItem[]): number {
  const movieIds: number[] = []
  for (const i of items) if (i.mediaType === 'movie') movieIds.push(i.tmdbId)
  const queries = useQueries({
    queries: movieIds.map((id) => movieDetailsQuery(id))
  })
  return queries.reduce((acc, q) => acc + (q.data?.runtime ?? 0), 0)
}

function useShowsRuntimeSum(items: ListItem[]): number {
  const showIds: number[] = []
  for (const i of items) if (i.mediaType === 'tv') showIds.push(i.tmdbId)
  const queries = useQueries({
    queries: showIds.map((id) => tvDetailsQuery(id))
  })
  return queries.reduce((acc, q) => acc + (q.data ? estimateShowRuntime(q.data) : 0), 0)
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
  const h = Math.floor(min / 60)
  const m = min % 60
  if (h && m) return `${h}h ${m}m`
  if (h) return `${h}h`
  return `${m}m`
}

function ItemsGrid({
  listId,
  items,
  status,
  loadMore,
  canRemove
}: {
  listId: Id<'lists'>
  items: ListItem[]
  status: ReturnType<typeof usePaginatedQuery>['status']
  loadMore: (n: number) => void
  canRemove: boolean
}): React.JSX.Element {
  const sentinelRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const el = sentinelRef.current
    if (!el) return
    if (status !== 'CanLoadMore') return
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) loadMore(PAGE_SIZE)
      },
      { rootMargin: '600px' }
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [status, loadMore])

  return (
    <div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-4">
        {items.map((item) => (
          <GridCard key={item._id} listId={listId} item={item} canRemove={canRemove} />
        ))}
      </div>
      <div ref={sentinelRef} className="h-4" />
    </div>
  )
}

function GridCard({
  listId,
  item,
  canRemove
}: {
  listId: Id<'lists'>
  item: ListItem
  canRemove: boolean
}): React.JSX.Element {
  const navigate = useNavigate()
  const removeFromList = useMutation(api.lists.removeFromList)
  const isMovie = item.mediaType === 'movie'
  const go = (): void => {
    navigate({
      to: isMovie ? '/movie/$id' : '/tv/$id',
      params: { id: String(item.tmdbId) },
      viewTransition: false
    })
  }
  const poster = tmdbImage(item.posterPath, 'w342') ?? ''
  return (
    <MediaContextMenu
      mediaType={item.mediaType}
      tmdbId={item.tmdbId}
      title={item.title}
      posterPath={item.posterPath}
      onRemove={canRemove ? () => void removeFromList({ listId, listItemId: item._id }) : undefined}
    >
      <div className="relative">
        <button
          type="button"
          onClick={go}
          aria-label={item.title}
          className="aspect-[2/3] w-full overflow-hidden rounded-xl bg-surface-2 bg-cover bg-center outline-none"
          style={poster ? { backgroundImage: `url(${poster})` } : undefined}
        />
      </div>
    </MediaContextMenu>
  )
}

function ListGlyph({ className }: { className?: string }): React.JSX.Element {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className={className}>
      <path d="M4.20 16.79C4.86 16.79 5.40 17.33 5.40 18C5.40 18.66 4.86 19.20 4.20 19.20C3.53 19.20 3.00 18.66 3 18C3 17.33 3.53 16.79 4.20 16.79Z" />
      <path d="M20.25 17.25C20.66 17.25 21 17.58 21 18C21 18.41 20.66 18.75 20.25 18.75H8.75C8.33 18.75 8 18.41 8 18C8 17.58 8.33 17.25 8.75 17.25H20.25Z" />
      <path d="M4.20 10.79C4.86 10.79 5.40 11.33 5.40 12C5.40 12.66 4.86 13.20 4.20 13.20C3.53 13.20 3.00 12.66 3 12C3 11.33 3.53 10.79 4.20 10.79Z" />
      <path d="M20.25 11.25C20.66 11.25 21 11.58 21 12C21 12.41 20.66 12.75 20.25 12.75H8.75C8.33 12.75 8 12.41 8 12C8 11.58 8.33 11.25 8.75 11.25H20.25Z" />
      <path d="M4.20 4.79C4.86 4.79 5.40 5.33 5.40 6C5.40 6.66 4.86 7.20 4.20 7.20C3.53 7.20 3.00 6.66 3 6C3 5.33 3.53 4.79 4.20 4.79Z" />
      <path d="M20.25 5.25C20.66 5.25 21 5.58 21 6C21 6.41 20.66 6.75 20.25 6.75H8.75C8.33 6.75 8 6.41 8 6C8 5.58 8.33 5.25 8.75 5.25H20.25Z" />
    </svg>
  )
}

function GridGlyph({ className }: { className?: string }): React.JSX.Element {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className={className}>
      <path d="M6.91 3C6.38 2.99 5.93 2.99 5.57 3.02C5.19 3.06 4.83 3.12 4.50 3.29C3.98 3.56 3.56 3.98 3.29 4.50C3.12 4.83 3.06 5.19 3.02 5.57C2.99 5.93 2.99 6.38 3 6.91L3 10.25C3 10.66 3.33 11 3.75 11H10.25C10.66 11 11 10.66 11 10.25V3.75C11 3.33 10.66 3 10.25 3L6.91 3Z" />
      <path d="M19.49 3.29C19.16 3.12 18.80 3.06 18.42 3.02C18.06 2.99 17.61 2.99 17.08 3L13.75 3C13.33 3 13 3.33 13 3.75V10.25C13 10.66 13.33 11 13.75 11H20.25C20.66 11 21 10.66 21 10.25V6.91C21 6.38 21 5.93 20.97 5.57C20.93 5.19 20.87 4.83 20.70 4.50C20.43 3.98 20.01 3.56 19.49 3.29Z" />
      <path d="M3.75 13C3.33 13 3 13.33 3 13.75L3 17.08C2.99 17.61 2.99 18.06 3.02 18.42C3.06 18.80 3.12 19.16 3.29 19.49C3.56 20.01 3.98 20.43 4.50 20.70C4.83 20.87 5.19 20.93 5.57 20.97C5.93 21 6.38 21 6.91 21H10.25C10.66 21 11 20.66 11 20.25V13.75C11 13.33 10.66 13 10.25 13H3.75Z" />
      <path d="M13.75 13C13.33 13 13 13.33 13 13.75V20.25C13 20.66 13.33 21 13.75 21H17.08C17.61 21 18.06 21 18.42 20.97C18.80 20.93 19.16 20.87 19.49 20.70C20.01 20.43 20.43 20.01 20.70 19.49C20.87 19.16 20.93 18.80 20.97 18.42C21 18.06 21 17.61 21 17.08V13.75C21 13.33 20.66 13 20.25 13H13.75Z" />
    </svg>
  )
}

function ForkCodeGlyph({ className }: { className?: string }): React.JSX.Element {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className={className}>
      <path d="M6 3C4.34 3 3 4.34 3 6C3 7.39 3.95 8.57 5.25 8.90V10C5.25 11.51 6.48 12.75 8 12.75H10C10.69 12.75 11.25 13.30 11.25 14V15.09C9.95 15.42 9 16.60 9 18C9 19.65 10.34 21 12 21C13.65 21 15 19.65 15 18C15 16.60 14.04 15.42 12.75 15.09V14C12.75 13.30 13.30 12.75 14 12.75H16C17.51 12.75 18.75 11.51 18.75 10V8.90C20.04 8.57 21 7.39 21 6C21 4.34 19.65 3 18 3C16.34 3 15 4.34 15 6C15 7.39 15.95 8.57 17.25 8.90V10C17.25 10.69 16.69 11.25 16 11.25H14C13.21 11.25 12.50 11.58 12 12.11C11.49 11.58 10.78 11.25 10 11.25H8C7.30 11.25 6.75 10.69 6.75 10V8.90C8.04 8.57 9 7.39 9 6C9 4.34 7.65 3 6 3Z" />
    </svg>
  )
}
