import { createFileRoute, Link } from '@tanstack/react-router'
import { Menu } from '@base-ui/react/menu'
import { useMutation, useQuery } from 'convex/react'
import { Avatar } from '@renderer/components/ui/avatar'
import { tmdbImage } from '@renderer/lib/tmdb'
import { BANNER_PALETTES } from '@renderer/lib/banner-palettes'
import { ListCover, type ListKind } from '@renderer/components/library/list-cover'
import { PosterRow, type PosterRowItem } from '@renderer/components/media/poster-row'
import { SectionTitle } from '@renderer/components/ui/section-title'
import { cn } from '@renderer/lib/cn'
import { api } from '@convex/_generated/api'
import type { Doc, Id } from '@convex/_generated/dataModel'

export const Route = createFileRoute('/_authenticated/user/$username')({
  component: UserPage
})

function UserPage(): React.JSX.Element {
  const { username } = Route.useParams()
  const profile = useQuery(api.profiles.byUsername, { username })
  const me = useQuery(api.profiles.me)
  const publicLists = useQuery(api.lists.publicByUsername, { username })
  const recent = useQuery(api.playback.recentlyWatchedByUsername, { username, limit: 20 })

  if (profile === undefined) {
    return <div className="h-full" />
  }
  if (profile === null) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
        <h1 className="text-[24px] leading-tight font-bold text-text">@{username}</h1>
        <p className="text-[14px] font-medium text-text-secondary">User not found.</p>
      </div>
    )
  }

  const isMe = me?.profile?.username === username

  return (
    <div className="flex flex-col pb-8">
      <Banner src={profile.bannerUrl} seed={profile.username} />
      <ProfileHeader profile={profile} isMe={isMe} />
      <div className="flex flex-col gap-6 pt-6">
        <RecentlyWatched items={recent ?? []} />
        <PublicLists lists={publicLists ?? []} />
      </div>
    </div>
  )
}

function hashSeed(seed: string): number {
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return Math.abs(h)
}

function seededGradient(seed: string): string {
  const palette = BANNER_PALETTES[hashSeed(seed) % BANNER_PALETTES.length]!
  return `linear-gradient(135deg, ${palette[0]} 0%, ${palette[4]} 100%)`
}

function Banner({ src, seed }: { src: string | undefined; seed: string }): React.JSX.Element {
  const background = src ? `url(${src})` : seededGradient(seed)
  return (
    <div className="relative h-50 w-full overflow-hidden">
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{
          background,
          maskImage: 'linear-gradient(#000 65%, transparent 100%)',
          WebkitMaskImage: 'linear-gradient(#000 65%, transparent 100%)'
        }}
      />
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'linear-gradient(180deg, transparent 0%, rgba(18,18,18,0.4) 60%, var(--color-surface) 100%)'
        }}
      />
    </div>
  )
}

function ProfileHeader({
  profile,
  isMe
}: {
  profile: Doc<'profiles'>
  isMe: boolean
}): React.JSX.Element {
  return (
    <div className="relative -mt-14 flex items-end gap-6 px-6">
      <Avatar
        size="lg"
        className="size-32 shrink-0 rounded-full border-[6px] border-surface"
        alt={profile.displayName}
        seed={profile.username}
        src={profile.avatarUrl}
      />
      <div className="flex min-w-0 flex-1 flex-col gap-1 pb-2">
        <div className="flex items-baseline gap-2">
          <h1 className="text-[24px] leading-[1.25] font-bold tracking-[-0.02em] text-text">
            {profile.displayName}
          </h1>
          <span className="text-[13px] font-medium text-text-muted">@{profile.username}</span>
        </div>
        {profile.bio ? (
          <p className="text-[13px] leading-[1.5] font-medium text-text-secondary">{profile.bio}</p>
        ) : null}
      </div>
      {!isMe ? <FriendAction otherUserId={profile.userId} /> : null}
    </div>
  )
}

function PillButton({
  variant,
  onClick,
  disabled,
  children
}: {
  variant: 'primary' | 'secondary'
  onClick?: () => void
  disabled?: boolean
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'flex items-center gap-2 rounded-[14px] px-5 py-2.5 text-[13px] font-bold outline-none disabled:opacity-40',
        variant === 'primary' ? 'bg-white text-black' : 'bg-white/10 text-text'
      )}
    >
      {children}
    </button>
  )
}

function PlusIcon(): React.JSX.Element {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
      <path
        d="M11.25 18.75V12.75H5.25C4.83 12.75 4.5 12.41 4.5 12C4.5 11.58 4.83 11.25 5.25 11.25H11.25V5.25C11.25 4.83 11.58 4.5 12 4.5C12.41 4.5 12.75 4.83 12.75 5.25V11.25H18.75C19.16 11.25 19.5 11.58 19.5 12C19.5 12.41 19.16 12.75 18.75 12.75H12.75V18.75C12.75 19.16 12.41 19.5 12 19.5C11.58 19.5 11.25 19.16 11.25 18.75Z"
        fill="currentColor"
      />
    </svg>
  )
}

function FriendAction({ otherUserId }: { otherUserId: Id<'users'> }): React.JSX.Element | null {
  const state = useQuery(api.friendships.stateWith, { otherUserId })
  const sendRequest = useMutation(api.friendships.sendRequest)
  const cancelRequest = useMutation(api.friendships.cancelRequest)
  const unfriend = useMutation(api.friendships.unfriend)
  const block = useMutation(api.friendships.block)
  const acceptRequest = useMutation(api.friendships.acceptRequest)
  const declineRequest = useMutation(api.friendships.declineRequest)

  if (state === undefined) return null

  const kebab = (
    <Menu.Root>
      <Menu.Trigger
        aria-label="Friend actions"
        className="flex size-9 shrink-0 items-center justify-center rounded-[14px] bg-white/10 outline-none"
      >
        <svg viewBox="0 0 24 24" width="14" height="14">
          <circle cx="5" cy="12" r="1.5" fill="currentColor" />
          <circle cx="12" cy="12" r="1.5" fill="currentColor" />
          <circle cx="19" cy="12" r="1.5" fill="currentColor" />
        </svg>
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner side="bottom" align="end" sideOffset={4}>
          <Menu.Popup className="flex w-[180px] flex-col rounded-lg bg-surface-2 p-1 outline-none">
            {state.state === 'accepted' ? (
              <Menu.Item
                className="rounded-md px-3 py-2 text-[13px] font-medium text-text outline-none"
                onClick={() => unfriend({ otherUserId })}
              >
                Unfriend
              </Menu.Item>
            ) : null}
            <Menu.Item
              className="rounded-md px-3 py-2 text-[13px] font-medium text-text outline-none"
              onClick={() => block({ otherUserId })}
            >
              Block
            </Menu.Item>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  )

  let primary: React.ReactNode = null
  switch (state.state) {
    case 'none':
      primary = (
        <PillButton variant="primary" onClick={() => sendRequest({ otherUserId })}>
          <PlusIcon />
          Add Friend
        </PillButton>
      )
      break
    case 'pending_outgoing':
      primary = (
        <PillButton variant="secondary" onClick={() => cancelRequest({ otherUserId })}>
          Requested
        </PillButton>
      )
      break
    case 'pending_incoming':
      if (!state.friendshipId) break
      primary = (
        <div className="flex gap-2">
          <PillButton
            variant="primary"
            onClick={() => acceptRequest({ friendshipId: state.friendshipId! })}
          >
            Accept
          </PillButton>
          <PillButton
            variant="secondary"
            onClick={() => declineRequest({ friendshipId: state.friendshipId! })}
          >
            Decline
          </PillButton>
        </div>
      )
      break
    case 'accepted':
      primary = (
        <PillButton variant="secondary" disabled>
          Friends
        </PillButton>
      )
      break
    case 'blocked_by_me':
      primary = (
        <PillButton variant="secondary" disabled>
          Blocked
        </PillButton>
      )
      break
    case 'blocked_by_them':
      return null
  }

  return (
    <div className="flex shrink-0 items-center gap-2 pb-2">
      {primary}
      {kebab}
    </div>
  )
}

interface RecentItem {
  tmdbId: number
  mediaType: 'movie' | 'tv'
  title: string
  posterPath?: string
  updatedAt: number
}

function RecentlyWatched({ items }: { items: RecentItem[] }): React.JSX.Element | null {
  if (items.length === 0) return null
  const rowItems: PosterRowItem[] = items.map((item) => ({
    id: item.tmdbId,
    title: item.title,
    poster: tmdbImage(item.posterPath, 'w342') ?? '',
    posterPath: item.posterPath,
    type: item.mediaType
  }))
  return <PosterRow title="Recently Watched" items={rowItems} max={20} />
}

interface PublicListRow {
  _id: Id<'lists'>
  name: string
  kind: ListKind
  itemCount: number
  recentItems: Doc<'listItems'>[]
  coverUrl?: string
}

function PublicLists({ lists }: { lists: PublicListRow[] }): React.JSX.Element | null {
  if (lists.length === 0) return null
  return (
    <section className="flex flex-col gap-3 px-6">
      <SectionTitle>Public Lists</SectionTitle>
      <div className="flex max-w-[800px] gap-3 overflow-hidden">
        {lists.slice(0, 4).map((list) => (
          <PublicListCard key={list._id} list={list} />
        ))}
      </div>
    </section>
  )
}

function PublicListCard({ list }: { list: PublicListRow }): React.JSX.Element {
  const posters = list.recentItems
    .map((item) => tmdbImage(item.posterPath, 'w342'))
    .filter(Boolean) as string[]
  return (
    <Link
      to="/list/$id"
      params={{ id: list._id }}
      viewTransition={false}
      className="flex h-[206px] w-[160px] shrink-0 flex-col gap-2 outline-none"
    >
      <ListCover
        kind={list.kind}
        posters={posters}
        size="xl"
        seed={list._id}
        name={list.name}
        coverUrl={list.coverUrl}
        className="!h-[160px] !w-[160px] !rounded-lg"
      />
      <div className="flex flex-col gap-0.5">
        <div className="truncate text-[14px] font-bold text-text">{list.name}</div>
        <div className="text-[12px] font-medium text-text-muted">{list.itemCount} titles</div>
      </div>
    </Link>
  )
}
