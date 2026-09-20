import { getAuthUserId } from '@convex-dev/auth/server'
import { v, type Infer } from 'convex/values'
import { internal } from './_generated/api'
import type { Doc } from './_generated/dataModel'
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
  type QueryCtx
} from './_generated/server'
import { mediaTypeValidator } from './schema'

// A snapshot is good for this long before opening the tab asks for a fresh one. New watched
// items also trigger a refresh regardless of age.
const FRESH_MS = 6 * 60 * 60 * 1000
// A compute that has not written back within this window is assumed dead and retried.
const COMPUTING_TIMEOUT_MS = 3 * 60 * 1000

const countRow = v.object({ label: v.string(), count: v.number() })
// A named title with enough to draw its poster.
const titleRef = { title: v.string(), posterPath: v.optional(v.string()) }

export const statsValidator = v.object({
  movies: v.number(),
  shows: v.number(),
  hoursWatched: v.number(),
  genres: v.array(countRow),
  decades: v.array(countRow),
  months: v.array(v.object({ key: v.string(), label: v.string(), count: v.number() })),
  languages: v.array(v.object({ code: v.string(), count: v.number() })),
  ratings: v.union(
    v.null(),
    v.object({
      count: v.number(),
      average: v.number(),
      // Titles given 1, 2, 3, 4 and 5, in that order.
      distribution: v.array(v.number())
    })
  ),
  highlights: v.object({
    longestMovie: v.union(v.null(), v.object({ ...titleRef, runtimeMin: v.number() })),
    oldest: v.union(v.null(), v.object({ ...titleRef, year: v.number() })),
    newest: v.union(v.null(), v.object({ ...titleRef, year: v.number() })),
    topRated: v.union(v.null(), v.object({ ...titleRef, score: v.number() })),
    busiestMonth: v.union(v.null(), v.object({ label: v.string(), count: v.number() }))
  })
})
export type ProfileStatsData = Infer<typeof statsValidator>

async function profileByUsername(ctx: QueryCtx, username: string): Promise<Doc<'profiles'> | null> {
  return await ctx.db
    .query('profiles')
    .withIndex('by_username', (q) => q.eq('username', username))
    .unique()
}

/** Same gate as recentlyWatchedByUsername: hidden activity, hidden profiles, and
 *  friends-only profiles you are not friends with all read as "nothing to show". */
async function canViewActivity(ctx: QueryCtx, profile: Doc<'profiles'>): Promise<boolean> {
  if (profile.hideActivity) return false
  const visibility = profile.visibility ?? 'public'
  if (visibility === 'hidden') return false
  if (visibility === 'public') return true
  const me = await getAuthUserId(ctx)
  if (me === null) return false
  if (me === profile.userId) return true
  const { userIdA, userIdB } =
    me < profile.userId
      ? { userIdA: me, userIdB: profile.userId }
      : { userIdA: profile.userId, userIdB: me }
  const row = await ctx.db
    .query('friendships')
    .withIndex('by_userIdA_and_userIdB', (q) => q.eq('userIdA', userIdA).eq('userIdB', userIdB))
    .unique()
  return !!row && row.status === 'accepted'
}

async function watchedCount(ctx: QueryCtx, userId: Doc<'users'>['_id']): Promise<number> {
  const list = await ctx.db
    .query('lists')
    .withIndex('by_userId_and_kind', (q) => q.eq('userId', userId).eq('kind', 'watched'))
    .unique()
  return list?.itemCount ?? 0
}

/** The stored snapshot for a profile, or null when the viewer may not see it. */
export const forUsername = query({
  args: { username: v.string() },
  handler: async (ctx, { username }) => {
    const profile = await profileByUsername(ctx, username)
    if (!profile || !(await canViewActivity(ctx, profile))) return null
    const row = await ctx.db
      .query('profileStats')
      .withIndex('by_userId', (q) => q.eq('userId', profile.userId))
      .unique()
    const watched = await watchedCount(ctx, profile.userId)
    return {
      stats: (row?.stats ?? null) as ProfileStatsData | null,
      computedAt: row?.computedAt ?? null,
      computing: !!row?.computingAt && Date.now() - row.computingAt < COMPUTING_TIMEOUT_MS,
      watchedCount: watched
    }
  }
})

/** Ask for a fresh snapshot. Cheap to call on every open: it only schedules work when the
 *  stored one is old, missing, or behind the watched list. */
export const requestRefresh = mutation({
  args: { username: v.string() },
  handler: async (ctx, { username }) => {
    const me = await getAuthUserId(ctx)
    if (me === null) throw new Error('Not authenticated')
    const profile = await profileByUsername(ctx, username)
    if (!profile || !(await canViewActivity(ctx, profile))) return 'unavailable'

    const now = Date.now()
    const row = await ctx.db
      .query('profileStats')
      .withIndex('by_userId', (q) => q.eq('userId', profile.userId))
      .unique()
    const watched = await watchedCount(ctx, profile.userId)

    if (row?.computingAt && now - row.computingAt < COMPUTING_TIMEOUT_MS) return 'computing'
    const fresh =
      row?.computedAt !== undefined && now - row.computedAt < FRESH_MS && row.itemCount === watched
    if (fresh) return 'fresh'

    if (row) await ctx.db.patch(row._id, { computingAt: now })
    else {
      await ctx.db.insert('profileStats', {
        userId: profile.userId,
        computingAt: now,
        itemCount: 0
      })
    }
    await ctx.scheduler.runAfter(0, internal.statsCompute.compute, { userId: profile.userId })
    return 'scheduled'
  }
})

/* ---------- internals used by the compute job ---------- */

export const inputs = internalQuery({
  args: { userId: v.id('users') },
  handler: async (ctx, { userId }) => {
    const list = await ctx.db
      .query('lists')
      .withIndex('by_userId_and_kind', (q) => q.eq('userId', userId).eq('kind', 'watched'))
      .unique()
    const items = list
      ? await ctx.db
          .query('listItems')
          .withIndex('by_listId', (q) => q.eq('listId', list._id))
          .collect()
      : []
    const ratings = await ctx.db
      .query('ratings')
      .withIndex('by_userId', (q) => q.eq('userId', userId))
      .collect()
    // Episodes finished, for TV hours: the watched list counts a show once however much of
    // it was seen, so hours come from playback rows that reached the end.
    const playback = await ctx.db
      .query('playbackProgress')
      .withIndex('by_userId_and_updatedAt', (q) => q.eq('userId', userId))
      .collect()
    let tvSeconds = 0
    for (const p of playback) {
      if (p.mediaType !== 'tv' || p.durationSec <= 0) continue
      if (p.positionSec / p.durationSec >= 0.9) tvSeconds += p.durationSec
    }
    return {
      items: items.map((i) => ({
        mediaType: i.mediaType,
        tmdbId: i.tmdbId,
        title: i.title,
        posterPath: i.posterPath,
        addedAt: i.addedAt
      })),
      ratings: ratings.map((r) => ({ mediaType: r.mediaType, tmdbId: r.tmdbId, score: r.score })),
      tvSeconds
    }
  }
})

export const metaFor = internalQuery({
  args: { keys: v.array(v.object({ mediaType: mediaTypeValidator, tmdbId: v.number() })) },
  handler: async (ctx, { keys }) => {
    const rows = await Promise.all(
      keys.map((k) =>
        ctx.db
          .query('titleMeta')
          .withIndex('by_media', (q) => q.eq('mediaType', k.mediaType).eq('tmdbId', k.tmdbId))
          .unique()
      )
    )
    return rows.filter((r): r is Doc<'titleMeta'> => r !== null)
  }
})

const metaRow = v.object({
  mediaType: mediaTypeValidator,
  tmdbId: v.number(),
  genres: v.array(v.string()),
  runtimeMin: v.optional(v.number()),
  year: v.optional(v.number()),
  releaseDate: v.optional(v.string()),
  originalLanguage: v.optional(v.string()),
  voteAverage: v.optional(v.number()),
  episodes: v.optional(v.number()),
  fetchedAt: v.number()
})

export const saveMeta = internalMutation({
  args: { rows: v.array(metaRow) },
  handler: async (ctx, { rows }) => {
    for (const row of rows) {
      const existing = await ctx.db
        .query('titleMeta')
        .withIndex('by_media', (q) => q.eq('mediaType', row.mediaType).eq('tmdbId', row.tmdbId))
        .unique()
      if (existing) await ctx.db.patch(existing._id, row)
      else await ctx.db.insert('titleMeta', row)
    }
  }
})

export const saveSnapshot = internalMutation({
  args: { userId: v.id('users'), itemCount: v.number(), stats: statsValidator },
  handler: async (ctx, { userId, itemCount, stats }) => {
    const row = await ctx.db
      .query('profileStats')
      .withIndex('by_userId', (q) => q.eq('userId', userId))
      .unique()
    const patch = { computedAt: Date.now(), computingAt: undefined, itemCount, stats }
    if (row) await ctx.db.patch(row._id, patch)
    else await ctx.db.insert('profileStats', { userId, ...patch })
  }
})

export const clearComputing = internalMutation({
  args: { userId: v.id('users') },
  handler: async (ctx, { userId }) => {
    const row = await ctx.db
      .query('profileStats')
      .withIndex('by_userId', (q) => q.eq('userId', userId))
      .unique()
    if (row) await ctx.db.patch(row._id, { computingAt: undefined })
  }
})
