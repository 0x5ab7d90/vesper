import { v } from 'convex/values'
import { internal } from './_generated/api'
import { parseProfileId } from './imdb'
import { internalAction, internalMutation, internalQuery } from './_generated/server'
import { presence } from './presence'
import { showcaseItemValidator } from './schema'

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

// Fill a user's four favorite slots with well-known titles, for eyeballing the profile card.
//   npx convex run devSeed:seedShowcase '{"username":"sicem"}'
const SHOWCASE_SAMPLE = [
  {
    tmdbId: 27205,
    mediaType: 'movie',
    title: 'Inception',
    posterPath: '/oYuLEt3zVCKq57qu2F8dT7NIa6f.jpg'
  },
  {
    tmdbId: 1396,
    mediaType: 'tv',
    title: 'Breaking Bad',
    posterPath: '/ztkUQFLlC19CCMYHW9o1zWhJRNq.jpg'
  },
  {
    tmdbId: 496243,
    mediaType: 'movie',
    title: 'Parasite',
    posterPath: '/7IiTTgloJzvGI1TAYymCfbfl3vT.jpg'
  },
  {
    tmdbId: 95396,
    mediaType: 'tv',
    title: 'Severance',
    posterPath: '/pPHpeI2X1qEd1CS1SeyrdhZ4qnT.jpg'
  }
] as const

export const seedShowcase = internalMutation({
  args: { username: v.string(), items: v.optional(v.array(showcaseItemValidator)) },
  handler: async (ctx, { username, items }) => {
    const profile = await ctx.db
      .query('profiles')
      .withIndex('by_username', (q) => q.eq('username', username))
      .unique()
    if (!profile) throw new Error(`No profile for @${username}`)
    const showcase = (items ?? SHOWCASE_SAMPLE).slice(0, 4).map((i) => ({ ...i }))
    await ctx.db.patch(profile._id, { showcase })
    return showcase.map((i) => i.title)
  }
})

// Copy one profile's avatar, banner, and bio onto another, so a test account looks populated.
//   npx convex run devSeed:copyLook '{"from":"0x5ab7d90","to":"sicem"}'
export const copyLook = internalMutation({
  args: { from: v.string(), to: v.string() },
  handler: async (ctx, { from, to }) => {
    const byUsername = (username: string) =>
      ctx.db
        .query('profiles')
        .withIndex('by_username', (q) => q.eq('username', username))
        .unique()
    const [source, target] = await Promise.all([byUsername(from), byUsername(to)])
    if (!source) throw new Error(`No profile for @${from}`)
    if (!target) throw new Error(`No profile for @${to}`)
    await ctx.db.patch(target._id, {
      avatarUrl: source.avatarUrl,
      bannerUrl: source.bannerUrl,
      bio: source.bio
    })
    return { avatarUrl: source.avatarUrl, bannerUrl: source.bannerUrl, bio: source.bio }
  }
})

// Resolve titles against TMDB with the deployment's key and fill the slots with the top hit.
//   npx convex run devSeed:seedShowcaseByTitles '{"username":"sicem","titles":["Interstellar (2014)"]}'
// A trailing "(year)" narrows the search.
export const seedShowcaseByTitles = internalAction({
  args: { username: v.string(), titles: v.array(v.string()) },
  handler: async (ctx, { username, titles }) => {
    const key = (process.env.TMDB_API_KEYS ?? process.env.TMDB_API_KEY ?? '').split(',')[0]?.trim()
    if (!key) throw new Error('No TMDB key on this deployment')
    const items: Array<{
      tmdbId: number
      mediaType: 'movie' | 'tv'
      title: string
      posterPath?: string
    }> = []
    for (const raw of titles.slice(0, 4)) {
      const m = raw.match(/^(.*?)\s*\((\d{4})\)\s*$/)
      const title = m ? m[1]! : raw
      const url = new URL('https://api.themoviedb.org/3/search/multi')
      url.searchParams.set('api_key', key)
      url.searchParams.set('query', title)
      const res = await fetch(url)
      if (!res.ok) throw new Error(`TMDB ${res.status} for "${title}"`)
      const data = (await res.json()) as {
        results: Array<{
          id: number
          media_type: string
          title?: string
          name?: string
          poster_path?: string | null
          release_date?: string
          first_air_date?: string
        }>
      }
      const hit = data.results.find(
        (r) =>
          (r.media_type === 'movie' || r.media_type === 'tv') &&
          (!m || (r.release_date ?? r.first_air_date ?? '').startsWith(m[2]!))
      )
      if (!hit) throw new Error(`No TMDB match for "${raw}"`)
      items.push({
        tmdbId: hit.id,
        mediaType: hit.media_type as 'movie' | 'tv',
        title: hit.title ?? hit.name ?? title,
        posterPath: hit.poster_path ?? undefined
      })
    }
    await ctx.runMutation(internal.devSeed.seedShowcase, { username, items })
    return items
  }
})

// Load watched items (e.g. exported from another deployment) into a user's Watched list,
// skipping titles already there. Pass the args file with `npx convex run ... "$(cat file)"`.
export const importWatched = internalMutation({
  args: {
    username: v.string(),
    items: v.array(
      v.object({
        mediaType: v.union(v.literal('movie'), v.literal('tv')),
        tmdbId: v.number(),
        title: v.string(),
        posterPath: v.optional(v.string()),
        addedAt: v.number()
      })
    )
  },
  handler: async (ctx, { username, items }) => {
    const profile = await ctx.db
      .query('profiles')
      .withIndex('by_username', (q) => q.eq('username', username))
      .unique()
    if (!profile) throw new Error(`No profile for @${username}`)
    const userId = profile.userId
    let list = await ctx.db
      .query('lists')
      .withIndex('by_userId_and_kind', (q) => q.eq('userId', userId).eq('kind', 'watched'))
      .unique()
    if (!list) {
      const id = await ctx.db.insert('lists', {
        userId,
        name: 'Watched',
        kind: 'watched',
        visibility: 'private',
        locked: true,
        itemCount: 0,
        createdAt: Date.now()
      })
      list = (await ctx.db.get(id))!
    }
    let added = 0
    let latest = list.lastItemAddedAt ?? 0
    for (const item of items) {
      const dupe = await ctx.db
        .query('listItems')
        .withIndex('by_listId_and_media', (q) =>
          q.eq('listId', list!._id).eq('mediaType', item.mediaType).eq('tmdbId', item.tmdbId)
        )
        .unique()
      if (dupe) continue
      await ctx.db.insert('listItems', { listId: list._id, addedBy: userId, ...item })
      added++
      if (item.addedAt > latest) latest = item.addedAt
    }
    await ctx.db.patch(list._id, { itemCount: list.itemCount + added, lastItemAddedAt: latest })
    return { added, total: list.itemCount + added }
  }
})

// After a bulk `npx convex import --table listItems --append`, bring the Watched list's
// counters back in line with what is actually in it.
export const recountWatched = internalMutation({
  args: { username: v.string() },
  handler: async (ctx, { username }) => {
    const profile = await ctx.db
      .query('profiles')
      .withIndex('by_username', (q) => q.eq('username', username))
      .unique()
    if (!profile) throw new Error(`No profile for @${username}`)
    const list = await ctx.db
      .query('lists')
      .withIndex('by_userId_and_kind', (q) => q.eq('userId', profile.userId).eq('kind', 'watched'))
      .unique()
    if (!list) throw new Error(`@${username} has no Watched list`)
    const items = await ctx.db
      .query('listItems')
      .withIndex('by_listId', (q) => q.eq('listId', list._id))
      .collect()
    const latest = items.reduce((m, i) => Math.max(m, i.addedAt), 0)
    await ctx.db.patch(list._id, {
      itemCount: items.length,
      lastItemAddedAt: latest || undefined
    })
    return { itemCount: items.length }
  }
})

// Start an IMDb Import for a dev user without going through the UI.
//   npx convex run devSeed:connectImdb '{"username":"sicem","link":"https://www.imdb.com/user/p.xxx"}'
export const connectImdb = internalMutation({
  args: { username: v.string(), link: v.string() },
  handler: async (ctx, { username, link }) => {
    const profile = await ctx.db
      .query('profiles')
      .withIndex('by_username', (q) => q.eq('username', username))
      .unique()
    if (!profile) throw new Error(`No profile for @${username}`)
    const profileId = parseProfileId(link)
    if (!profileId) throw new Error('invalid-link')
    const existing = await ctx.db
      .query('imdbAccounts')
      .withIndex('by_userId', (q) => q.eq('userId', profile.userId))
      .unique()
    const runId = crypto.randomUUID()
    const fields = {
      link,
      imdbUserId: profileId.startsWith('ur') ? profileId : undefined,
      status: 'running' as const,
      runId,
      progress: undefined,
      error: undefined,
      tally: { ratings: 0, watchlist: 0, lists: 0, unmatched: [] }
    }
    if (existing) await ctx.db.patch(existing._id, fields)
    else
      await ctx.db.insert('imdbAccounts', {
        userId: profile.userId,
        ...fields,
        createdAt: Date.now()
      })
    await ctx.scheduler.runAfter(0, internal.imdbImport.start, {
      userId: profile.userId,
      runId,
      profileId,
      scope: 'all'
    })
    return { userId: profile.userId, runId }
  }
})

export const imdbStatus = internalQuery({
  args: { username: v.string() },
  handler: async (ctx, { username }) => {
    const profile = await ctx.db
      .query('profiles')
      .withIndex('by_username', (q) => q.eq('username', username))
      .unique()
    if (!profile) return null
    const account = await ctx.db
      .query('imdbAccounts')
      .withIndex('by_userId', (q) => q.eq('userId', profile.userId))
      .unique()
    if (!account) return null
    const { tally, lastRun, ...rest } = account
    return {
      ...rest,
      tally: tally ? { ...tally, unmatched: tally.unmatched.length } : undefined,
      lastRun: lastRun
        ? {
            ...lastRun,
            unmatchedCount: lastRun.unmatched.length,
            unmatched: lastRun.unmatched.slice(0, 15)
          }
        : undefined
    }
  }
})

// Queue public lists for a dev user's IMDb Import, as the app does after reading the lists page.
//   npx convex run devSeed:addImdbLists '{"username":"sicem","imdbListIds":["ls055592025"]}'
export const addImdbLists = internalMutation({
  args: { username: v.string(), imdbListIds: v.array(v.string()) },
  handler: async (ctx, { username, imdbListIds }) => {
    const profile = await ctx.db
      .query('profiles')
      .withIndex('by_username', (q) => q.eq('username', username))
      .unique()
    if (!profile) throw new Error(`No profile for @${username}`)
    const account = await ctx.db
      .query('imdbAccounts')
      .withIndex('by_userId', (q) => q.eq('userId', profile.userId))
      .unique()
    if (!account) throw new Error('not-connected')
    const known = new Set((account.lists ?? []).map((l) => l.imdbListId))
    const lists = (account.lists ?? []).concat(
      imdbListIds
        .filter((id) => !known.has(id))
        .map((imdbListId) => ({ imdbListId, name: '', markWatched: false }))
    )
    const profileId = parseProfileId(account.link)
    if (!profileId) throw new Error('invalid-link')
    const runId = crypto.randomUUID()
    await ctx.db.patch(account._id, {
      lists,
      listsDiscovery: 'found',
      status: 'running',
      runId,
      progress: undefined,
      error: undefined,
      tally: { ratings: 0, watchlist: 0, lists: 0, unmatched: [] }
    })
    await ctx.scheduler.runAfter(0, internal.imdbImport.start, {
      userId: profile.userId,
      runId,
      profileId,
      scope: 'lists'
    })
    return { runId, lists: lists.length }
  }
})

// Wipe a dev user's ratings and Watched list so an import can be re-tested from zero.
//   npx convex run devSeed:clearRatingsAndWatched '{"username":"0x5ab7d90"}'
export const clearRatingsAndWatched = internalMutation({
  args: { username: v.string() },
  handler: async (ctx, { username }) => {
    const profile = await ctx.db
      .query('profiles')
      .withIndex('by_username', (q) => q.eq('username', username))
      .unique()
    if (!profile) throw new Error(`No profile for @${username}`)
    const ratings = await ctx.db
      .query('ratings')
      .withIndex('by_userId', (q) => q.eq('userId', profile.userId))
      .collect()
    for (const r of ratings) await ctx.db.delete(r._id)
    const watched = await ctx.db
      .query('lists')
      .withIndex('by_userId_and_kind', (q) => q.eq('userId', profile.userId).eq('kind', 'watched'))
      .unique()
    let items = 0
    if (watched) {
      const rows = await ctx.db
        .query('listItems')
        .withIndex('by_listId', (q) => q.eq('listId', watched._id))
        .collect()
      for (const row of rows) await ctx.db.delete(row._id)
      items = rows.length
      await ctx.db.patch(watched._id, { itemCount: 0, lastItemAddedAt: undefined })
    }
    return { ratings: ratings.length, watched: items }
  }
})

// Delete a dev user's custom lists (items, pins and order rows included). Favorites and
// Watched are untouched; use clearRatingsAndWatched for those.
//   npx convex run devSeed:clearCustomLists '{"username":"0x5ab7d90"}'
export const clearCustomLists = internalMutation({
  args: { username: v.string() },
  handler: async (ctx, { username }) => {
    const profile = await ctx.db
      .query('profiles')
      .withIndex('by_username', (q) => q.eq('username', username))
      .unique()
    if (!profile) throw new Error(`No profile for @${username}`)
    const lists = await ctx.db
      .query('lists')
      .withIndex('by_userId_and_kind', (q) => q.eq('userId', profile.userId).eq('kind', 'custom'))
      .collect()
    let items = 0
    for (const list of lists) {
      const rows = await ctx.db
        .query('listItems')
        .withIndex('by_listId', (q) => q.eq('listId', list._id))
        .collect()
      for (const row of rows) await ctx.db.delete(row._id)
      items += rows.length
      const pin = await ctx.db
        .query('listPins')
        .withIndex('by_userId_and_listId', (q) =>
          q.eq('userId', profile.userId).eq('listId', list._id)
        )
        .unique()
      if (pin) await ctx.db.delete(pin._id)
      const order = await ctx.db
        .query('listOrder')
        .withIndex('by_userId_and_listId', (q) =>
          q.eq('userId', profile.userId).eq('listId', list._id)
        )
        .unique()
      if (order) await ctx.db.delete(order._id)
      await ctx.db.delete(list._id)
    }
    return { lists: lists.length, items }
  }
})
