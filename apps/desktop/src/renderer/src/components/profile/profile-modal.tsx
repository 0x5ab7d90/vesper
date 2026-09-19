import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { Dialog } from '@base-ui/react/dialog'
import { Menu } from '@base-ui/react/menu'
import { useMutation, useQuery } from 'convex/react'
import { m as motion } from 'motion/react'
import { Avatar } from '@renderer/components/ui/avatar'
import { Button } from '@renderer/components/ui/button'
import { Segmented } from '@renderer/components/ui/segmented'
import { Skeleton } from '@renderer/components/ui/skeleton'
import { SquircleSurface, squircleStyle } from '@renderer/components/ui/squircle-surface'
import { ListCover, type ListKind } from '@renderer/components/library/list-cover'
import { CloseIcon, MenuDotsIcon, PlusIcon } from '@renderer/components/icons'
import { DitherCorner } from '@renderer/components/brand/dither-corner'
import { NowPlaying, type NowPlayingData } from '@renderer/components/profile/now-playing'
import { Showcase } from '@renderer/components/profile/showcase'
import { Badges } from '@renderer/components/profile/badges'
import { StatsTab } from '@renderer/components/profile/stats-tab'
import { BANNER_PALETTES } from '@renderer/lib/banner-palettes'
import { closeProfile, useProfileModalUsername } from '@renderer/lib/profile-modal'
import { tmdbImage } from '@renderer/lib/tmdb'
import { api } from '@convex/_generated/api'
import type { Doc, Id } from '@convex/_generated/dataModel'
import type { FunctionReturnType } from 'convex/server'

const POP = { type: 'spring', stiffness: 400, damping: 26 } as const

type Tab = 'recents' | 'lists' | 'stats'

const TABS: { value: Tab; label: string }[] = [
  { value: 'recents', label: 'Recents' },
  { value: 'lists', label: 'Lists' },
  { value: 'stats', label: 'Stats' }
]

/** Mounted once in the authenticated layout; opens for whichever username the store holds. */
export function ProfileModal(): React.JSX.Element {
  const username = useProfileModalUsername()
  return (
    <Dialog.Root open={username !== null} onOpenChange={(open) => (open ? null : closeProfile())}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" />
        <Dialog.Popup
          aria-label={username ? `@${username}` : 'Profile'}
          className="fixed top-1/2 left-1/2 z-50 w-[min(1300px,96vw)] -translate-x-1/2 -translate-y-1/2 outline-none"
        >
          {username ? <ProfileBody key={username} username={username} /> : null}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

function ProfileBody({ username }: { username: string }): React.JSX.Element {
  const profile = useQuery(api.profiles.byUsername, { username })
  // Fetched here rather than inside the card so the skeleton holds until both have landed;
  // otherwise the live block arrives a beat late and shoves everything under it down.
  const now = useQuery(api.playback.nowPlayingByUsername, { username })
  const me = useQuery(api.profiles.me)
  const [tab, setTab] = useState<Tab>('recents')
  const isMe = me?.profile?.username === username
  // Same reason: the friend buttons live at the card's foot and would otherwise appear late.
  const friendState = useQuery(
    api.friendships.stateWith,
    profile && me !== undefined && !isMe ? { otherUserId: profile.userId } : 'skip'
  )
  const identityLoading =
    profile === undefined ||
    now === undefined ||
    me === undefined ||
    (profile !== null && !isMe && friendState === undefined)

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96, y: 8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={POP}
      className="relative flex h-[min(1052px,94vh)] gap-1.5 border border-white/[0.06] bg-surface-2 p-1.5 shadow-[0_24px_64px_rgba(0,0,0,0.5)]"
      style={squircleStyle('frame')}
    >
      {/* Start the field past the 320px identity card and the tab switcher beside it. */}
      <DitherCorner width="calc(100% - 580px)" fadeInTo={40} />
      <SquircleSurface variant="inset" className="relative w-[320px] shrink-0 overflow-hidden">
        {identityLoading ? (
          <IdentitySkeleton />
        ) : profile === null ? (
          <NotFound username={username} />
        ) : (
          <Identity profile={profile} now={now} isMe={isMe} friendState={friendState ?? null} />
        )}
      </SquircleSurface>

      <div className="relative flex min-w-0 flex-1 flex-col">
        <div className="flex shrink-0 items-center justify-between gap-2 pt-1 pr-1 pb-1.5 pl-1">
          <Segmented options={TABS} value={tab} onChange={setTab} />
          <button
            type="button"
            onClick={closeProfile}
            aria-label="Close"
            className="flex size-7 items-center justify-center rounded-full text-text-tertiary outline-none transition-colors duration-150 ease-out hover:bg-white/[0.08] hover:text-white active:opacity-70"
          >
            <CloseIcon className="size-3" />
          </button>
        </div>
        <SquircleSurface variant="inset" className="min-h-0 flex-1 overflow-hidden">
          <div className="scroll-hide h-full overflow-y-auto p-3">
            {!profile ? null : tab === 'recents' ? (
              <RecentsGrid username={username} />
            ) : tab === 'lists' ? (
              <ListsGrid username={username} />
            ) : (
              <StatsTab profile={profile} />
            )}
          </div>
        </SquircleSurface>
      </div>
    </motion.div>
  )
}

/* ---------- left column ---------- */

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
  return (
    <div
      aria-hidden
      className="h-[120px] w-full shrink-0"
      style={{ background: src ? `url(${src}) center / cover` : seededGradient(seed) }}
    />
  )
}

function memberSince(createdAt: number): string {
  return new Date(createdAt).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
}

type FriendState = NonNullable<FunctionReturnType<typeof api.friendships.stateWith>>

function Identity({
  profile,
  now,
  isMe,
  friendState
}: {
  profile: Doc<'profiles'>
  now: NowPlayingData
  isMe: boolean
  friendState: FriendState | null
}): React.JSX.Element {
  return (
    <div className="flex h-full flex-col">
      <Banner src={profile.bannerUrl} seed={profile.username} />
      <div className="scroll-hide -mt-12 flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 pb-4">
        {/* The ring is the card's own surface, and the disc behind the image is opaque so a
            transparent avatar never shows the banner through itself. */}
        <span className="inline-flex size-[96px] shrink-0 rounded-full bg-surface p-1.5">
          <Avatar
            size="2xl"
            className="size-full bg-surface-2"
            alt={profile.displayName}
            seed={profile.username}
            src={profile.avatarUrl}
          />
        </span>
        <div className="flex flex-col gap-0.5">
          <h2 className="truncate text-[18px] leading-6 font-medium tracking-[-0.01em] text-text">
            {profile.displayName}
          </h2>
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="truncate text-[12px] leading-4 font-medium text-text-tertiary">
              @{profile.username}
            </span>
            <Badges profile={profile} />
          </span>
        </div>
        {profile.bio ? (
          <p className="text-[13px] leading-[1.5] font-medium text-text-secondary">{profile.bio}</p>
        ) : null}
        <div className="flex flex-col gap-0.5">
          <span className="text-[11px] leading-4 font-medium text-text-muted">Member since</span>
          <span className="text-[13px] leading-4 font-medium text-text-secondary">
            {memberSince(profile.createdAt)}
          </span>
        </div>
        <NowPlaying now={now} />
        <Showcase profile={profile} isMe={isMe} />
        {!isMe && friendState ? (
          <div className="mt-auto">
            <FriendAction otherUserId={profile.userId} state={friendState} />
          </div>
        ) : null}
      </div>
    </div>
  )
}

function IdentitySkeleton(): React.JSX.Element {
  return (
    <div className="flex h-full flex-col">
      <Skeleton className="h-[120px] w-full rounded-none" />
      <div className="-mt-12 flex min-h-0 flex-1 flex-col gap-4 px-4 pb-4">
        <span className="inline-flex size-[96px] rounded-full bg-surface p-1.5">
          <Skeleton className="size-full rounded-full" />
        </span>
        <div className="flex flex-col gap-1.5">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-3 w-20" />
        </div>
        <Skeleton className="h-4 w-48" />
        <div className="flex flex-col gap-1.5">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-4 w-20" />
        </div>
        <div className="flex flex-col gap-2">
          <Skeleton className="h-3 w-14" />
          <div className="grid grid-cols-4 gap-2">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="aspect-[2/3] w-full rounded-[10px]" />
            ))}
          </div>
        </div>
        <div className="mt-auto flex items-center gap-2">
          <Skeleton className="h-9 flex-1 rounded-[14px]" />
          <Skeleton className="size-9 rounded-[14px]" />
        </div>
      </div>
    </div>
  )
}

function NotFound({ username }: { username: string }): React.JSX.Element {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-1 px-6 text-center">
      <span className="text-[16px] leading-6 font-medium text-text">@{username}</span>
      <p className="text-[13px] leading-5 font-medium text-text-tertiary">
        This profile isn&apos;t available.
      </p>
    </div>
  )
}

function FriendAction({
  otherUserId,
  state
}: {
  otherUserId: Id<'users'>
  state: FriendState
}): React.JSX.Element | null {
  const sendRequest = useMutation(api.friendships.sendRequest)
  const cancelRequest = useMutation(api.friendships.cancelRequest)
  const unfriend = useMutation(api.friendships.unfriend)
  const block = useMutation(api.friendships.block)
  const acceptRequest = useMutation(api.friendships.acceptRequest)
  const declineRequest = useMutation(api.friendships.declineRequest)

  if (state.state === 'blocked_by_them') return null

  let primary: React.ReactNode = null
  switch (state.state) {
    case 'none':
      primary = (
        <Button size="md" className="flex-1" onClick={() => sendRequest({ otherUserId })}>
          <PlusIcon className="size-3.5" />
          Add friend
        </Button>
      )
      break
    case 'pending_outgoing':
      primary = (
        <Button
          size="md"
          variant="secondary"
          className="flex-1"
          onClick={() => cancelRequest({ otherUserId })}
        >
          Requested
        </Button>
      )
      break
    case 'pending_incoming':
      if (!state.friendshipId) break
      primary = (
        <>
          <Button
            size="md"
            className="flex-1"
            onClick={() => acceptRequest({ friendshipId: state.friendshipId! })}
          >
            Accept
          </Button>
          <Button
            size="md"
            variant="secondary"
            className="flex-1"
            onClick={() => declineRequest({ friendshipId: state.friendshipId! })}
          >
            Decline
          </Button>
        </>
      )
      break
    case 'accepted':
      primary = (
        <Button size="md" variant="secondary" className="flex-1" disabled>
          Friends
        </Button>
      )
      break
    case 'blocked_by_me':
      primary = (
        <Button size="md" variant="secondary" className="flex-1" disabled>
          Blocked
        </Button>
      )
      break
  }

  return (
    <div className="flex items-center gap-2">
      {primary}
      <Menu.Root>
        <Menu.Trigger
          aria-label="More"
          className="flex size-9 shrink-0 items-center justify-center rounded-[14px] bg-white/10 text-text outline-none"
        >
          <MenuDotsIcon className="size-4" />
        </Menu.Trigger>
        <Menu.Portal>
          <Menu.Positioner side="top" align="end" sideOffset={6} className="z-[60]">
            <Menu.Popup
              className="flex w-[180px] flex-col border border-white/[0.06] bg-surface-2 p-1 outline-none"
              style={squircleStyle('frame-sm')}
            >
              {state.state === 'accepted' ? (
                <Menu.Item
                  className="rounded-lg px-3 py-2 text-[13px] font-medium text-text outline-none data-[highlighted]:bg-white/[0.06]"
                  onClick={() => unfriend({ otherUserId })}
                >
                  Unfriend
                </Menu.Item>
              ) : null}
              <Menu.Item
                className="rounded-lg px-3 py-2 text-[13px] font-medium text-text outline-none data-[highlighted]:bg-white/[0.06]"
                onClick={() => block({ otherUserId })}
              >
                Block
              </Menu.Item>
            </Menu.Popup>
          </Menu.Positioner>
        </Menu.Portal>
      </Menu.Root>
    </div>
  )
}

/* ---------- right column ---------- */

const POSTER_GRID = 'grid grid-cols-[repeat(auto-fill,minmax(104px,1fr))] gap-3'

function EmptyNote({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <div className="flex h-full min-h-[200px] items-center justify-center">
      <p className="text-[13px] leading-5 font-medium text-text-tertiary">{children}</p>
    </div>
  )
}

function RecentsGrid({ username }: { username: string }): React.JSX.Element {
  const items = useQuery(api.playback.recentlyWatchedByUsername, { username, limit: 30 })
  const navigate = useNavigate()

  if (items === undefined) {
    return (
      <div className={POSTER_GRID}>
        {Array.from({ length: 12 }, (_, i) => (
          <Skeleton key={i} className="aspect-[2/3] w-full rounded-xl" />
        ))}
      </div>
    )
  }
  if (items.length === 0) return <EmptyNote>Nothing watched yet.</EmptyNote>

  return (
    <div className={POSTER_GRID}>
      {items.map((item) => (
        <button
          key={`${item.mediaType}-${item.tmdbId}`}
          type="button"
          aria-label={item.title}
          onClick={() => {
            closeProfile()
            navigate({
              to: item.mediaType === 'movie' ? '/movie/$id' : '/tv/$id',
              params: { id: String(item.tmdbId) },
              viewTransition: false
            })
          }}
          className="aspect-[2/3] w-full overflow-hidden rounded-xl bg-surface-2 bg-cover bg-center outline-none transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-white/40"
          style={{ backgroundImage: `url(${tmdbImage(item.posterPath, 'w342') ?? ''})` }}
        />
      ))}
    </div>
  )
}

interface PublicListRow {
  _id: Id<'lists'>
  name: string
  kind: ListKind
  itemCount: number
  recentItems: Doc<'listItems'>[]
  coverUrl?: string
}

const LIST_GRID = 'grid grid-cols-[repeat(auto-fill,minmax(128px,1fr))] gap-3'

function ListsGrid({ username }: { username: string }): React.JSX.Element {
  const lists = useQuery(api.lists.publicByUsername, { username }) as PublicListRow[] | undefined
  const navigate = useNavigate()

  if (lists === undefined) {
    return (
      <div className={LIST_GRID}>
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="flex flex-col gap-2">
            <Skeleton className="aspect-square w-full rounded-[22px]" />
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-3 w-14" />
          </div>
        ))}
      </div>
    )
  }
  if (lists.length === 0) return <EmptyNote>No public lists.</EmptyNote>

  return (
    <div className={LIST_GRID}>
      {lists.map((list) => {
        const posters = list.recentItems
          .map((item) => tmdbImage(item.posterPath, 'w342'))
          .filter(Boolean) as string[]
        return (
          <button
            key={list._id}
            type="button"
            onClick={() => {
              closeProfile()
              navigate({ to: '/list/$id', params: { id: list._id }, viewTransition: false })
            }}
            className="flex flex-col gap-2 text-left outline-none"
          >
            <ListCover
              kind={list.kind}
              posters={posters}
              size="lg"
              seed={list._id}
              name={list.name}
              coverUrl={list.coverUrl}
              className="!aspect-square !size-auto !w-full"
            />
            <div className="flex w-full flex-col gap-0.5">
              <span className="truncate text-[13px] leading-4 font-medium text-text">
                {list.name}
              </span>
              <span className="text-[12px] leading-4 font-medium text-text-muted">
                {list.itemCount} titles
              </span>
            </div>
          </button>
        )
      })}
    </div>
  )
}
