import { v, type Infer } from 'convex/values'
import { internal } from './_generated/api'
import { parseProfileId } from './imdb'
import type { Doc } from './_generated/dataModel'
import { internalAction, internalMutation, internalQuery } from './_generated/server'
import { ensureWatchedItem } from './ratings'
import { presence } from './presence'
import { mediaTypeValidator, showcaseItemValidator } from './schema'

// Dev-only helpers for eyeballing friend activity UI. Not reachable from clients; run with
//   npx convex run devSeed:simulateWatching '{"username":"sicem","remainingTicks":30}'
// Each tick re-heartbeats presence and nudges playback forward, so the friend reads as
// "watching" (which needs a playback update within the last minute) until ticks run out.

const ROOM = 'vesper'
const TICK_MS = 20_000
const SESSION = 'dev-simulate-watching'

// What the simulated session is playing. Interstellar by default, so posters and progress look
// real without hitting TMDB; simulateWatchingTitle fills one of these from TMDB for any title.
const mediaValidator = v.object({
  imdbId: v.string(),
  tmdbId: v.number(),
  mediaType: mediaTypeValidator,
  title: v.string(),
  posterPath: v.optional(v.string()),
  backdropPath: v.optional(v.string()),
  durationSec: v.number(),
  season: v.optional(v.number()),
  episode: v.optional(v.number()),
  episodeLabel: v.optional(v.string())
})
type Media = Infer<typeof mediaValidator>

const TITLE: Media = {
  imdbId: 'tt0816692',
  tmdbId: 157336,
  mediaType: 'movie',
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
    state: v.optional(v.union(v.literal('playing'), v.literal('paused'))),
    media: v.optional(mediaValidator)
  },
  handler: async (
    ctx,
    { username, remainingTicks = 30, positionSec = 3600, state = 'playing', media = TITLE }
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
          .eq('imdbId', media.imdbId)
          .eq('season', media.season)
          .eq('episode', media.episode)
      )
      .unique()
    const patch = {
      positionSec,
      durationSec: media.durationSec,
      state,
      title: media.title,
      tmdbId: media.tmdbId,
      posterPath: media.posterPath,
      backdropPath: media.backdropPath,
      episodeLabel: media.episodeLabel,
      updatedAt: Date.now()
    }
    if (existing) await ctx.db.patch(existing._id, patch)
    else {
      await ctx.db.insert('playbackProgress', {
        userId,
        imdbId: media.imdbId,
        mediaType: media.mediaType,
        season: media.season,
        episode: media.episode,
        ...patch
      })
    }

    if (remainingTicks > 0) {
      await ctx.scheduler.runAfter(TICK_MS, internal.devSeed.simulateWatching, {
        username,
        remainingTicks: remainingTicks - 1,
        positionSec: positionSec + (state === 'playing' ? TICK_MS / 1000 : 0),
        state,
        media
      })
    }
    return { userId, positionSec, remainingTicks }
  }
})

// Simulate watching any title, looked up on TMDB. A movie by id, or a show with a season and
// episode so the episode line shows too.
//   npx convex run devSeed:simulateWatchingTitle '{"username":"sicem","mediaType":"tv","tmdbId":1396,"season":3,"episode":7,"positionSec":900}'
//   npx convex run devSeed:simulateWatchingTitle '{"username":"sicem","mediaType":"movie","tmdbId":27205}'
export const simulateWatchingTitle = internalAction({
  args: {
    username: v.string(),
    mediaType: mediaTypeValidator,
    tmdbId: v.number(),
    season: v.optional(v.number()),
    episode: v.optional(v.number()),
    remainingTicks: v.optional(v.number()),
    positionSec: v.optional(v.number()),
    state: v.optional(v.union(v.literal('playing'), v.literal('paused')))
  },
  handler: async (
    ctx,
    { username, mediaType, tmdbId, season, episode, ...rest }
  ): Promise<void> => {
    const key = (process.env.TMDB_API_KEYS ?? process.env.TMDB_API_KEY ?? '').split(',')[0]?.trim()
    if (!key) throw new Error('No TMDB key on this deployment')
    const get = async <T>(path: string): Promise<T> => {
      const url = new URL(`https://api.themoviedb.org/3${path}`)
      url.searchParams.set('api_key', key)
      const res = await fetch(url)
      if (!res.ok) throw new Error(`TMDB ${res.status} for ${path}`)
      return (await res.json()) as T
    }
    const details = await get<{
      title?: string
      name?: string
      poster_path?: string | null
      backdrop_path?: string | null
      runtime?: number | null
      episode_run_time?: number[]
      external_ids?: { imdb_id?: string | null }
    }>(`/${mediaType}/${tmdbId}?append_to_response=external_ids`)
    // New titles often have no IMDb id on TMDB yet; the row only needs a stable key.
    const imdbId = details.external_ids?.imdb_id ?? `tmdb:${mediaType}:${tmdbId}`

    let durationSec = (details.runtime ?? details.episode_run_time?.[0] ?? 45) * 60
    let episodeLabel: string | undefined
    if (mediaType === 'tv' && season !== undefined && episode !== undefined) {
      const ep = await get<{ name?: string; runtime?: number | null }>(
        `/tv/${tmdbId}/season/${season}/episode/${episode}`
      )
      episodeLabel = ep.name ?? undefined
      if (ep.runtime) durationSec = ep.runtime * 60
    }

    const media: Media = {
      imdbId,
      tmdbId,
      mediaType,
      title: details.title ?? details.name ?? String(tmdbId),
      posterPath: details.poster_path ?? undefined,
      backdropPath: details.backdrop_path ?? undefined,
      durationSec,
      season: mediaType === 'tv' ? season : undefined,
      episode: mediaType === 'tv' ? episode : undefined,
      episodeLabel
    }
    await ctx.runMutation(internal.devSeed.stopSimulating, { username })
    await ctx.runMutation(internal.devSeed.simulateWatching, { username, media, ...rest })
  }
})

// Cancel every pending simulateWatching tick for a user and mark their simulated rows idle, so
// two loops never fight over what they are "watching". Runs before each new simulation.
//   npx convex run devSeed:stopSimulating '{"username":"sicem"}'
export const stopSimulating = internalMutation({
  args: { username: v.string() },
  handler: async (ctx, { username }) => {
    const pending = await ctx.db.system
      .query('_scheduled_functions')
      .filter((q) => q.eq(q.field('state.kind'), 'pending'))
      .collect()
    let cancelled = 0
    for (const job of pending) {
      const arg = job.args[0] as { username?: string } | undefined
      if (job.name === 'devSeed.js:simulateWatching' && arg?.username === username) {
        await ctx.scheduler.cancel(job._id)
        cancelled += 1
      }
    }
    const profile = await ctx.db
      .query('profiles')
      .withIndex('by_username', (q) => q.eq('username', username))
      .unique()
    let idled = 0
    if (profile) {
      const rows = await ctx.db
        .query('playbackProgress')
        .withIndex('by_userId_and_updatedAt', (q) => q.eq('userId', profile.userId))
        .collect()
      for (const row of rows) {
        if (row.state && row.state !== 'idle') {
          await ctx.db.patch(row._id, { state: 'idle' })
          idled += 1
        }
      }
    }
    return { cancelled, idled }
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

// Grant (or revoke) a hand-given badge. Works against prod with --prod.
//   npx convex run devSeed:grantBadge '{"username":"0x5ab7d90","badge":"dev"}'
export const grantBadge = internalMutation({
  args: { username: v.string(), badge: v.string(), revoke: v.optional(v.boolean()) },
  handler: async (ctx, { username, badge, revoke }) => {
    const profile = await ctx.db
      .query('profiles')
      .withIndex('by_username', (q) => q.eq('username', username))
      .unique()
    if (!profile) throw new Error(`No profile for @${username}`)
    const current = new Set(profile.badges ?? [])
    if (revoke) current.delete(badge)
    else current.add(badge)
    const badges = [...current]
    await ctx.db.patch(profile._id, { badges })
    return { username, badges }
  }
})

// Empty a dev user's Favorites (the liked list) and showcase, for looking at empty states.
//   npx convex run devSeed:clearFavorites '{"username":"sicem"}'
export const clearFavorites = internalMutation({
  args: { username: v.string() },
  handler: async (ctx, { username }) => {
    const profile = await ctx.db
      .query('profiles')
      .withIndex('by_username', (q) => q.eq('username', username))
      .unique()
    if (!profile) throw new Error(`No profile for @${username}`)
    const liked = await ctx.db
      .query('lists')
      .withIndex('by_userId_and_kind', (q) => q.eq('userId', profile.userId).eq('kind', 'liked'))
      .unique()
    let items = 0
    if (liked) {
      const rows = await ctx.db
        .query('listItems')
        .withIndex('by_listId', (q) => q.eq('listId', liked._id))
        .collect()
      for (const row of rows) await ctx.db.delete(row._id)
      items = rows.length
      await ctx.db.patch(liked._id, { itemCount: 0, lastItemAddedAt: undefined })
    }
    await ctx.db.patch(profile._id, { showcase: undefined })
    return { favorites: items }
  }
})

// Give a dev user a taste that overlaps someone else's, so the taste match on their profile has
// something to say: most of `like`'s ratings echoed back (a few off by a star or two), a few
// top-rated titles `like` has not seen rated highly, some Favorites, and a public Watchlist.
//   npx convex run devSeed:seedTaste '{"username":"sicem","like":"0x5ab7d90"}'
const seedTitleValidator = v.object({
  mediaType: mediaTypeValidator,
  tmdbId: v.number(),
  title: v.string(),
  posterPath: v.optional(v.string())
})
type SeedTitle = Infer<typeof seedTitleValidator>

// Stars added to each echoed rating, in turn: mostly agreement, some drift, one real clash.
const DRIFT = [0, 0, 1, 0, -1, 0, 0, -2, 1, 0, 0, -1]

export const tasteSource = internalQuery({
  args: { username: v.string() },
  handler: async (ctx, { username }) => {
    const profile = await ctx.db
      .query('profiles')
      .withIndex('by_username', (q) => q.eq('username', username))
      .unique()
    if (!profile) throw new Error(`No profile for @${username}`)
    const items = async (kind: 'liked' | 'watched') => {
      const list = await ctx.db
        .query('lists')
        .withIndex('by_userId_and_kind', (q) => q.eq('userId', profile.userId).eq('kind', kind))
        .unique()
      if (!list) return []
      const rows = await ctx.db
        .query('listItems')
        .withIndex('by_listId', (q) => q.eq('listId', list._id))
        .collect()
      return rows.map(({ mediaType, tmdbId, title, posterPath }) => ({
        mediaType,
        tmdbId,
        title,
        posterPath
      }))
    }
    const [watched, favorites] = await Promise.all([items('watched'), items('liked')])
    const ratings = await ctx.db
      .query('ratings')
      .withIndex('by_userId', (q) => q.eq('userId', profile.userId))
      .order('desc')
      .take(40)
    const byKey = new Map(watched.map((w) => [`${w.mediaType}:${w.tmdbId}`, w]))
    return {
      watched: [...byKey.keys()],
      favorites,
      ratings: ratings.flatMap((r) => {
        const item = byKey.get(`${r.mediaType}:${r.tmdbId}`)
        return item?.posterPath ? [{ ...item, score: r.score }] : []
      })
    }
  }
})

export const seedTaste = internalAction({
  args: { username: v.string(), like: v.string() },
  handler: async (
    ctx,
    { username, like }
  ): Promise<{ ratings: number; favorites: number; watchlist: number }> => {
    const key = (process.env.TMDB_API_KEYS ?? process.env.TMDB_API_KEY ?? '').split(',')[0]?.trim()
    if (!key) throw new Error('No TMDB key on this deployment')
    const source = await ctx.runQuery(internal.devSeed.tasteSource, { username: like })
    const seen = new Set(source.watched)

    // Well-liked titles `like` has not watched, alternating movies and shows.
    const topRated = async (mediaType: 'movie' | 'tv'): Promise<SeedTitle[]> => {
      const url = new URL(`https://api.themoviedb.org/3/${mediaType}/top_rated`)
      url.searchParams.set('api_key', key)
      const res = await fetch(url)
      if (!res.ok) throw new Error(`TMDB ${res.status} for ${mediaType}/top_rated`)
      const data = (await res.json()) as {
        results: Array<{ id: number; title?: string; name?: string; poster_path?: string | null }>
      }
      return data.results
        .filter((r) => r.poster_path && !seen.has(`${mediaType}:${r.id}`))
        .map((r) => ({
          mediaType,
          tmdbId: r.id,
          title: r.title ?? r.name ?? String(r.id),
          posterPath: r.poster_path ?? undefined
        }))
    }
    const [movies, shows] = await Promise.all([topRated('movie'), topRated('tv')])
    const fresh = movies.flatMap((m, i) => (shows[i] ? [m, shows[i]] : [m]))

    const echoed = source.ratings.slice(0, 16).map((r, i) => ({
      ...r,
      score: Math.min(5, Math.max(1, r.score + DRIFT[i % DRIFT.length]!))
    }))
    const loved = fresh.slice(0, 6).map((t) => ({ ...t, score: 5 }))
    const favorites = [
      ...source.favorites.filter((f) => f.posterPath).slice(0, 3),
      ...fresh.slice(0, 3)
    ]
    // Titles `like` favorited without rating still get compared, since a favorite reads as five.
    return await ctx.runMutation(internal.devSeed.applyTaste, {
      username,
      ratings: [...echoed, ...loved],
      favorites,
      watchlist: fresh.slice(6, 16)
    })
  }
})

export const applyTaste = internalMutation({
  args: {
    username: v.string(),
    ratings: v.array(v.object({ ...seedTitleValidator.fields, score: v.number() })),
    favorites: v.array(seedTitleValidator),
    watchlist: v.array(seedTitleValidator)
  },
  handler: async (ctx, { username, ratings, favorites, watchlist }) => {
    const profile = await ctx.db
      .query('profiles')
      .withIndex('by_username', (q) => q.eq('username', username))
      .unique()
    if (!profile) throw new Error(`No profile for @${username}`)
    const userId = profile.userId
    const now = Date.now()

    for (const { score, ...t } of ratings) {
      const existing = await ctx.db
        .query('ratings')
        .withIndex('by_user_and_media', (q) =>
          q.eq('userId', userId).eq('mediaType', t.mediaType).eq('tmdbId', t.tmdbId)
        )
        .unique()
      if (existing) await ctx.db.patch(existing._id, { score, updatedAt: now })
      else
        await ctx.db.insert('ratings', {
          userId,
          mediaType: t.mediaType,
          tmdbId: t.tmdbId,
          score,
          createdAt: now,
          updatedAt: now
        })
      await ensureWatchedItem(ctx, userId, t.mediaType, t.tmdbId, t.title, t.posterPath)
    }

    const fill = async (list: Doc<'lists'>, items: SeedTitle[]): Promise<number> => {
      let added = 0
      for (const t of items) {
        const dupe = await ctx.db
          .query('listItems')
          .withIndex('by_listId_and_media', (q) =>
            q.eq('listId', list._id).eq('mediaType', t.mediaType).eq('tmdbId', t.tmdbId)
          )
          .unique()
        if (dupe) continue
        await ctx.db.insert('listItems', { listId: list._id, addedBy: userId, addedAt: now, ...t })
        added += 1
      }
      await ctx.db.patch(list._id, { itemCount: list.itemCount + added, lastItemAddedAt: now })
      return added
    }
    const listOf = async (kind: 'liked' | 'custom', name: string): Promise<Doc<'lists'>> => {
      const existing = (
        await ctx.db
          .query('lists')
          .withIndex('by_userId_and_kind', (q) => q.eq('userId', userId).eq('kind', kind))
          .collect()
      ).find((l) => kind === 'liked' || l.name === name)
      if (existing) return existing
      const id = await ctx.db.insert('lists', {
        userId,
        name,
        kind,
        visibility: kind === 'liked' ? 'private' : 'public',
        locked: kind === 'liked',
        itemCount: 0,
        createdAt: now
      })
      return (await ctx.db.get(id))!
    }

    return {
      ratings: ratings.length,
      favorites: await fill(await listOf('liked', 'Favorites'), favorites),
      watchlist: await fill(await listOf('custom', 'Watchlist'), watchlist)
    }
  }
})
