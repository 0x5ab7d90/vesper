import { createFileRoute } from '@tanstack/react-router'
import { useQuery as useTanstackQuery } from '@tanstack/react-query'
import { useQuery as useConvexQuery, useMutation } from 'convex/react'
import { Button as BaseButton } from '@base-ui/react/button'
import { Avatar } from '@renderer/components/ui/avatar'
import { ScrollSection } from '@renderer/components/ui/scroll-section'
import { Skeleton } from '@renderer/components/ui/skeleton'
import { PosterRow, type PosterRowItem } from '@renderer/components/media/poster-row'
import { CastCard } from '@renderer/components/media/cast-card'
import { searchMoviesQuery, searchPeopleQuery, searchTvQuery } from '@renderer/lib/tmdb-queries'
import { tmdbImage } from '@renderer/lib/tmdb'
import { openProfile } from '@renderer/lib/profile-modal'
import { api } from '@convex/_generated/api'
import type { Doc } from '@convex/_generated/dataModel'

export const Route = createFileRoute('/_authenticated/search')({
  validateSearch: (search): { q?: string } => ({
    q: typeof search.q === 'string' ? search.q : undefined
  }),
  component: SearchPage
})

function SearchPage(): React.JSX.Element {
  const { q } = Route.useSearch()
  const query = (q ?? '').trim()
  const recordHistory = useMutation(api.search.recordSearchHistory)
  const movies = useTanstackQuery(searchMoviesQuery(query))
  const tv = useTanstackQuery(searchTvQuery(query))
  const people = useTanstackQuery(searchPeopleQuery(query))
  const users = useConvexQuery(api.search.searchUsers, query.length > 0 ? { query } : 'skip')

  const movieItems = (movies.data?.results ?? []).slice(0, 20)
  const tvItems = (tv.data?.results ?? []).slice(0, 20)
  const peopleItems = (people.data?.results ?? []).slice(0, 20)
  const userItems = users ?? []

  const loading = movies.isPending || tv.isPending || people.isPending || users === undefined
  const allEmpty =
    !loading &&
    movieItems.length === 0 &&
    tvItems.length === 0 &&
    peopleItems.length === 0 &&
    userItems.length === 0

  if (!query) {
    return (
      <div className="flex h-full flex-col gap-4 px-6 pt-5 pb-12">
        <h1 className="text-[24px] leading-tight font-bold tracking-[-0.02em] text-balance text-text">
          Search
        </h1>
        <p className="text-[13px] font-medium text-text-tertiary">
          Type a query in the search bar above to find movies, series, people, and users.
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-8 px-6 pt-5 pb-12">
      <header>
        <h1 className="text-[24px] leading-tight font-bold tracking-[-0.02em] text-balance text-text">
          Results for &ldquo;{query}&rdquo;
        </h1>
      </header>

      <div aria-busy={loading}>
        {loading ? (
          <SkeletonSections />
        ) : allEmpty ? (
          <EmptyResults query={query} />
        ) : (
          <div className="-mx-6 flex flex-col gap-8">
            {movieItems.length > 0 ? (
              <PosterRow
                title="Movies"
                max={20}
                items={movieItems.map(
                  (m): PosterRowItem => ({
                    id: m.id,
                    title: m.title,
                    poster: tmdbImage(m.poster_path, 'w342') ?? '',
                    posterPath: m.poster_path ?? undefined,
                    type: 'movie'
                  })
                )}
              />
            ) : null}
            {tvItems.length > 0 ? (
              <PosterRow
                title="Series"
                max={20}
                items={tvItems.map(
                  (s): PosterRowItem => ({
                    id: s.id,
                    title: s.name,
                    poster: tmdbImage(s.poster_path, 'w342') ?? '',
                    posterPath: s.poster_path ?? undefined,
                    type: 'tv'
                  })
                )}
              />
            ) : null}
            {peopleItems.length > 0 ? (
              <ScrollSection title="People">
                {peopleItems.slice(0, 20).map((p) => (
                  <CastCard
                    key={p.id}
                    personId={p.id}
                    name={p.name ?? ''}
                    character={p.known_for_department ?? ''}
                    profilePath={p.profile_path ?? null}
                    gender={p.gender}
                  />
                ))}
              </ScrollSection>
            ) : null}
            {userItems.length > 0 ? (
              <ScrollSection title="Users">
                {userItems.map((u) => (
                  <UserCard
                    key={u._id}
                    user={u}
                    onClick={() => {
                      void recordHistory({
                        kind: 'user',
                        username: u.username,
                        title: u.displayName,
                        subtitle: `@${u.username}`,
                        avatarUrl: u.avatarUrl
                      })
                      openProfile(u.username)
                    }}
                  />
                ))}
              </ScrollSection>
            ) : null}
          </div>
        )}
      </div>
    </div>
  )
}

function UserCard({
  user,
  onClick
}: {
  user: Doc<'profiles'>
  onClick: () => void
}): React.JSX.Element {
  return (
    <BaseButton
      onClick={onClick}
      className="flex w-[100px] shrink-0 flex-col items-center gap-2 bg-transparent text-center outline-none"
      aria-label={user.displayName}
    >
      <Avatar
        size="3xl"
        shape="circle"
        src={user.avatarUrl}
        alt={user.displayName}
        seed={user.username}
      />
      <div className="flex flex-col gap-0.5">
        <span className="line-clamp-1 text-[13px] leading-4 font-medium text-text">
          {user.displayName}
        </span>
        <span className="line-clamp-1 text-[12px] leading-4 font-medium text-text-tertiary">
          @{user.username}
        </span>
      </div>
    </BaseButton>
  )
}

function SkeletonSections(): React.JSX.Element {
  return (
    <div className="-mx-6 flex flex-col gap-8">
      {(['Movies', 'Series', 'People', 'Users'] as const).map((title) => (
        <ScrollSection key={title} title={title}>
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-[210px] w-[140px] shrink-0 rounded-xl" />
          ))}
        </ScrollSection>
      ))}
    </div>
  )
}

function EmptyResults({ query }: { query: string }): React.JSX.Element {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-4 py-20 text-center">
      <div className="text-[16px] font-semibold text-text">
        No matches for &ldquo;{query}&rdquo;
      </div>
      <div className="text-[13px] font-medium text-text-tertiary">
        Try a different spelling or browse trending titles.
      </div>
    </div>
  )
}
