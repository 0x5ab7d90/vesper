import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import {
  ContextMenuItem,
  ContextMenuRoot,
  ContextMenuSeparator,
  ContextMenuSubmenu,
  InfoGlyph,
  PlayGlyph,
  PlusGlyph,
  ShareGlyph
} from '@renderer/components/ui/context-menu'
import { ListsSubmenuBody } from '@renderer/components/library/media-context-menu'
import { ListFormModal } from '@renderer/components/library/list-form-modal'
import { shareUrlForMovie, shareUrlForTv, shareUrlForUser } from '@renderer/lib/share-url'
import { openProfile } from '@renderer/lib/profile-modal'

interface FriendPlayback {
  tmdbId?: number
  mediaType: 'movie' | 'tv'
  title?: string
  posterPath?: string
}

interface FriendContextMenuProps {
  username: string
  playback?: FriendPlayback | null
  children: React.ReactNode
}

export function FriendContextMenu({
  username,
  playback,
  children
}: FriendContextMenuProps): React.JSX.Element {
  const navigate = useNavigate()
  const [newListOpen, setNewListOpen] = useState(false)

  const copyProfileLink = (): void => {
    void navigator.clipboard?.writeText(shareUrlForUser(username)).catch(() => {})
  }

  const hasPlayback = !!(playback && playback.tmdbId && playback.title)

  const openTitle = (): void => {
    if (!hasPlayback || !playback?.tmdbId) return
    navigate({
      to: playback.mediaType === 'movie' ? '/movie/$id' : '/tv/$id',
      params: { id: String(playback.tmdbId) },
      viewTransition: false
    })
  }

  const copyTitleLink = (): void => {
    if (!hasPlayback || !playback?.tmdbId) return
    const url =
      playback.mediaType === 'movie'
        ? shareUrlForMovie(playback.tmdbId)
        : shareUrlForTv(playback.tmdbId)
    void navigator.clipboard?.writeText(url).catch(() => {})
  }

  return (
    <>
      <ContextMenuRoot trigger={children}>
        <ContextMenuItem
          icon={<InfoGlyph />}
          label="View profile"
          onClick={() => openProfile(username)}
        />
        <ContextMenuItem
          icon={<ShareGlyph />}
          label="Copy profile link"
          onClick={copyProfileLink}
        />
        {hasPlayback && playback?.title ? (
          <>
            <ContextMenuSeparator />
            <ContextMenuItem
              icon={<PlayGlyph />}
              label={`Open “${playback.title}”`}
              onClick={openTitle}
            />
            <ContextMenuSubmenu icon={<PlusGlyph />} label="Add to List">
              <ListsSubmenuBody
                mediaType={playback.mediaType}
                tmdbId={playback.tmdbId!}
                title={playback.title}
                posterPath={playback.posterPath}
                onNewList={() => setNewListOpen(true)}
              />
            </ContextMenuSubmenu>
            <ContextMenuItem
              icon={<ShareGlyph />}
              label="Copy link to title"
              onClick={copyTitleLink}
            />
          </>
        ) : null}
      </ContextMenuRoot>
      <ListFormModal mode="new" open={newListOpen} onOpenChange={setNewListOpen} />
    </>
  )
}
