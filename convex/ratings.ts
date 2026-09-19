import { getAuthUserId } from '@convex-dev/auth/server'
import { v } from 'convex/values'
import { internal } from './_generated/api'
import type { Doc, Id } from './_generated/dataModel'
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
  type MutationCtx
} from './_generated/server'
import { mediaTypeValidator } from './schema'

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

// Returns true when the watched row exists but has no poster (caller may backfill one).
export async function ensureWatchedItem(
  ctx: MutationCtx,
  userId: Id<'users'>,
  mediaType: 'movie' | 'tv',
  tmdbId: number,
  title: string,
  posterPath: string | undefined,
  // When the source knows when the title was seen (a rating date, a list entry date), the
  // watched row takes it, so month-by-month stats stay honest for imported history.
  addedAt?: number
): Promise<boolean> {
  const list = await getOrCreateWatchedList(ctx, userId)
  const dupe = await ctx.db
    .query('listItems')
    .withIndex('by_listId_and_media', (q) =>
      q.eq('listId', list._id).eq('mediaType', mediaType).eq('tmdbId', tmdbId)
    )
    .unique()
  if (dupe) {
    if (addedAt !== undefined && addedAt < dupe.addedAt) await ctx.db.patch(dupe._id, { addedAt })
    return !dupe.posterPath
  }
  const now = Date.now()
  await ctx.db.insert('listItems', {
    listId: list._id,
    mediaType,
    tmdbId,
    addedBy: userId,
    addedAt: addedAt ?? now,
    title,
    posterPath
  })
  await ctx.db.patch(list._id, {
    itemCount: list.itemCount + 1,
    lastItemAddedAt: now
  })
  return !posterPath
}

export const setRating = mutation({
  args: {
    mediaType: mediaTypeValidator,
    tmdbId: v.number(),
    score: v.number(),
    title: v.string(),
    posterPath: v.optional(v.string())
  },
  handler: async (ctx, { mediaType, tmdbId, score, title, posterPath }) => {
    const userId = await getAuthUserId(ctx)
    if (userId === null) throw new Error('Not authenticated')
    if (!Number.isInteger(score) || score < 1 || score > 5) {
      throw new Error('Score must be 1-5')
    }
    const existing = await ctx.db
      .query('ratings')
      .withIndex('by_user_and_media', (q) =>
        q.eq('userId', userId).eq('mediaType', mediaType).eq('tmdbId', tmdbId)
      )
      .unique()
    const now = Date.now()
    if (existing) {
      await ctx.db.patch(existing._id, { score, updatedAt: now })
    } else {
      await ctx.db.insert('ratings', {
        userId,
        mediaType,
        tmdbId,
        score,
        createdAt: now,
        updatedAt: now
      })
    }
    await ensureWatchedItem(ctx, userId, mediaType, tmdbId, title, posterPath)
    await ctx.scheduler.runAfter(0, internal.trakt.pushRating, {
      userId,
      mediaType,
      tmdbId,
      score,
      updatedAt: now
    })
    await ctx.scheduler.runAfter(0, internal.trakt.pushWatched, { userId, mediaType, tmdbId })
  }
})

export const unsetRating = mutation({
  args: { mediaType: mediaTypeValidator, tmdbId: v.number() },
  handler: async (ctx, { mediaType, tmdbId }) => {
    const userId = await getAuthUserId(ctx)
    if (userId === null) throw new Error('Not authenticated')
    const existing = await ctx.db
      .query('ratings')
      .withIndex('by_user_and_media', (q) =>
        q.eq('userId', userId).eq('mediaType', mediaType).eq('tmdbId', tmdbId)
      )
      .unique()
    if (existing) {
      await ctx.db.delete(existing._id)
      await ctx.scheduler.runAfter(0, internal.trakt.pushRating, {
        userId,
        mediaType,
        tmdbId,
        updatedAt: Date.now()
      })
    }
  }
})

export const getRating = query({
  args: { mediaType: mediaTypeValidator, tmdbId: v.number() },
  handler: async (ctx, { mediaType, tmdbId }) => {
    const userId = await getAuthUserId(ctx)
    if (userId === null) return null
    const r = await ctx.db
      .query('ratings')
      .withIndex('by_user_and_media', (q) =>
        q.eq('userId', userId).eq('mediaType', mediaType).eq('tmdbId', tmdbId)
      )
      .unique()
    return r?.score ?? null
  }
})

// ─── Trakt sync (internal) ───────────────────────────────────────────────────

// Apply a rating originating from Trakt. Newest-edit-wins: only overwrite a
// local rating when the incoming edit is strictly newer.
export const applyExternalRating = internalMutation({
  args: {
    userId: v.id('users'),
    mediaType: mediaTypeValidator,
    tmdbId: v.number(),
    score: v.number(),
    updatedAt: v.number(),
    title: v.string()
  },
  handler: async (ctx, { userId, mediaType, tmdbId, score, updatedAt, title }) => {
    const existing = await ctx.db
      .query('ratings')
      .withIndex('by_user_and_media', (q) =>
        q.eq('userId', userId).eq('mediaType', mediaType).eq('tmdbId', tmdbId)
      )
      .unique()
    if (existing) {
      if (updatedAt > existing.updatedAt) await ctx.db.patch(existing._id, { score, updatedAt })
    } else {
      await ctx.db.insert('ratings', {
        userId,
        mediaType,
        tmdbId,
        score,
        createdAt: updatedAt,
        updatedAt
      })
    }
    return await ensureWatchedItem(ctx, userId, mediaType, tmdbId, title, undefined)
  }
})

export const addExternalWatched = internalMutation({
  args: {
    userId: v.id('users'),
    mediaType: mediaTypeValidator,
    tmdbId: v.number(),
    title: v.string()
  },
  handler: async (ctx, { userId, mediaType, tmdbId, title }) => {
    return await ensureWatchedItem(ctx, userId, mediaType, tmdbId, title, undefined)
  }
})

export const setWatchedPoster = internalMutation({
  args: {
    userId: v.id('users'),
    mediaType: mediaTypeValidator,
    tmdbId: v.number(),
    posterPath: v.string()
  },
  handler: async (ctx, { userId, mediaType, tmdbId, posterPath }) => {
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
    if (item && !item.posterPath) await ctx.db.patch(item._id, { posterPath })
  }
})

export const allForUser = internalQuery({
  args: { userId: v.id('users') },
  handler: async (ctx, { userId }) => {
    const rows = await ctx.db
      .query('ratings')
      .withIndex('by_userId', (q) => q.eq('userId', userId))
      .collect()
    return rows.map((r) => ({
      mediaType: r.mediaType,
      tmdbId: r.tmdbId,
      score: r.score,
      updatedAt: r.updatedAt
    }))
  }
})

export const watchedForUser = internalQuery({
  args: { userId: v.id('users') },
  handler: async (ctx, { userId }) => {
    const list = await ctx.db
      .query('lists')
      .withIndex('by_userId_and_kind', (q) => q.eq('userId', userId).eq('kind', 'watched'))
      .unique()
    if (!list) return []
    const items = await ctx.db
      .query('listItems')
      .withIndex('by_listId', (q) => q.eq('listId', list._id))
      .collect()
    return items.map((i) => ({ mediaType: i.mediaType, tmdbId: i.tmdbId }))
  }
})

export const getRatingsForCurrentUser = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx)
    if (userId === null) return []
    const rows = await ctx.db
      .query('ratings')
      .withIndex('by_userId', (q) => q.eq('userId', userId))
      .collect()
    return rows.map((r) => ({ mediaType: r.mediaType, tmdbId: r.tmdbId, score: r.score }))
  }
})
