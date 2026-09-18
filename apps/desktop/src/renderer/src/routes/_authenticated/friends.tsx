import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useMutation, useQuery } from 'convex/react'
import { Avatar } from '@renderer/components/ui/avatar'
import { Button } from '@renderer/components/ui/button'
import { IconButton } from '@renderer/components/ui/icon-button'
import {
  ContextMenuItem,
  ContextMenuPopover,
  ContextMenuSeparator,
  InfoGlyph,
  TrashGlyph
} from '@renderer/components/ui/context-menu'
import { MenuDotsIcon } from '@renderer/components/icons'
import { cn } from '@renderer/lib/cn'
import { openProfile } from '@renderer/lib/profile-modal'
import { api } from '@convex/_generated/api'
import type { Id } from '@convex/_generated/dataModel'

export const Route = createFileRoute('/_authenticated/friends')({
  component: FriendsPage
})

type Tab = 'all' | 'requests' | 'sent'

interface FriendRow {
  friendshipId: Id<'friendships'>
  userId: Id<'users'>
  displayName: string
  username: string
  avatarUrl?: string
  createdAt: number
}

function FriendsPage(): React.JSX.Element {
  const [tab, setTab] = useState<Tab>('all')
  const counts = useQuery(api.friendships.counts) ?? { accepted: 0, incoming: 0, outgoing: 0 }

  return (
    <div className="flex h-full flex-col px-6 pt-5 pb-8">
      <header className="flex items-center justify-between pb-1">
        <h1 className="text-[24px] leading-[1.25] font-bold tracking-[-0.02em] text-text">
          Friends
        </h1>
      </header>
      <nav className="-mx-6 flex gap-[22px] border-b border-white/[0.06] px-6 pt-3">
        <TabButton active={tab === 'all'} onClick={() => setTab('all')}>
          All
        </TabButton>
        <TabButton
          active={tab === 'requests'}
          onClick={() => setTab('requests')}
          badge={counts.incoming}
        >
          Requests
        </TabButton>
        <TabButton active={tab === 'sent'} onClick={() => setTab('sent')} badge={counts.outgoing}>
          Sent
        </TabButton>
      </nav>
      <section className="flex flex-col gap-4 pt-6">
        {tab === 'all' ? <AcceptedList /> : null}
        {tab === 'requests' ? <IncomingList /> : null}
        {tab === 'sent' ? <OutgoingList /> : null}
      </section>
    </div>
  )
}

function TabButton({
  active,
  onClick,
  badge,
  children
}: {
  active: boolean
  onClick: () => void
  badge?: number
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        '-mb-px flex items-center gap-1.5 pt-2 pb-2.5 outline-none',
        active ? 'border-b-2 border-white' : 'border-b-2 border-transparent'
      )}
    >
      <span
        className={cn(
          'text-[13px] leading-4 font-medium',
          active ? 'font-bold text-text' : 'text-text-muted'
        )}
      >
        {children}
      </span>
      {badge !== undefined && badge > 0 ? (
        <span className="rounded-md bg-[#FF5F57] px-1.5 py-px text-[10px] leading-3 font-bold text-white">
          {badge}
        </span>
      ) : null}
    </button>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }): React.JSX.Element {
  return <h2 className="text-[14px] leading-[1.2] font-bold text-text">{children}</h2>
}

function EmptyState({ text }: { text: string }): React.JSX.Element {
  return <p className="py-8 text-center text-[13px] text-text-muted">{text}</p>
}

function AcceptedList(): React.JSX.Element {
  const friends = useQuery(api.friendships.listAccepted) as FriendRow[] | undefined
  if (friends === undefined) return <EmptyState text="Loading…" />
  if (friends.length === 0) return <EmptyState text="No friends yet." />
  return (
    <>
      <SectionLabel>All friends</SectionLabel>
      <ul className="flex flex-col">
        {friends.map((f) => (
          <AcceptedRow key={f.friendshipId} friend={f} />
        ))}
      </ul>
    </>
  )
}

function IncomingList(): React.JSX.Element {
  const rows = useQuery(api.friendships.listIncoming) as FriendRow[] | undefined
  const accept = useMutation(api.friendships.acceptRequest)
  const decline = useMutation(api.friendships.declineRequest)
  if (rows === undefined) return <EmptyState text="Loading…" />
  if (rows.length === 0) return <EmptyState text="No pending requests." />
  return (
    <>
      <SectionLabel>Incoming requests</SectionLabel>
      <ul className="flex flex-col">
        {rows.map((r) => (
          <li key={r.friendshipId} className="flex items-center gap-3 rounded-lg p-2">
            <Avatar
              size="lg"
              className="size-10"
              alt={r.displayName}
              seed={r.username}
              src={r.avatarUrl}
            />
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-[13px] font-bold text-text">{r.displayName}</span>
              <span className="truncate text-[12px] font-medium text-text-muted">
                @{r.username}
              </span>
            </div>
            <div className="flex gap-2">
              <Button
                variant="primary"
                size="sm"
                onClick={() => accept({ friendshipId: r.friendshipId })}
              >
                Accept
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => decline({ friendshipId: r.friendshipId })}
              >
                Decline
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </>
  )
}

function OutgoingList(): React.JSX.Element {
  const rows = useQuery(api.friendships.listOutgoing) as FriendRow[] | undefined
  const cancel = useMutation(api.friendships.cancelRequest)
  if (rows === undefined) return <EmptyState text="Loading…" />
  if (rows.length === 0) return <EmptyState text="No outgoing requests." />
  return (
    <>
      <SectionLabel>Sent requests</SectionLabel>
      <ul className="flex flex-col">
        {rows.map((r) => (
          <li key={r.friendshipId} className="flex items-center gap-3 rounded-lg p-2">
            <Avatar
              size="lg"
              className="size-10"
              alt={r.displayName}
              seed={r.username}
              src={r.avatarUrl}
            />
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-[13px] font-bold text-text">{r.displayName}</span>
              <span className="truncate text-[12px] font-medium text-text-muted">
                @{r.username}
              </span>
            </div>
            <Button variant="secondary" size="sm" onClick={() => cancel({ otherUserId: r.userId })}>
              Cancel
            </Button>
          </li>
        ))}
      </ul>
    </>
  )
}

function AcceptedRow({ friend }: { friend: FriendRow }): React.JSX.Element {
  const unfriend = useMutation(api.friendships.unfriend)
  const block = useMutation(api.friendships.block)
  const [menuOpen, setMenuOpen] = useState(false)

  const goProfile = (): void => {
    openProfile(friend.username)
  }

  return (
    <li className="flex items-center gap-3 rounded-lg p-2">
      <button
        type="button"
        onClick={goProfile}
        className="flex min-w-0 flex-1 items-center gap-3 bg-transparent text-left outline-none"
      >
        <Avatar
          size="lg"
          className="size-10"
          alt={friend.displayName}
          seed={friend.username}
          src={friend.avatarUrl}
        />
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-[13px] font-bold text-text">{friend.displayName}</span>
          <span className="truncate text-[12px] font-medium text-text-muted">
            @{friend.username}
          </span>
        </div>
      </button>
      <ContextMenuPopover
        open={menuOpen}
        onOpenChange={setMenuOpen}
        trigger={
          <IconButton variant="ghost" size="md" aria-label="Friend actions">
            <MenuDotsIcon className="size-[16px]" />
          </IconButton>
        }
      >
        <ContextMenuItem icon={<InfoGlyph />} label="View profile" onClick={goProfile} />
        <ContextMenuSeparator />
        <ContextMenuItem
          icon={<TrashGlyph />}
          label="Unfriend"
          onClick={() => void unfriend({ otherUserId: friend.userId })}
          danger
        />
        <ContextMenuItem
          icon={<BlockGlyph />}
          label="Block"
          onClick={() => void block({ otherUserId: friend.userId })}
          danger
        />
      </ContextMenuPopover>
    </li>
  )
}

function BlockGlyph(): React.JSX.Element {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden>
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M18 13C20.34 13 22.25 14.90 22.25 17.25C22.25 19.59 20.34 21.5 18 21.5C15.65 21.5 13.75 19.59 13.75 17.25C13.75 14.90 15.65 13 18 13ZM16.65 19.64C17.05 19.87 17.51 20 18 20C19.51 20 20.75 18.76 20.75 17.25C20.75 16.76 20.62 16.30 20.39 15.90L16.65 19.64ZM18 14.5C16.48 14.5 15.25 15.73 15.25 17.25C15.25 17.73 15.37 18.19 15.59 18.58L19.33 14.84C18.94 14.62 18.48 14.5 18 14.5Z"
      />
      <path d="M8.21 12.22C9.26 13.02 10.57 13.5 12 13.5C12.67 13.5 13.31 13.39 13.92 13.19C12.88 14.23 12.25 15.66 12.25 17.25C12.25 18.68 12.77 19.99 13.64 21H6.08C4.93 20.99 4.00 20.06 4 18.91C4 15.96 5.72 13.41 8.21 12.22Z" />
      <path d="M12 2.5C14.62 2.5 16.75 4.62 16.75 7.25C16.75 9.87 14.62 12 12 12C9.37 12 7.25 9.87 7.25 7.25C7.25 4.62 9.37 2.5 12 2.5Z" />
    </svg>
  )
}
