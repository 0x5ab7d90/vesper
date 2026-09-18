import { v } from 'convex/values'
import { internal } from './_generated/api'
import { internalMutation } from './_generated/server'
import { presence } from './presence'

// Dev-only helpers for eyeballing friend activity UI. Not reachable from clients; run with
//   npx convex run devSeed:simulateWatching '{"username":"sicem","remainingTicks":30}'
// Each tick re-heartbeats presence and nudges playback forward, so the friend reads as
// "watching" (which needs a playback update within the last minute) until ticks run out.

const ROOM = 'vesper'
const TICK_MS = 20_000
const SESSION = 'dev-simulate-watching'

// Interstellar: a fixed title so posters and progress look real without hitting TMDB.
const TITLE = {
  imdbId: 'tt0816692',
  tmdbId: 157336,
  title: 'Interstellar',
  posterPath: '/gEU2QniE6E77NI6lCU6MxlNBvIx.jpg',
  backdropPath: '/xJHokMbljvjADYdit5fK5VQsXEG.jpg',
  durationSec: 169 * 60
}

export const simulateWatching = internalMutation({
  args: {
    username: v.string(),
    remainingTicks: v.optional(v.number()),
    positionSec: v.optional(v.number()),
    state: v.optional(v.union(v.literal('playing'), v.literal('paused')))
  },
  handler: async (
    ctx,
    { username, remainingTicks = 30, positionSec = 3600, state = 'playing' }
  ) => {
    const profile = await ctx.db
      .query('profiles')
      .withIndex('by_username', (q) => q.eq('username', username))
      .unique()
    if (!profile) throw new Error(`No profile for @${username}`)
    const userId = profile.userId

    await presence.heartbeat(ctx, ROOM, userId, SESSION, TICK_MS * 2)

    const existing = await ctx.db
      .query('playbackProgress')
      .withIndex('by_userId_and_imdb_season_ep', (q) =>
        q
          .eq('userId', userId)
          .eq('imdbId', TITLE.imdbId)
          .eq('season', undefined)
          .eq('episode', undefined)
      )
      .unique()
    const patch = {
      positionSec,
      durationSec: TITLE.durationSec,
      state,
      title: TITLE.title,
      tmdbId: TITLE.tmdbId,
      posterPath: TITLE.posterPath,
      backdropPath: TITLE.backdropPath,
      updatedAt: Date.now()
    }
    if (existing) await ctx.db.patch(existing._id, patch)
    else {
      await ctx.db.insert('playbackProgress', {
        userId,
        imdbId: TITLE.imdbId,
        mediaType: 'movie',
        ...patch
      })
    }

    if (remainingTicks > 0) {
      await ctx.scheduler.runAfter(TICK_MS, internal.devSeed.simulateWatching, {
        username,
        remainingTicks: remainingTicks - 1,
        positionSec: positionSec + (state === 'playing' ? TICK_MS / 1000 : 0),
        state
      })
    }
    return { userId, positionSec, remainingTicks }
  }
})
