import { getAuthUserId } from '@convex-dev/auth/server'
import { paginationOptsValidator } from 'convex/server'
import { v } from 'convex/values'
import type { Doc, Id } from './_generated/dataModel'
import {
  internalAction,
  internalMutation,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx
} from './_generated/server'
import { internal } from './_generated/api'
import { mediaTypeValidator } from './schema'

const NAME_MAX = 40
const DESC_MAX = 200
const LIST_COVER_PREFIX = 'list-covers/'

function publicUrl(key: string): string {
  const base = process.env.R2_PUBLIC_URL
  if (!base) throw new Error('R2_PUBLIC_URL not configured')
  return `${base}/${key}`
}

function assertListCoverKey(key: string, userId: string): void {
  const expected = `${LIST_COVER_PREFIX}${userId}/`
  if (!key.startsWith(expected)) throw new Error('Key not owned by user')
}
async function requireUserId(ctx: QueryCtx | MutationCtx): Promise<Id<'users'>> {
  const userId = await getAuthUserId(ctx)
  if (userId === null) throw new Error('Not authenticated')
  return userId
}

export type ViewerRole = 'owner' | 'viewer' | 'none'

function getViewerRole(list: Doc<'lists'>, userId: Id<'users'> | null): ViewerRole {
  if (userId && list.userId === userId) return 'owner'
  if (list.visibility === 'public') return 'viewer'
  return 'none'
}

async function requireOwnedList(ctx: MutationCtx, listId: Id<'lists'>): Promise<Doc<'lists'>> {
  const userId = await requireUserId(ctx)
  const list = await ctx.db.get(listId)
  if (!list) throw new Error('List not found')
  if (list.userId !== userId) throw new Error('Not authorized')
  return list
}

export const myLists = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx)
    if (userId === null) return []
    const all = await ctx.db
      .query('lists')
      .withIndex('by_userId', (q) => q.eq('userId', userId))
      .collect()

    const pins = await ctx.db
      .query('listPins')
      .withIndex('by_userId', (q) => q.eq('userId', userId))
      .collect()
    const pinByListId = new Map(pins.map((p) => [p.listId, p.pinnedAt] as const))

    const orderRows = await ctx.db
      .query('listOrder')
      .withIndex('by_userId', (q) => q.eq('userId', userId))
      .collect()
    const rankByListId = new Map(orderRows.map((r) => [r.listId, r.rank] as const))

    const enriched = await Promise.all(
      all.map(async (list) => {
        const items = await ctx.db
          .query('listItems')
          .withIndex('by_listId_and_addedAt', (q) => q.eq('listId', list._id))
          .order('desc')
          .take(4)
        const pinnedAt = pinByListId.get(list._id)
        return {
          ...list,
          recentItems: items,
          pinned: pinnedAt !== undefined,
          pinnedAt,
          rank: rankByListId.get(list._id)
        }
      })
    )

    const kindRank = (k: 'liked' | 'watched' | 'custom'): number =>
      k === 'liked' ? 0 : k === 'watched' ? 1 : 2
    enriched.sort((a, b) => {
      const ra = kindRank(a.kind)
      const rb = kindRank(b.kind)
      if (ra !== rb) return ra - rb
      if (a.kind === 'custom' && b.kind === 'custom') {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
        if (a.pinned && b.pinned) return (b.pinnedAt ?? 0) - (a.pinnedAt ?? 0)
        if (a.rank !== undefined && b.rank !== undefined) return a.rank - b.rank
        if (a.rank !== undefined) return -1
        if (b.rank !== undefined) return 1
      }
      const aT = a.lastItemAddedAt ?? a.createdAt
      const bT = b.lastItemAddedAt ?? b.createdAt
      return bT - aT
    })

    return enriched
  }
})

export const pinList = mutation({
  args: { listId: v.id('lists') },
  handler: async (ctx, { listId }) => {
    const userId = await getAuthUserId(ctx)
    if (userId === null) throw new Error('Not authenticated')
    const list = await ctx.db.get(listId)
    if (!list) throw new Error('List not found')
    if (list.kind !== 'custom') throw new Error('Only custom lists can be pinned')
    if (list.userId !== userId) throw new Error('Not authorized')
    const existing = await ctx.db
      .query('listPins')
      .withIndex('by_userId_and_listId', (q) => q.eq('userId', userId).eq('listId', listId))
      .first()
    if (existing) {
      await ctx.db.patch(existing._id, { pinnedAt: Date.now() })
      return
    }
    await ctx.db.insert('listPins', { userId, listId, pinnedAt: Date.now() })
  }
})

export const unpinList = mutation({
  args: { listId: v.id('lists') },
  handler: async (ctx, { listId }) => {
    const userId = await getAuthUserId(ctx)
    if (userId === null) throw new Error('Not authenticated')
    const existing = await ctx.db
      .query('listPins')
      .withIndex('by_userId_and_listId', (q) => q.eq('userId', userId).eq('listId', listId))
      .first()
    if (existing) await ctx.db.delete(existing._id)
  }
})

export const reorderList = mutation({
  args: {
    listId: v.id('lists'),
    prevListId: v.optional(v.id('lists')),
    nextListId: v.optional(v.id('lists'))
  },
  handler: async (ctx, { listId, prevListId, nextListId }) => {
    const userId = await requireUserId(ctx)
    const list = await ctx.db.get(listId)
    if (!list) throw new Error('List not found')
    if (list.kind !== 'custom') throw new Error('Only custom lists can be reordered')
    if (list.userId !== userId) throw new Error('Not authorized')

    const orderRows = await ctx.db
      .query('listOrder')
      .withIndex('by_userId', (q) => q.eq('userId', userId))
      .collect()
    const orderRowByListId = new Map(orderRows.map((r) => [r.listId, r] as const))

    const owned = await ctx.db
      .query('lists')
      .withIndex('by_userId', (q) => q.eq('userId', userId))
      .collect()
    const customLists = owned.filter((l) => l.kind === 'custom')

    const pins = await ctx.db
      .query('listPins')
      .withIndex('by_userId', (q) => q.eq('userId', userId))
      .collect()
    const pinByListId = new Map(pins.map((p) => [p.listId, p.pinnedAt] as const))

    const rankByListId = new Map<Id<'lists'>, number>()
    for (const row of orderRows) rankByListId.set(row.listId, row.rank)

    const needsSeed = customLists.some((l) => !rankByListId.has(l._id))
    if (needsSeed) {
      const seeded = [...customLists].sort((a, b) => {
        const aPin = pinByListId.get(a._id)
        const bPin = pinByListId.get(b._id)
        if ((aPin !== undefined) !== (bPin !== undefined)) return aPin !== undefined ? -1 : 1
        if (aPin !== undefined && bPin !== undefined) return bPin - aPin
        const aRank = rankByListId.get(a._id)
        const bRank = rankByListId.get(b._id)
        if (aRank !== undefined && bRank !== undefined) return aRank - bRank
        if (aRank !== undefined) return -1
        if (bRank !== undefined) return 1
        const aT = a.lastItemAddedAt ?? a.createdAt
        const bT = b.lastItemAddedAt ?? b.createdAt
        return bT - aT
      })
      let r = 1
      for (const l of seeded) {
        const existing = orderRowByListId.get(l._id)
        if (existing) {
          await ctx.db.patch(existing._id, { rank: r })
        } else {
          await ctx.db.insert('listOrder', { userId, listId: l._id, rank: r })
        }
        rankByListId.set(l._id, r)
        r++
      }
      const refreshed = await ctx.db
        .query('listOrder')
        .withIndex('by_userId', (q) => q.eq('userId', userId))
        .collect()
      orderRowByListId.clear()
      for (const row of refreshed) orderRowByListId.set(row.listId, row)
    }

    const prevRank = prevListId ? rankByListId.get(prevListId) : undefined
    const nextRank = nextListId ? rankByListId.get(nextListId) : undefined

    let newRank: number
    if (prevRank !== undefined && nextRank !== undefined) {
      newRank = (prevRank + nextRank) / 2
    } else if (prevRank !== undefined) {
      newRank = prevRank + 1
    } else if (nextRank !== undefined) {
      newRank = nextRank - 1
    } else {
      newRank = 1
    }

    const existing = orderRowByListId.get(listId)
    if (existing) {
      await ctx.db.patch(existing._id, { rank: newRank })
    } else {
      await ctx.db.insert('listOrder', { userId, listId, rank: newRank })
    }
  }
})

export const publicByUsername = query({
  args: { username: v.string() },
  handler: async (ctx, { username }) => {
    const profile = await ctx.db
      .query('profiles')
      .withIndex('by_username', (q) => q.eq('username', username))
      .unique()
    if (!profile) return []
    const lists = await ctx.db
      .query('lists')
      .withIndex('by_userId', (q) => q.eq('userId', profile.userId))
      .collect()
    const publicLists = lists.filter((l) => l.visibility === 'public')
    const enriched = await Promise.all(
      publicLists.map(async (list) => {
        const items = await ctx.db
          .query('listItems')
          .withIndex('by_listId_and_addedAt', (q) => q.eq('listId', list._id))
          .order('desc')
          .take(4)
        return { ...list, recentItems: items }
      })
    )
    enriched.sort((a, b) => {
      const aT = a.lastItemAddedAt ?? a.createdAt
      const bT = b.lastItemAddedAt ?? b.createdAt
      return bT - aT
    })
    return enriched
  }
})

export const listById = query({
  args: { listId: v.id('lists') },
  handler: async (ctx, { listId }) => {
    const userId = await getAuthUserId(ctx)
    const list = await ctx.db.get(listId)
    if (!list) return null
    const viewerRole = getViewerRole(list, userId)
    if (viewerRole === 'none') return null
    const ownerProfile = await ctx.db
      .query('profiles')
      .withIndex('by_userId', (q) => q.eq('userId', list.userId))
      .unique()
    const owner = ownerProfile
      ? {
          userId: ownerProfile.userId,
          username: ownerProfile.username,
          displayName: ownerProfile.displayName,
          avatarUrl: ownerProfile.avatarUrl
        }
      : null
    return {
      ...list,
      joinCode: undefined,
      owner,
      viewerRole
    }
  }
})

export const listItems = query({
  args: { listId: v.id('lists'), paginationOpts: paginationOptsValidator },
  handler: async (ctx, { listId, paginationOpts }) => {
    const userId = await getAuthUserId(ctx)
    const list = await ctx.db.get(listId)
    if (!list) return { page: [], isDone: true, continueCursor: '' }
    const viewerRole = getViewerRole(list, userId)
    if (viewerRole === 'none') return { page: [], isDone: true, continueCursor: '' }
    return await ctx.db
      .query('listItems')
      .withIndex('by_listId_and_addedAt', (q) => q.eq('listId', listId))
      .order('desc')
      .paginate(paginationOpts)
  }
})

export const searchListItems = query({
  args: { listId: v.id('lists'), query: v.string(), paginationOpts: paginationOptsValidator },
  handler: async (ctx, { listId, query, paginationOpts }) => {
    const empty = { page: [], isDone: true, continueCursor: '' }
    const term = query.trim()
    if (!term) return empty
    const userId = await getAuthUserId(ctx)
    const list = await ctx.db.get(listId)
    if (!list) return empty
    const viewerRole = getViewerRole(list, userId)
    if (viewerRole === 'none') return empty
    return await ctx.db
      .query('listItems')
      .withSearchIndex('search_title', (q) => q.search('title', term).eq('listId', listId))
      .paginate(paginationOpts)
  }
})

export const membership = query({
  args: { mediaType: mediaTypeValidator, tmdbId: v.number() },
  handler: async (ctx, { mediaType, tmdbId }) => {
    const userId = await getAuthUserId(ctx)
    if (userId === null) return []
    const hits = await ctx.db
      .query('listItems')
      .withIndex('by_user_and_media', (q) =>
        q.eq('addedBy', userId).eq('mediaType', mediaType).eq('tmdbId', tmdbId)
      )
      .collect()
    return hits.map((h) => h.listId)
  }
})

export const createList = mutation({
  args: {
    name: v.string(),
    description: v.optional(v.string()),
    visibility: v.union(v.literal('private'), v.literal('public')),
    coverKey: v.optional(v.string())
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx)
    const name = args.name.trim()
    if (name.length === 0) throw new Error('Name is required')
    if (name.length > NAME_MAX) throw new Error(`Name is too long (${name.length}/${NAME_MAX} max)`)
    const description = args.description?.trim()
    if (description && description.length > DESC_MAX) {
      throw new Error(`Description is too long (${description.length}/${DESC_MAX} max)`)
    }
    if (args.coverKey) {
      assertListCoverKey(args.coverKey, userId)
    }
    return await ctx.db.insert('lists', {
      userId,
      name,
      description: description || undefined,
      kind: 'custom',
      visibility: args.visibility,
      coverUrl: args.coverKey ? publicUrl(args.coverKey) : undefined,
      coverKey: args.coverKey,
      locked: false,
      itemCount: 0,
      createdAt: Date.now()
    })
  }
})

export const updateList = mutation({
  args: {
    listId: v.id('lists'),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    visibility: v.optional(v.union(v.literal('private'), v.literal('public')))
  },
  handler: async (ctx, { listId, ...patch }) => {
    const list = await requireOwnedList(ctx, listId)
    const updates: Partial<Doc<'lists'>> = {}
    if (patch.name !== undefined) {
      if (list.locked) throw new Error('Cannot rename system list')
      const name = patch.name.trim()
      if (name.length === 0) throw new Error('Name is required')
      if (name.length > NAME_MAX) {
        throw new Error(`Name is too long (${name.length}/${NAME_MAX} max)`)
      }
      updates.name = name
    }
    if (patch.description !== undefined) {
      const desc = patch.description.trim()
      if (desc.length > DESC_MAX) {
        throw new Error(`Description is too long (${desc.length}/${DESC_MAX} max)`)
      }
      updates.description = desc || undefined
    }
    if (patch.visibility !== undefined) updates.visibility = patch.visibility
    await ctx.db.patch(listId, updates)
  }
})

export const setListCover = mutation({
  args: { listId: v.id('lists'), key: v.string() },
  handler: async (ctx, { listId, key }) => {
    const list = await requireOwnedList(ctx, listId)
    assertListCoverKey(key, list.userId)
    const oldKey = list.coverKey
    await ctx.db.patch(listId, { coverUrl: publicUrl(key), coverKey: key })
    if (oldKey && oldKey !== key) {
      await ctx.scheduler.runAfter(0, internal.uploads.deleteObject, { key: oldKey })
    }
  }
})

export const removeListCover = mutation({
  args: { listId: v.id('lists') },
  handler: async (ctx, { listId }) => {
    const list = await requireOwnedList(ctx, listId)
    const oldKey = list.coverKey
    await ctx.db.patch(listId, { coverUrl: undefined, coverKey: undefined })
    if (oldKey) {
      await ctx.scheduler.runAfter(0, internal.uploads.deleteObject, { key: oldKey })
    }
  }
})

export const deleteList = mutation({
  args: { listId: v.id('lists') },
  handler: async (ctx, { listId }) => {
    const list = await requireOwnedList(ctx, listId)
    if (list.locked) throw new Error('Cannot delete system list')
    const items = await ctx.db
      .query('listItems')
      .withIndex('by_listId', (q) => q.eq('listId', listId))
      .collect()
    await Promise.all(items.map((i) => ctx.db.delete(i._id)))
    if (list.coverKey) {
      await ctx.scheduler.runAfter(0, internal.uploads.deleteObject, { key: list.coverKey })
    }
    await ctx.db.delete(listId)
  }
})

export const setMembership = mutation({
  args: {
    mediaType: mediaTypeValidator,
    tmdbId: v.number(),
    title: v.string(),
    posterPath: v.optional(v.string()),
    listIds: v.array(v.id('lists'))
  },
  handler: async (ctx, { mediaType, tmdbId, title, posterPath, listIds }) => {
    const userId = await requireUserId(ctx)

    for (const listId of listIds) {
      const list = await ctx.db.get(listId)
      if (!list || list.userId !== userId) throw new Error('Not authorized')
    }

    const existing = await ctx.db
      .query('listItems')
      .withIndex('by_user_and_media', (q) =>
        q.eq('addedBy', userId).eq('mediaType', mediaType).eq('tmdbId', tmdbId)
      )
      .collect()

    const existingByList = new Map(existing.map((i) => [i.listId, i] as const))
    const target = new Set(listIds)
    const now = Date.now()

    for (const item of existing) {
      if (!target.has(item.listId)) {
        await ctx.db.delete(item._id)
        const list = await ctx.db.get(item.listId)
        if (list) {
          await ctx.db.patch(item.listId, { itemCount: Math.max(0, list.itemCount - 1) })
          if (list.kind === 'liked') {
            await ctx.scheduler.runAfter(0, internal.trakt.pushFavorite, {
              userId,
              mediaType,
              tmdbId,
              remove: true
            })
          }
        }
      }
    }

    for (const listId of listIds) {
      if (existingByList.has(listId)) continue
      const dupe = await ctx.db
        .query('listItems')
        .withIndex('by_listId_and_media', (q) =>
          q.eq('listId', listId).eq('mediaType', mediaType).eq('tmdbId', tmdbId)
        )
        .unique()
      if (dupe) continue
      const itemId = await ctx.db.insert('listItems', {
        listId,
        mediaType,
        tmdbId,
        addedBy: userId,
        addedAt: now,
        title,
        posterPath
      })
      if (!posterPath) {
        await ctx.scheduler.runAfter(0, internal.lists.backfillItemPoster, {
          listItemId: itemId,
          mediaType,
          tmdbId
        })
      }
      const list = await ctx.db.get(listId)
      if (list) {
        await ctx.db.patch(listId, {
          itemCount: list.itemCount + 1,
          lastItemAddedAt: now
        })
        if (list.kind === 'liked') {
          await ctx.scheduler.runAfter(0, internal.trakt.pushFavorite, {
            userId,
            mediaType,
            tmdbId
          })
        }
      }
    }
  }
})

export const cloneList = mutation({
  args: { sourceListId: v.id('lists') },
  handler: async (ctx, { sourceListId }) => {
    const userId = await requireUserId(ctx)
    const source = await ctx.db.get(sourceListId)
    if (!source) throw new Error('List not found')
    if (source.visibility !== 'public' && source.userId !== userId) {
      throw new Error('Not authorized')
    }
    const sourceItems = await ctx.db
      .query('listItems')
      .withIndex('by_listId_and_addedAt', (q) => q.eq('listId', sourceListId))
      .order('desc')
      .collect()
    const now = Date.now()
    const cloneName = `${source.name} (copy)`.slice(0, NAME_MAX)
    const newListId = await ctx.db.insert('lists', {
      userId,
      name: cloneName,
      description: source.description,
      kind: 'custom',
      visibility: 'private',
      locked: false,
      itemCount: sourceItems.length,
      createdAt: now,
      lastItemAddedAt: sourceItems.length > 0 ? now : undefined
    })
    for (const item of sourceItems) {
      await ctx.db.insert('listItems', {
        listId: newListId,
        mediaType: item.mediaType,
        tmdbId: item.tmdbId,
        addedBy: userId,
        addedAt: now,
        title: item.title,
        posterPath: item.posterPath
      })
    }
    return newListId
  }
})

export const removeFromList = mutation({
  args: { listId: v.id('lists'), listItemId: v.id('listItems') },
  handler: async (ctx, { listId, listItemId }) => {
    const list = await requireOwnedList(ctx, listId)
    const item = await ctx.db.get(listItemId)
    if (!item || item.listId !== listId) throw new Error('Item not in list')
    await ctx.db.delete(listItemId)
    await ctx.db.patch(listId, { itemCount: Math.max(0, list.itemCount - 1) })
    if (list.kind === 'liked') {
      await ctx.scheduler.runAfter(0, internal.trakt.pushFavorite, {
        userId: list.userId,
        mediaType: item.mediaType,
        tmdbId: item.tmdbId,
        remove: true
      })
    }
  }
})

async function getOrCreateWatchedList(
  ctx: MutationCtx,
  userId: Id<'users'>
): Promise<Doc<'lists'>> {
  const existing = await ctx.db
    .query('lists')
    .withIndex('by_userId_and_kind', (q) => q.eq('userId', userId).eq('kind', 'watched'))
    .unique()
  if (existing) return existing
  const id = await ctx.db.insert('lists', {
    userId,
    name: 'Watched',
    kind: 'watched',
    visibility: 'private',
    locked: true,
    itemCount: 0,
    createdAt: Date.now()
  })
  const created = await ctx.db.get(id)
  if (!created) throw new Error('Failed to create Watched list')
  return created
}

/** Puts a title in the user's Watched list, creating the list on first use and pushing the
 *  watch to Trakt. A title already in the list is left alone. Shared with playback, which
 *  calls this once progress crosses the watched threshold. */
export async function addToWatchedList(
  ctx: MutationCtx,
  userId: Id<'users'>,
  item: {
    mediaType: Doc<'listItems'>['mediaType']
    tmdbId: number
    title: string
    posterPath?: string
  }
): Promise<void> {
  const { mediaType, tmdbId, title, posterPath } = item
  const list = await getOrCreateWatchedList(ctx, userId)
  const dupe = await ctx.db
    .query('listItems')
    .withIndex('by_listId_and_media', (q) =>
      q.eq('listId', list._id).eq('mediaType', mediaType).eq('tmdbId', tmdbId)
    )
    .unique()
  if (dupe) return
  const now = Date.now()
  const itemId = await ctx.db.insert('listItems', {
    listId: list._id,
    mediaType,
    tmdbId,
    addedBy: userId,
    addedAt: now,
    title,
    posterPath
  })
  await ctx.db.patch(list._id, {
    itemCount: list.itemCount + 1,
    lastItemAddedAt: now
  })
  if (!posterPath) {
    await ctx.scheduler.runAfter(0, internal.lists.backfillItemPoster, {
      listItemId: itemId,
      mediaType,
      tmdbId
    })
  }
  await ctx.scheduler.runAfter(0, internal.trakt.pushWatched, { userId, mediaType, tmdbId })
}

export const markWatched = mutation({
  args: {
    mediaType: mediaTypeValidator,
    tmdbId: v.number(),
    title: v.string(),
    posterPath: v.optional(v.string())
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx)
    await addToWatchedList(ctx, userId, args)
  }
})

export const unmarkWatched = mutation({
  args: { mediaType: mediaTypeValidator, tmdbId: v.number() },
  handler: async (ctx, { mediaType, tmdbId }) => {
    const userId = await requireUserId(ctx)
    const list = await ctx.db
      .query('lists')
      .withIndex('by_userId_and_kind', (q) => q.eq('userId', userId).eq('kind', 'watched'))
      .unique()
    if (!list) return
    const item = await ctx.db
      .query('listItems')
      .withIndex('by_listId_and_media', (q) =>
        q.eq('listId', list._id).eq('mediaType', mediaType).eq('tmdbId', tmdbId)
      )
      .unique()
    if (!item) return
    await ctx.db.delete(item._id)
    await ctx.db.patch(list._id, { itemCount: Math.max(0, list.itemCount - 1) })
  }
})

export const addToList = mutation({
  args: {
    listId: v.id('lists'),
    mediaType: mediaTypeValidator,
    tmdbId: v.number(),
    title: v.string(),
    posterPath: v.optional(v.string())
  },
  handler: async (ctx, { listId, mediaType, tmdbId, title, posterPath }) => {
    const list = await requireOwnedList(ctx, listId)
    const userId = list.userId
    const dupe = await ctx.db
      .query('listItems')
      .withIndex('by_listId_and_media', (q) =>
        q.eq('listId', listId).eq('mediaType', mediaType).eq('tmdbId', tmdbId)
      )
      .unique()
    if (dupe) return
    const now = Date.now()
    const itemId = await ctx.db.insert('listItems', {
      listId,
      mediaType,
      tmdbId,
      addedBy: userId,
      addedAt: now,
      title,
      posterPath
    })
    await ctx.db.patch(listId, {
      itemCount: list.itemCount + 1,
      lastItemAddedAt: now
    })
    if (!posterPath) {
      await ctx.scheduler.runAfter(0, internal.lists.backfillItemPoster, {
        listItemId: itemId,
        mediaType,
        tmdbId
      })
    }
    if (list.kind === 'liked') {
      await ctx.scheduler.runAfter(0, internal.trakt.pushFavorite, { userId, mediaType, tmdbId })
    }
  }
})

export const isWatched = query({
  args: { mediaType: mediaTypeValidator, tmdbId: v.number() },
  handler: async (ctx, { mediaType, tmdbId }) => {
    const userId = await getAuthUserId(ctx)
    if (userId === null) return false
    const list = await ctx.db
      .query('lists')
      .withIndex('by_userId_and_kind', (q) => q.eq('userId', userId).eq('kind', 'watched'))
      .unique()
    if (!list) return false
    const item = await ctx.db
      .query('listItems')
      .withIndex('by_listId_and_media', (q) =>
        q.eq('listId', list._id).eq('mediaType', mediaType).eq('tmdbId', tmdbId)
      )
      .unique()
    return item !== null
  }
})

export const patchItemPoster = internalMutation({
  args: { listItemId: v.id('listItems'), posterPath: v.string() },
  handler: async (ctx, { listItemId, posterPath }) => {
    const item = await ctx.db.get(listItemId)
    if (item && !item.posterPath) await ctx.db.patch(listItemId, { posterPath })
  }
})

// Look up a missing poster on TMDB and patch it onto the list item. Scheduled
// whenever an item is added without one (some call sites lack the poster).
export const backfillItemPoster = internalAction({
  args: { listItemId: v.id('listItems'), mediaType: mediaTypeValidator, tmdbId: v.number() },
  handler: async (ctx, { listItemId, mediaType, tmdbId }) => {
    const key = (process.env.TMDB_API_KEYS ?? process.env.TMDB_API_KEY ?? '').split(',')[0]?.trim()
    if (!key) return
    const res = await fetch(
      `https://api.themoviedb.org/3/${mediaType}/${tmdbId}?api_key=${key}`
    ).catch(() => null)
    if (!res?.ok) return
    const json = (await res.json()) as { poster_path?: string | null }
    if (json.poster_path) {
      await ctx.runMutation(internal.lists.patchItemPoster, {
        listItemId,
        posterPath: json.poster_path
      })
    }
  }
})

export const ensureLikedForUser = internalMutation({
  args: { userId: v.id('users') },
  handler: async (ctx, { userId }) => {
    const existing = await ctx.db
      .query('lists')
      .withIndex('by_userId_and_kind', (q) => q.eq('userId', userId).eq('kind', 'liked'))
      .unique()
    if (existing) return
    await ctx.db.insert('lists', {
      userId,
      name: 'Favorites',
      kind: 'liked',
      visibility: 'private',
      locked: true,
      itemCount: 0,
      createdAt: Date.now()
    })
  }
})

export const ensureWatchedForUser = internalMutation({
  args: { userId: v.id('users') },
  handler: async (ctx, { userId }) => {
    const existing = await ctx.db
      .query('lists')
      .withIndex('by_userId_and_kind', (q) => q.eq('userId', userId).eq('kind', 'watched'))
      .unique()
    if (existing) return
    await ctx.db.insert('lists', {
      userId,
      name: 'Watched',
      kind: 'watched',
      visibility: 'private',
      locked: true,
      itemCount: 0,
      createdAt: Date.now()
    })
  }
})

export const renameLikedToFavorites = internalMutation({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db.query('lists').collect()
    let renamed = 0
    for (const list of all) {
      if (list.kind !== 'liked') continue
      if (list.name === 'Favorites') continue
      await ctx.db.patch(list._id, { name: 'Favorites' })
      renamed++
    }
    return { renamed }
  }
})

export const backfillWatchedLists = internalMutation({
  args: {},
  handler: async (ctx) => {
    const users = await ctx.db.query('users').collect()
    let created = 0
    for (const user of users) {
      const existing = await ctx.db
        .query('lists')
        .withIndex('by_userId_and_kind', (q) => q.eq('userId', user._id).eq('kind', 'watched'))
        .unique()
      if (existing) continue
      await ctx.db.insert('lists', {
        userId: user._id,
        name: 'Watched',
        kind: 'watched',
        visibility: 'private',
        locked: true,
        itemCount: 0,
        createdAt: Date.now()
      })
      created++
    }
    return { created }
  }
})

// One-shot cleanup after collaboration/link-sharing removal: unsets the
// vestigial share codes so the deprecated schema fields can be dropped later.
export const clearShareCodes = internalMutation({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db.query('lists').collect()
    let cleared = 0
    for (const list of all) {
      if (list.shortCode === undefined && list.joinCode === undefined) continue
      await ctx.db.patch(list._id, { shortCode: undefined, joinCode: undefined })
      cleared++
    }
    return { cleared }
  }
})
