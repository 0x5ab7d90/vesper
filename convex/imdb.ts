import { getAuthUserId } from '@convex-dev/auth/server'
import { v, type Infer } from 'convex/values'
import { internal } from './_generated/api'
import type { Doc, Id } from './_generated/dataModel'
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
  type MutationCtx
} from './_generated/server'
import { ensureWatchedItem } from './ratings'
import { imdbTallyValidator, imdbUnmatchedValidator, mediaTypeValidator } from './schema'

const EMPTY_TALLY: Infer<typeof imdbTallyValidator> = {
  ratings: 0,
  watchlist: 0,
  lists: 0,
  unmatched: []
}
const LISTS_CAP = 50

// The IMDb Import: account row, progress, and the writes a run makes. Everything that talks
// to IMDb itself lives in imdbImport.ts.

export const WATCHLIST_NAME = 'IMDb Watchlist'
// Enough to show what was skipped without letting a huge account outgrow the row.
const UNMATCHED_CAP = 200

/** Pull the profile id out of whatever the user pasted: a profile URL in either the new
 *  `p.` form or the old `ur` form, a ratings/watchlist URL, or a bare id. */
export function parseProfileId(input: string): string | null {
  const s = input.trim()
  const m = s.match(/(?:^|\/user\/)(p\.[a-z0-9]+|ur\d{5,12})(?:[/?#]|$)/i)
  return m ? m[1]! : null
}

/** The `ls…` id out of a pasted list URL or bare id. */
export function parseListId(input: string): string | null {
  const m = input.trim().match(/(?:^|\/list\/)(ls\d{6,12})(?:[/?#]|$)/i)
  return m ? m[1]!.toLowerCase() : null
}

/** Does a list's name say its titles have been watched? "Movies I've seen" yes; "To watch",
 *  "Haven't seen yet" no. A wrong guess only ever adds to Watched, never removes. */
export function impliesWatched(name: string): boolean {
  const n = name.toLowerCase()
  if (/\b(not|haven'?t|never|yet|unseen|unwatched|to watch|want|plan|someday)\b/.test(n)) {
    return false
  }
  return /\b(watched|seen|finished|completed)\b/.test(n)
}

async function accountFor(
  ctx: MutationCtx,
  userId: Id<'users'>
): Promise<Doc<'imdbAccounts'> | null> {
  return await ctx.db
    .query('imdbAccounts')
    .withIndex('by_userId', (q) => q.eq('userId', userId))
    .unique()
}

// ─── public ────────────────────────────────────────────────────────────────

export const connection = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx)
    if (userId === null) return null
    const account = await ctx.db
      .query('imdbAccounts')
      .withIndex('by_userId', (q) => q.eq('userId', userId))
      .unique()
    if (!account) return null
    return {
      link: account.link,
      imdbUserId: account.imdbUserId,
      nickName: account.nickName,
      status: account.status,
      progress: account.progress,
      error: account.error,
      lastRun: account.lastRun,
      lists: (account.lists ?? []).map((l) => ({
        imdbListId: l.imdbListId,
        name: l.name,
        markWatched: l.markWatched,
        total: l.total
      })),
      listsDiscovery: account.listsDiscovery
    }
  }
})

/** Remember a profile link and start the first import. Replaces any earlier link. */
export const connect = mutation({
  args: { link: v.string() },
  handler: async (ctx, { link }) => {
    const userId = await getAuthUserId(ctx)
    if (userId === null) throw new Error('Not signed in')
    const profileId = parseProfileId(link)
    if (!profileId) throw new Error('invalid-link')
    const existing = await accountFor(ctx, userId)
    if (existing?.status === 'running') throw new Error('already-running')
    const runId = crypto.randomUUID()
    const fields = {
      link: link.trim(),
      imdbUserId: profileId.startsWith('ur') ? profileId : undefined,
      nickName: undefined,
      status: 'running' as const,
      runId,
      progress: undefined,
      error: undefined,
      tally: EMPTY_TALLY
    }
    if (existing) {
      // A new link may be a different account; the old watchlist list stays theirs.
      await ctx.db.patch(existing._id, {
        ...fields,
        watchlistListId: undefined,
        lists: undefined,
        listsDiscovery: undefined,
        lastRun: undefined
      })
    } else {
      await ctx.db.insert('imdbAccounts', { userId, ...fields, createdAt: Date.now() })
    }
    await ctx.scheduler.runAfter(0, internal.imdbImport.start, {
      userId,
      runId,
      profileId,
      scope: 'all'
    })
  }
})

/** Re-run the import against the remembered link. */
export const runAgain = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx)
    if (userId === null) throw new Error('Not signed in')
    const account = await accountFor(ctx, userId)
    if (!account) throw new Error('not-connected')
    if (account.status === 'running') throw new Error('already-running')
    const profileId = parseProfileId(account.link)
    if (!profileId) throw new Error('invalid-link')
    const runId = crypto.randomUUID()
    await ctx.db.patch(account._id, {
      status: 'running',
      runId,
      progress: undefined,
      error: undefined,
      tally: EMPTY_TALLY,
      // Look for lists again too; the page may have been slow or blocked last time.
      listsDiscovery: undefined
    })
    await ctx.scheduler.runAfter(0, internal.imdbImport.start, {
      userId,
      runId,
      profileId,
      scope: 'all'
    })
  }
})

/** Forget the link. Everything the import brought in stays. A run in flight stops at its
 *  next page because its runId no longer resolves. */
export const disconnect = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx)
    if (userId === null) throw new Error('Not signed in')
    const account = await accountFor(ctx, userId)
    if (account) await ctx.db.delete(account._id)
  }
})

/** Add public lists to the import — found on the lists page in-app, or pasted. Starts a
 *  lists-only run when nothing is running; a run in flight picks them up when it gets there. */
export const addLists = mutation({
  args: {
    imdbListIds: v.array(v.string()),
    source: v.union(v.literal('discovered'), v.literal('pasted'))
  },
  handler: async (ctx, { imdbListIds, source }) => {
    const userId = await getAuthUserId(ctx)
    if (userId === null) throw new Error('Not signed in')
    const account = await accountFor(ctx, userId)
    if (!account) throw new Error('not-connected')
    const known = new Set((account.lists ?? []).map((l) => l.imdbListId))
    const fresh = [...new Set(imdbListIds.map((id) => id.toLowerCase()))]
      .filter((id) => /^ls\d{6,12}$/.test(id) && !known.has(id))
      .slice(0, Math.max(0, LISTS_CAP - known.size))
    const lists = (account.lists ?? []).concat(
      fresh.map((imdbListId) => ({ imdbListId, name: '', markWatched: false }))
    )
    const listsDiscovery =
      source === 'discovered' ? (lists.length > 0 ? 'found' : 'none') : account.listsDiscovery
    await ctx.db.patch(account._id, { lists, listsDiscovery })
    if (fresh.length === 0 || account.status === 'running') return { added: fresh.length }
    const profileId = parseProfileId(account.link)
    if (!profileId) throw new Error('invalid-link')
    const runId = crypto.randomUUID()
    // A lists-only run keeps the last full run's counts, so the summary still reads whole.
    const carried = account.lastRun ?? EMPTY_TALLY
    await ctx.db.patch(account._id, {
      status: 'running',
      runId,
      progress: undefined,
      error: undefined,
      tally: {
        ratings: carried.ratings,
        watchlist: carried.watchlist,
        lists: carried.lists ?? 0,
        unmatched: carried.unmatched
      }
    })
    await ctx.scheduler.runAfter(0, internal.imdbImport.start, {
      userId,
      runId,
      profileId,
      scope: 'lists'
    })
    return { added: fresh.length }
  }
})

/** The app couldn't read the lists page; remember that so the row offers pasting instead. */
export const markListsBlocked = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx)
    if (userId === null) throw new Error('Not signed in')
    const account = await accountFor(ctx, userId)
    if (account && account.listsDiscovery === undefined) {
      await ctx.db.patch(account._id, { listsDiscovery: 'blocked' })
    }
  }
})

// ─── internal ──────────────────────────────────────────────────────────────

export const accountForRun = internalQuery({
  args: { userId: v.id('users'), runId: v.string() },
  handler: async (ctx, { userId, runId }) => {
    const account = await ctx.db
      .query('imdbAccounts')
      .withIndex('by_userId', (q) => q.eq('userId', userId))
      .unique()
    if (!account || account.runId !== runId || account.status !== 'running') return null
    return account
  }
})

export const setResolved = internalMutation({
  args: {
    userId: v.id('users'),
    runId: v.string(),
    imdbUserId: v.string(),
    nickName: v.optional(v.string()),
    total: v.number()
  },
  handler: async (ctx, { userId, runId, imdbUserId, nickName, total }) => {
    const account = await accountFor(ctx, userId)
    if (!account || account.runId !== runId) return
    await ctx.db.patch(account._id, {
      imdbUserId,
      nickName: nickName ?? account.nickName,
      progress: { done: 0, total }
    })
  }
})

/** Name, size and watched-implication for one list, learned when its first page is fetched.
 *  Its size joins the progress total here, so lists added mid-run still count. */
export const setListMeta = internalMutation({
  args: {
    userId: v.id('users'),
    runId: v.string(),
    imdbListId: v.string(),
    name: v.string(),
    total: v.number()
  },
  handler: async (ctx, { userId, runId, imdbListId, name, total }) => {
    const account = await accountFor(ctx, userId)
    if (!account || account.runId !== runId) return
    const lists = (account.lists ?? []).map((l) =>
      l.imdbListId === imdbListId ? { ...l, name, total, markWatched: impliesWatched(name) } : l
    )
    const progress = account.progress
      ? { ...account.progress, total: account.progress.total + total }
      : { done: 0, total }
    await ctx.db.patch(account._id, { lists, progress })
  }
})

export const fail = internalMutation({
  args: {
    userId: v.id('users'),
    runId: v.string(),
    error: v.union(
      v.literal('not-found'),
      v.literal('private'),
      v.literal('unavailable'),
      v.literal('failed')
    )
  },
  handler: async (ctx, { userId, runId, error }) => {
    const account = await accountFor(ctx, userId)
    if (!account || account.runId !== runId) return
    await ctx.db.patch(account._id, {
      status: 'failed',
      error,
      progress: undefined,
      tally: undefined
    })
  }
})

export const finish = internalMutation({
  args: { userId: v.id('users'), runId: v.string() },
  handler: async (ctx, { userId, runId }) => {
    const account = await accountFor(ctx, userId)
    if (!account || account.runId !== runId) return
    const tally = account.tally ?? EMPTY_TALLY
    await ctx.db.patch(account._id, {
      status: 'done',
      progress: undefined,
      tally: undefined,
      lastRun: { ...tally, finishedAt: Date.now() }
    })
  }
})

const matchedItem = v.object({
  mediaType: mediaTypeValidator,
  tmdbId: v.number(),
  title: v.string(),
  posterPath: v.optional(v.string()),
  // 1–5 and the IMDb rating date; absent for list rows.
  score: v.optional(v.number()),
  ratedAt: v.optional(v.number()),
  // When IMDb says the row was added to its list.
  addedAt: v.optional(v.number())
})

/** Write one page of results. Ratings never overwrite a local rating; rated titles are also
 *  marked watched; watchlist rows go into the IMDb Watchlist list, which is created once. */
export const applyPage = internalMutation({
  args: {
    userId: v.id('users'),
    runId: v.string(),
    phase: v.union(v.literal('ratings'), v.literal('watchlist'), v.literal('list')),
    imdbListId: v.optional(v.string()),
    items: v.array(matchedItem),
    unmatched: v.array(imdbUnmatchedValidator),
    seen: v.number()
  },
  handler: async (ctx, { userId, runId, phase, imdbListId, items, unmatched, seen }) => {
    const account = await accountFor(ctx, userId)
    if (!account || account.runId !== runId || account.status !== 'running') return
    const tally = { ...(account.tally ?? EMPTY_TALLY) }
    let watchlistListId = account.watchlistListId
    let lists = account.lists

    if (phase === 'ratings') {
      for (const item of items) {
        if (item.score === undefined) continue
        const existing = await ctx.db
          .query('ratings')
          .withIndex('by_user_and_media', (q) =>
            q.eq('userId', userId).eq('mediaType', item.mediaType).eq('tmdbId', item.tmdbId)
          )
          .unique()
        if (!existing) {
          const at = item.ratedAt ?? Date.now()
          await ctx.db.insert('ratings', {
            userId,
            mediaType: item.mediaType,
            tmdbId: item.tmdbId,
            score: item.score,
            createdAt: at,
            updatedAt: at
          })
        }
        await ensureWatchedItem(
          ctx,
          userId,
          item.mediaType,
          item.tmdbId,
          item.title,
          item.posterPath,
          item.ratedAt
        )
        tally.ratings += 1
      }
    } else if (phase === 'watchlist') {
      const list = await getOrCreateList(ctx, userId, watchlistListId, WATCHLIST_NAME)
      watchlistListId = list._id
      tally.watchlist += await addAll(ctx, userId, list, items)
    } else if (imdbListId) {
      const entry = (lists ?? []).find((l) => l.imdbListId === imdbListId)
      if (!entry) return
      const list = await getOrCreateList(ctx, userId, entry.listId, entry.name || 'IMDb list')
      lists = (lists ?? []).map((l) =>
        l.imdbListId === imdbListId ? { ...l, listId: list._id } : l
      )
      tally.lists = (tally.lists ?? 0) + (await addAll(ctx, userId, list, items))
      if (entry.markWatched) {
        for (const item of items) {
          await ensureWatchedItem(
            ctx,
            userId,
            item.mediaType,
            item.tmdbId,
            item.title,
            item.posterPath,
            item.addedAt
          )
        }
      }
    }

    const room = Math.max(0, UNMATCHED_CAP - tally.unmatched.length)
    tally.unmatched = tally.unmatched.concat(unmatched.slice(0, room))
    const progress = account.progress
      ? {
          done: Math.min(account.progress.total, account.progress.done + seen),
          total: account.progress.total
        }
      : undefined
    await ctx.db.patch(account._id, { tally, progress, watchlistListId, lists })
  }
})

/** Add every item not already on the list; returns how many rows were seen. */
async function addAll(
  ctx: MutationCtx,
  userId: Id<'users'>,
  list: Doc<'lists'>,
  items: {
    mediaType: 'movie' | 'tv'
    tmdbId: number
    title: string
    posterPath?: string
    addedAt?: number
  }[]
): Promise<number> {
  let added = 0
  for (const item of items) {
    const dupe = await ctx.db
      .query('listItems')
      .withIndex('by_listId_and_media', (q) =>
        q.eq('listId', list._id).eq('mediaType', item.mediaType).eq('tmdbId', item.tmdbId)
      )
      .unique()
    if (dupe) {
      // Same rule as Watched: a source date may only pull a row back in time.
      if (item.addedAt !== undefined && item.addedAt < dupe.addedAt) {
        await ctx.db.patch(dupe._id, { addedAt: item.addedAt })
      }
      continue
    }
    await ctx.db.insert('listItems', {
      listId: list._id,
      mediaType: item.mediaType,
      tmdbId: item.tmdbId,
      addedBy: userId,
      addedAt: item.addedAt ?? Date.now(),
      title: item.title,
      posterPath: item.posterPath
    })
    added += 1
  }
  if (added > 0) {
    await ctx.db.patch(list._id, {
      itemCount: list.itemCount + added,
      lastItemAddedAt: Date.now()
    })
  }
  return items.length
}

async function getOrCreateList(
  ctx: MutationCtx,
  userId: Id<'users'>,
  knownId: Id<'lists'> | undefined,
  name: string
): Promise<Doc<'lists'>> {
  if (knownId) {
    const known = await ctx.db.get(knownId)
    if (known && known.userId === userId) return known
  }
  // First import, or the user deleted the list since: make a fresh one.
  const id = await ctx.db.insert('lists', {
    userId,
    name: name.slice(0, 60),
    kind: 'custom',
    visibility: 'private',
    locked: false,
    itemCount: 0,
    createdAt: Date.now()
  })
  const created = await ctx.db.get(id)
  if (!created) throw new Error('Failed to create list')
  return created
}
