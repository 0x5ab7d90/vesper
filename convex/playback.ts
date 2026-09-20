import { getAuthUserId } from '@convex-dev/auth/server'
import { v } from 'convex/values'
import { mediaTypeValidator } from './schema'
import { internal } from './_generated/api'
import { mutation, query, type QueryCtx } from './_generated/server'
import type { Doc } from './_generated/dataModel'
import { presence } from './presence'
import { addToWatchedList } from './lists'

const COMPLETE_THRESHOLD = 0.95
// Half of a movie or an episode is enough to call it watched. Continue Watching still keeps
// it around until COMPLETE_THRESHOLD, so counting it does not mean you have finished it.
const WATCHED_THRESHOLD = 0.5

const SCROBBLE_ACTION = {
  playing: 'start',
  paused: 'pause',
  idle: 'stop'
} as const

async function findRow(
  ctx: QueryCtx,
  userId: Doc<'users'>['_id'],
  imdbId: string,
  season: number | undefined,
  episode: number | undefined
): Promise<Doc<'playbackProgress'> | null> {
  return await ctx.db
    .query('playbackProgress')
    .withIndex('by_userId_and_imdb_season_ep', (q) =>
      q.eq('userId', userId).eq('imdbId', imdbId).eq('season', season).eq('episode', episode)
    )
    .unique()
}

export const upsert = mutation({
  args: {
    imdbId: v.string(),
    mediaType: mediaTypeValidator,
    season: v.optional(v.number()),
    episode: v.optional(v.number()),
    positionSec: v.number(),
    durationSec: v.number(),
    state: v.optional(v.union(v.literal('playing'), v.literal('paused'), v.literal('idle'))),
    title: v.optional(v.string()),
    tmdbId: v.optional(v.number()),
    posterPath: v.optional(v.string()),
    backdropPath: v.optional(v.string()),
    streamUrl: v.optional(v.string()),
    episodeLabel: v.optional(v.string()),
    // Only the player knows the show's shape: true when this is the last episode of the last
    // season, which is what promotes a finished episode into a finished series.
    isSeriesFinale: v.optional(v.boolean())
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx)
    if (!userId) throw new Error('Not authenticated')
    const now = Date.now()
    const existing = await findRow(ctx, userId, args.imdbId, args.season, args.episode)
    // Crossing the threshold is a one-time event: the stamp is kept once set, so unmarking a
    // title by hand is not undone by the next progress tick.
    const crossed = args.durationSec > 0 && args.positionSec / args.durationSec >= WATCHED_THRESHOLD
    const justCrossed = crossed && existing?.watchedAt === undefined
    const patch = {
      positionSec: args.positionSec,
      durationSec: args.durationSec,
      state: args.state,
      watchedAt: existing?.watchedAt ?? (crossed ? now : undefined),
      title: args.title,
      tmdbId: args.tmdbId,
      posterPath: args.posterPath,
      backdropPath: args.backdropPath,
      streamUrl: args.streamUrl,
      episodeLabel: args.episodeLabel,
      updatedAt: now
    }
    const id = existing
      ? (await ctx.db.patch(existing._id, patch), existing._id)
      : await ctx.db.insert('playbackProgress', {
          userId,
          imdbId: args.imdbId,
          mediaType: args.mediaType,
          season: args.season,
          episode: args.episode,
          ...patch
        })

    // A watched movie, or a watched finale, belongs in the Watched list. Episodes short of the
    // finale are recorded by the stamp above and nothing else: the list holds titles, not episodes.
    if (justCrossed && args.tmdbId !== undefined && args.title) {
      const whole = args.mediaType === 'movie' || args.isSeriesFinale === true
      if (whole) {
        await addToWatchedList(ctx, userId, {
          mediaType: args.mediaType,
          tmdbId: args.tmdbId,
          title: args.title,
          posterPath: args.posterPath
        })
      }
    }

    // Live Trakt scrobble — fire only on a play/pause/stop transition, not every tick.
    if (args.state && args.state !== existing?.state && args.durationSec > 0) {
      await ctx.scheduler.runAfter(0, internal.trakt.scrobble, {
        userId,
        action: SCROBBLE_ACTION[args.state],
        imdbId: args.imdbId,
        mediaType: args.mediaType,
        season: args.season,
        episode: args.episode,
        progress: (args.positionSec / args.durationSec) * 100
      })
    }
    return id
  }
})

export const getForTitle = query({
  args: {
    imdbId: v.string(),
    season: v.optional(v.number()),
    episode: v.optional(v.number())
  },
  handler: async (ctx, { imdbId, season, episode }) => {
    const userId = await getAuthUserId(ctx)
    if (!userId) return null
    return await findRow(ctx, userId, imdbId, season, episode)
  }
})

export const listForSeries = query({
  args: { imdbId: v.string() },
  handler: async (ctx, { imdbId }) => {
    const userId = await getAuthUserId(ctx)
    if (!userId) return []
    const rows = await ctx.db
      .query('playbackProgress')
      .withIndex('by_userId_and_imdb_season_ep', (q) => q.eq('userId', userId).eq('imdbId', imdbId))
      .collect()
    return rows.filter((r) => r.season !== undefined && r.episode !== undefined)
  }
})

export const listContinueWatching = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }) => {
    const userId = await getAuthUserId(ctx)
    if (!userId) return []
    const cap = limit ?? 20
    const rows = await ctx.db
      .query('playbackProgress')
      .withIndex('by_userId_and_updatedAt', (q) => q.eq('userId', userId))
      .order('desc')
      .take(cap * 4)
    const incomplete = rows.filter((r) => r.positionSec / r.durationSec < COMPLETE_THRESHOLD)
    const seenSeries = new Set<string>()
    const out: typeof incomplete = []
    for (const r of incomplete) {
      if (r.mediaType === 'tv') {
        if (seenSeries.has(r.imdbId)) continue
        seenSeries.add(r.imdbId)
      }
      out.push(r)
      if (out.length >= cap) break
    }
    return out
  }
})

export const recentlyWatchedByUsername = query({
  args: { username: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, { username, limit }) => {
    const profile = await ctx.db
      .query('profiles')
      .withIndex('by_username', (q) => q.eq('username', username))
      .unique()
    if (!profile) return []
    if (profile.hideActivity) return []
    const visibility = profile.visibility ?? 'public'
    if (visibility === 'hidden') return []
    if (visibility === 'friends') {
      const me = await getAuthUserId(ctx)
      if (me === null || me !== profile.userId) {
        if (me === null) return []
        const { userIdA, userIdB } =
          me < profile.userId
            ? { userIdA: me, userIdB: profile.userId }
            : { userIdA: profile.userId, userIdB: me }
        const row = await ctx.db
          .query('friendships')
          .withIndex('by_userIdA_and_userIdB', (q) =>
            q.eq('userIdA', userIdA).eq('userIdB', userIdB)
          )
          .unique()
        if (!row || row.status !== 'accepted') return []
      }
    }
    const since = Date.now() - 30 * 24 * 60 * 60 * 1000
    const rows = await ctx.db
      .query('playbackProgress')
      .withIndex('by_userId_and_updatedAt', (q) =>
        q.eq('userId', profile.userId).gt('updatedAt', since)
      )
      .order('desc')
      .take(200)
    const seen = new Set<number>()
    const out: Array<{
      tmdbId: number
      mediaType: 'movie' | 'tv'
      title: string
      posterPath?: string
      updatedAt: number
    }> = []
    for (const r of rows) {
      if (r.tmdbId === undefined) continue
      if (seen.has(r.tmdbId)) continue
      seen.add(r.tmdbId)
      out.push({
        tmdbId: r.tmdbId,
        mediaType: r.mediaType,
        title: r.title ?? '',
        posterPath: r.posterPath,
        updatedAt: r.updatedAt
      })
      if (out.length >= (limit ?? 20)) break
    }
    return out
  }
})

// Same windows the friends sidebar uses to call someone watching or paused.
const WATCHING_FRESHNESS_MS = 60_000
const PAUSED_FRESHNESS_MS = 5 * 60_000

/** What a user is watching or paused on right now, or null; respects the same privacy
 *  settings as recentlyWatchedByUsername plus hidePresence, since this is live. */
export const nowPlayingByUsername = query({
  args: { username: v.string() },
  handler: async (ctx, { username }) => {
    const profile = await ctx.db
      .query('profiles')
      .withIndex('by_username', (q) => q.eq('username', username))
      .unique()
    if (!profile) return null
    if (profile.hideActivity || profile.hidePresence) return null
    const visibility = profile.visibility ?? 'public'
    if (visibility === 'hidden') return null
    const me = await getAuthUserId(ctx)
    if (visibility === 'friends' && me !== profile.userId) {
      if (me === null) return null
      const { userIdA, userIdB } =
        me < profile.userId
          ? { userIdA: me, userIdB: profile.userId }
          : { userIdA: profile.userId, userIdB: me }
      const row = await ctx.db
        .query('friendships')
        .withIndex('by_userIdA_and_userIdB', (q) => q.eq('userIdA', userIdA).eq('userIdB', userIdB))
        .unique()
      if (!row || row.status !== 'accepted') return null
    }

    const latest = await ctx.db
      .query('playbackProgress')
      .withIndex('by_userId_and_updatedAt', (q) => q.eq('userId', profile.userId))
      .order('desc')
      .take(1)
    const playback = latest[0]
    if (!playback || playback.tmdbId === undefined) return null

    const age = Date.now() - playback.updatedAt
    const status =
      playback.state === 'playing' && age < WATCHING_FRESHNESS_MS
        ? 'watching'
        : playback.state === 'paused' && age < PAUSED_FRESHNESS_MS
          ? 'paused'
          : null
    if (!status) return null

    const online = await presence.listRoom(ctx, 'vesper', true, 200)
    if (!online.some((p) => p.userId === profile.userId)) return null

    return {
      status,
      tmdbId: playback.tmdbId,
      mediaType: playback.mediaType,
      title: playback.title ?? playback.imdbId,
      posterPath: playback.posterPath,
      season: playback.season,
      episode: playback.episode,
      episodeLabel: playback.episodeLabel,
      positionSec: playback.positionSec,
      durationSec: playback.durationSec,
      updatedAt: playback.updatedAt
    }
  }
})

export const markWatched = mutation({
  args: {
    imdbId: v.string(),
    mediaType: mediaTypeValidator,
    season: v.number(),
    episode: v.number(),
    tmdbId: v.optional(v.number()),
    title: v.optional(v.string()),
    posterPath: v.optional(v.string()),
    backdropPath: v.optional(v.string()),
    episodeLabel: v.optional(v.string()),
    runtimeSec: v.optional(v.number()),
    isSeriesFinale: v.optional(v.boolean())
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx)
    if (!userId) throw new Error('Not authenticated')
    const now = Date.now()
    const duration = args.runtimeSec && args.runtimeSec > 0 ? args.runtimeSec : 1
    const existing = await findRow(ctx, userId, args.imdbId, args.season, args.episode)
    if (args.isSeriesFinale === true && args.tmdbId !== undefined && args.title) {
      await addToWatchedList(ctx, userId, {
        mediaType: args.mediaType,
        tmdbId: args.tmdbId,
        title: args.title,
        posterPath: args.posterPath
      })
    }
    const patch = {
      positionSec: duration,
      durationSec: duration,
      state: 'idle' as const,
      watchedAt: existing?.watchedAt ?? now,
      title: args.title,
      tmdbId: args.tmdbId,
      posterPath: args.posterPath,
      backdropPath: args.backdropPath,
      episodeLabel: args.episodeLabel,
      updatedAt: now
    }
    if (existing) {
      await ctx.db.patch(existing._id, patch)
      return existing._id
    }
    return await ctx.db.insert('playbackProgress', {
      userId,
      imdbId: args.imdbId,
      mediaType: args.mediaType,
      season: args.season,
      episode: args.episode,
      ...patch
    })
  }
})

export const clearWatchHistory = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx)
    if (!userId) throw new Error('Not authenticated')
    const rows = await ctx.db
      .query('playbackProgress')
      .withIndex('by_userId_and_updatedAt', (q) => q.eq('userId', userId))
      .collect()
    for (const r of rows) await ctx.db.delete(r._id)
    return { deleted: rows.length }
  }
})

export const remove = mutation({
  args: {
    imdbId: v.string(),
    season: v.optional(v.number()),
    episode: v.optional(v.number())
  },
  handler: async (ctx, { imdbId, season, episode }) => {
    const userId = await getAuthUserId(ctx)
    if (!userId) throw new Error('Not authenticated')
    const row = await findRow(ctx, userId, imdbId, season, episode)
    if (row) await ctx.db.delete(row._id)
  }
})
