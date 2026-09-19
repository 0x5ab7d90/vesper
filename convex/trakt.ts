import { getAuthUserId } from '@convex-dev/auth/server'
import { v } from 'convex/values'
import { internal } from './_generated/api'
import type { Doc, Id } from './_generated/dataModel'
import {
  httpAction,
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  query
} from './_generated/server'
import { mediaTypeValidator } from './schema'

const TRAKT_API = 'https://api.trakt.tv'
const AUTHORIZE = 'https://trakt.tv/oauth/authorize'

function clientId(): string {
  const id = process.env.TRAKT_CLIENT_ID
  if (!id) throw new Error('TRAKT_CLIENT_ID not configured')
  return id
}

function clientSecret(): string {
  const secret = process.env.TRAKT_CLIENT_SECRET
  if (!secret) throw new Error('TRAKT_CLIENT_SECRET not configured')
  return secret
}

function redirectUri(): string {
  const site = process.env.CONVEX_SITE_URL
  if (!site) throw new Error('CONVEX_SITE_URL not configured')
  return `${site.replace(/\/$/, '')}/trakt/callback`
}

function traktHeaders(accessToken?: string): Record<string, string> {
  const h: Record<string, string> = {
    'Content-Type': 'application/json',
    'trakt-api-version': '2',
    'trakt-api-key': clientId()
  }
  if (accessToken) h.Authorization = `Bearer ${accessToken}`
  return h
}

interface TokenResponse {
  access_token: string
  refresh_token: string
  expires_in: number
  scope?: string
}

// Convex action ctx — typed loosely to avoid threading generated generics through helpers.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ActionCtx = any

interface TraktIds {
  trakt?: number
  imdb?: string
  tmdb?: number
}

// 1–10 (Trakt, IMDb) → 1–5 (Vesper), rounded and clamped. One rule for every ten-point
// source, so a 7 means the same thing wherever it came from.
export function tenToFive(rating: number): number {
  return Math.min(5, Math.max(1, Math.round(rating / 2)))
}

// Trakt only sends ids, so imported titles need their poster looked up on TMDB.
async function tmdbPoster(mediaType: 'movie' | 'tv', tmdbId: number): Promise<string | null> {
  const key = (process.env.TMDB_API_KEYS ?? process.env.TMDB_API_KEY ?? '').split(',')[0]?.trim()
  if (!key) return null
  const res = await fetch(
    `https://api.themoviedb.org/3/${mediaType}/${tmdbId}?api_key=${key}`
  ).catch(() => null)
  if (!res?.ok) return null
  const json = (await res.json()) as { poster_path?: string | null }
  return json.poster_path ?? null
}

async function backfillPoster(
  ctx: ActionCtx,
  userId: Id<'users'>,
  mediaType: 'movie' | 'tv',
  tmdbId: number
): Promise<void> {
  const posterPath = await tmdbPoster(mediaType, tmdbId)
  if (!posterPath) return
  await ctx.runMutation(internal.ratings.setWatchedPoster, {
    userId,
    mediaType,
    tmdbId,
    posterPath
  })
}

// ─── public ────────────────────────────────────────────────────────────────

export const startConnect = mutation({
  args: {},
  handler: async (ctx): Promise<{ url: string }> => {
    const userId = await getAuthUserId(ctx)
    if (userId === null) throw new Error('Not authenticated')
    const state = crypto.randomUUID()
    await ctx.db.insert('traktOauthState', { state, userId, createdAt: Date.now() })
    const url = new URL(AUTHORIZE)
    url.searchParams.set('response_type', 'code')
    url.searchParams.set('client_id', clientId())
    url.searchParams.set('redirect_uri', redirectUri())
    url.searchParams.set('state', state)
    return { url: url.toString() }
  }
})

export const connection = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx)
    if (userId === null) return null
    const account = await ctx.db
      .query('traktAccounts')
      .withIndex('by_userId', (q) => q.eq('userId', userId))
      .unique()
    if (!account) return null
    return {
      username: account.traktUsername,
      avatarUrl: account.avatarUrl,
      syncWatched: account.syncWatched,
      syncRatings: account.syncRatings,
      lastSyncedAt: account.lastSyncedAt
    }
  }
})

export const setSyncPrefs = mutation({
  args: { syncWatched: v.optional(v.boolean()), syncRatings: v.optional(v.boolean()) },
  handler: async (ctx, { syncWatched, syncRatings }) => {
    const userId = await getAuthUserId(ctx)
    if (userId === null) throw new Error('Not authenticated')
    const account = await ctx.db
      .query('traktAccounts')
      .withIndex('by_userId', (q) => q.eq('userId', userId))
      .unique()
    if (!account) throw new Error('Trakt not connected')
    await ctx.db.patch(account._id, {
      ...(syncWatched !== undefined ? { syncWatched } : {}),
      ...(syncRatings !== undefined ? { syncRatings } : {})
    })
  }
})

export const disconnect = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx)
    if (userId === null) throw new Error('Not authenticated')
    const account = await ctx.db
      .query('traktAccounts')
      .withIndex('by_userId', (q) => q.eq('userId', userId))
      .unique()
    if (!account) return
    await ctx.scheduler.runAfter(0, internal.trakt.revoke, { token: account.accessToken })
    await ctx.db.delete(account._id)
  }
})

// ─── OAuth callback (http) ───────────────────────────────────────────────────

function callbackPage(message: string, redirect: boolean): Response {
  const body = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Vesper × Trakt</title><style>
html,body{height:100%;margin:0;background:#000;color:#fff;font-family:-apple-system,system-ui,sans-serif}
.wrap{height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;text-align:center;padding:24px}
.msg{font-size:15px;font-weight:560;color:#e6e6e6}.sub{font-size:13px;color:#7f7f7f}
a{color:#fff;font-size:13px;font-weight:600;text-decoration:none;border:1px solid rgba(255,255,255,.18);border-radius:10px;padding:9px 16px}
</style></head><body><div class="wrap"><div class="msg">${message}</div>
<div class="sub">You can return to Vesper.</div><a href="vesper://settings">Open Vesper</a></div>
${redirect ? '<script>setTimeout(function(){location.href="vesper://settings"},400)</script>' : ''}
</body></html>`
  return new Response(body, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
}

export const oauthCallback = httpAction(async (ctx, request) => {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  if (!code || !state) return callbackPage('Connection cancelled.', false)

  const userId = await ctx.runQuery(internal.trakt.stateLookup, { state })
  if (!userId) return callbackPage('This link has expired. Try connecting again.', false)
  await ctx.runMutation(internal.trakt.consumeState, { state })

  const tokenRes = await fetch(`${TRAKT_API}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      code,
      client_id: clientId(),
      client_secret: clientSecret(),
      redirect_uri: redirectUri(),
      grant_type: 'authorization_code'
    })
  })
  if (!tokenRes.ok) {
    console.error(`[trakt] token exchange ${tokenRes.status}`)
    return callbackPage('Could not connect to Trakt. Try again.', false)
  }
  const tokens = (await tokenRes.json()) as TokenResponse

  let username = 'trakt'
  let avatarUrl: string | undefined
  const settingsRes = await fetch(`${TRAKT_API}/users/settings`, {
    headers: traktHeaders(tokens.access_token)
  })
  if (settingsRes.ok) {
    const settings = (await settingsRes.json()) as {
      user?: { username?: string; images?: { avatar?: { full?: string } } }
    }
    username = settings.user?.username ?? username
    avatarUrl = settings.user?.images?.avatar?.full
  }

  await ctx.runMutation(internal.trakt.upsertAccount, {
    userId,
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresAt: Date.now() + tokens.expires_in * 1000,
    scope: tokens.scope,
    traktUsername: username,
    avatarUrl
  })
  await ctx.scheduler.runAfter(0, internal.trakt.runSync, { userId })
  return callbackPage('Connected to Trakt.', true)
})

// ─── internal: state + account storage ───────────────────────────────────────

export const stateLookup = internalQuery({
  args: { state: v.string() },
  handler: async (ctx, { state }): Promise<Id<'users'> | null> => {
    const row = await ctx.db
      .query('traktOauthState')
      .withIndex('by_state', (q) => q.eq('state', state))
      .unique()
    return row?.userId ?? null
  }
})

export const consumeState = internalMutation({
  args: { state: v.string() },
  handler: async (ctx, { state }) => {
    const row = await ctx.db
      .query('traktOauthState')
      .withIndex('by_state', (q) => q.eq('state', state))
      .unique()
    if (row) await ctx.db.delete(row._id)
  }
})

export const upsertAccount = internalMutation({
  args: {
    userId: v.id('users'),
    accessToken: v.string(),
    refreshToken: v.string(),
    expiresAt: v.number(),
    scope: v.optional(v.string()),
    traktUsername: v.string(),
    avatarUrl: v.optional(v.string())
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query('traktAccounts')
      .withIndex('by_userId', (q) => q.eq('userId', args.userId))
      .unique()
    if (existing) {
      await ctx.db.patch(existing._id, {
        accessToken: args.accessToken,
        refreshToken: args.refreshToken,
        expiresAt: args.expiresAt,
        scope: args.scope,
        traktUsername: args.traktUsername,
        avatarUrl: args.avatarUrl
      })
      return
    }
    await ctx.db.insert('traktAccounts', {
      ...args,
      syncWatched: true,
      syncRatings: true,
      createdAt: Date.now()
    })
  }
})

export const accountByUser = internalQuery({
  args: { userId: v.id('users') },
  handler: async (ctx, { userId }): Promise<Doc<'traktAccounts'> | null> =>
    ctx.db
      .query('traktAccounts')
      .withIndex('by_userId', (q) => q.eq('userId', userId))
      .unique()
})

export const patchTokens = internalMutation({
  args: {
    userId: v.id('users'),
    accessToken: v.string(),
    refreshToken: v.string(),
    expiresAt: v.number()
  },
  handler: async (ctx, { userId, accessToken, refreshToken, expiresAt }) => {
    const account = await ctx.db
      .query('traktAccounts')
      .withIndex('by_userId', (q) => q.eq('userId', userId))
      .unique()
    if (account) await ctx.db.patch(account._id, { accessToken, refreshToken, expiresAt })
  }
})

export const touchSynced = internalMutation({
  args: { userId: v.id('users') },
  handler: async (ctx, { userId }) => {
    const account = await ctx.db
      .query('traktAccounts')
      .withIndex('by_userId', (q) => q.eq('userId', userId))
      .unique()
    if (account) await ctx.db.patch(account._id, { lastSyncedAt: Date.now() })
  }
})

// ─── internal: token refresh ─────────────────────────────────────────────────

async function freshToken(ctx: ActionCtx, account: Doc<'traktAccounts'>): Promise<string> {
  if (account.expiresAt - Date.now() > 60_000) return account.accessToken
  const res = await fetch(`${TRAKT_API}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      refresh_token: account.refreshToken,
      client_id: clientId(),
      client_secret: clientSecret(),
      redirect_uri: redirectUri(),
      grant_type: 'refresh_token'
    })
  })
  if (!res.ok) throw new Error(`Trakt token refresh ${res.status}`)
  const tokens = (await res.json()) as TokenResponse
  const expiresAt = Date.now() + tokens.expires_in * 1000
  await ctx.runMutation(internal.trakt.patchTokens, {
    userId: account.userId,
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresAt
  })
  return tokens.access_token
}

export const revoke = internalAction({
  args: { token: v.string() },
  handler: async (_ctx, { token }) => {
    await fetch(`${TRAKT_API}/oauth/revoke`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token,
        client_id: clientId(),
        client_secret: clientSecret()
      })
    }).catch((err) => console.warn('[trakt] revoke failed', err))
  }
})

// ─── internal: sync engine ───────────────────────────────────────────────────

export const runSync = internalAction({
  args: { userId: v.id('users') },
  handler: async (ctx, { userId }): Promise<void> => {
    const account = await ctx.runQuery(internal.trakt.accountByUser, { userId })
    if (!account) return
    const token = await freshToken(ctx, account)
    if (account.syncRatings) await reconcileRatings(ctx, userId, token)
    if (account.syncWatched) await reconcileWatched(ctx, userId, token)
    await ctx.runMutation(internal.trakt.touchSynced, { userId })
  }
})

interface TraktRatingRow {
  rated_at: string
  rating: number
  movie?: { title: string; ids: TraktIds }
  show?: { title: string; ids: TraktIds }
}

async function reconcileRatings(ctx: ActionCtx, userId: Id<'users'>, token: string): Promise<void> {
  const headers = traktHeaders(token)
  const [moviesRes, showsRes] = await Promise.all([
    fetch(`${TRAKT_API}/sync/ratings/movies`, { headers }),
    fetch(`${TRAKT_API}/sync/ratings/shows`, { headers })
  ])
  if (!moviesRes.ok || !showsRes.ok) throw new Error('Trakt ratings fetch failed')
  const movies = (await moviesRes.json()) as TraktRatingRow[]
  const shows = (await showsRes.json()) as TraktRatingRow[]

  const traktByKey = new Map<string, { rating: number; ratedAt: number }>()
  const pull: Array<{
    mediaType: 'movie' | 'tv'
    tmdbId: number
    score: number
    updatedAt: number
    title: string
  }> = []
  for (const [rows, mediaType, obj] of [
    [movies, 'movie', 'movie'],
    [shows, 'tv', 'show']
  ] as const) {
    for (const row of rows) {
      const node = obj === 'movie' ? row.movie : row.show
      const tmdbId = node?.ids.tmdb
      if (!tmdbId) continue
      const ratedAt = Date.parse(row.rated_at)
      traktByKey.set(`${mediaType}:${tmdbId}`, { rating: row.rating, ratedAt })
      pull.push({
        mediaType,
        tmdbId,
        score: tenToFive(row.rating),
        updatedAt: ratedAt,
        title: node?.title ?? ''
      })
    }
  }
  for (const p of pull) {
    const missingPoster = await ctx.runMutation(internal.ratings.applyExternalRating, {
      ...p,
      userId
    })
    if (missingPoster) await backfillPoster(ctx, userId, p.mediaType, p.tmdbId)
  }

  const mine = (await ctx.runQuery(internal.ratings.allForUser, { userId })) as Array<{
    mediaType: 'movie' | 'tv'
    tmdbId: number
    score: number
    updatedAt: number
  }>
  const pushMovies: Array<{ rating: number; rated_at: string; ids: { tmdb: number } }> = []
  const pushShows: Array<{ rating: number; rated_at: string; ids: { tmdb: number } }> = []
  for (const r of mine) {
    const remote = traktByKey.get(`${r.mediaType}:${r.tmdbId}`)
    if (remote && remote.ratedAt >= r.updatedAt) continue
    const entry = {
      rating: Math.min(10, Math.max(1, r.score * 2)),
      rated_at: new Date(r.updatedAt).toISOString(),
      ids: { tmdb: r.tmdbId }
    }
    if (r.mediaType === 'movie') pushMovies.push(entry)
    else pushShows.push(entry)
  }
  if (pushMovies.length || pushShows.length) {
    await fetch(`${TRAKT_API}/sync/ratings`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ movies: pushMovies, shows: pushShows })
    })
  }
}

interface TraktWatchedRow {
  movie?: { title: string; ids: TraktIds }
  show?: { title: string; ids: TraktIds }
}

async function reconcileWatched(ctx: ActionCtx, userId: Id<'users'>, token: string): Promise<void> {
  const headers = traktHeaders(token)
  const [moviesRes, showsRes] = await Promise.all([
    fetch(`${TRAKT_API}/sync/watched/movies`, { headers }),
    fetch(`${TRAKT_API}/sync/watched/shows`, { headers })
  ])
  if (!moviesRes.ok || !showsRes.ok) throw new Error('Trakt watched fetch failed')
  const movies = (await moviesRes.json()) as TraktWatchedRow[]
  const shows = (await showsRes.json()) as TraktWatchedRow[]

  const remoteKeys = new Set<string>()
  for (const [rows, mediaType, obj] of [
    [movies, 'movie', 'movie'],
    [shows, 'tv', 'show']
  ] as const) {
    for (const row of rows) {
      const node = obj === 'movie' ? row.movie : row.show
      const tmdbId = node?.ids.tmdb
      if (!tmdbId) continue
      remoteKeys.add(`${mediaType}:${tmdbId}`)
      const missingPoster = await ctx.runMutation(internal.ratings.addExternalWatched, {
        userId,
        mediaType,
        tmdbId,
        title: node?.title ?? ''
      })
      if (missingPoster) await backfillPoster(ctx, userId, mediaType, tmdbId)
    }
  }

  const mine = (await ctx.runQuery(internal.ratings.watchedForUser, { userId })) as Array<{
    mediaType: 'movie' | 'tv'
    tmdbId: number
  }>
  const pushMovies: Array<{ ids: { tmdb: number } }> = []
  const pushShows: Array<{ ids: { tmdb: number } }> = []
  for (const w of mine) {
    if (remoteKeys.has(`${w.mediaType}:${w.tmdbId}`)) continue
    if (w.mediaType === 'movie') pushMovies.push({ ids: { tmdb: w.tmdbId } })
    else pushShows.push({ ids: { tmdb: w.tmdbId } })
  }
  if (pushMovies.length || pushShows.length) {
    await fetch(`${TRAKT_API}/sync/history`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ movies: pushMovies, shows: pushShows })
    })
  }
}

// ─── internal: instant rating push ──────────────────────────────────────────

export const pushRating = internalAction({
  args: {
    userId: v.id('users'),
    mediaType: mediaTypeValidator,
    tmdbId: v.number(),
    score: v.optional(v.number()),
    updatedAt: v.number()
  },
  handler: async (ctx, { userId, mediaType, tmdbId, score, updatedAt }) => {
    const account = await ctx.runQuery(internal.trakt.accountByUser, { userId })
    if (!account || !account.syncRatings) return
    const token = await freshToken(ctx, account)
    const removing = score === undefined
    const entry = removing
      ? { ids: { tmdb: tmdbId } }
      : {
          rating: Math.min(10, Math.max(1, score * 2)),
          rated_at: new Date(updatedAt).toISOString(),
          ids: { tmdb: tmdbId }
        }
    const body = mediaType === 'movie' ? { movies: [entry] } : { shows: [entry] }
    const res = await fetch(`${TRAKT_API}/sync/ratings${removing ? '/remove' : ''}`, {
      method: 'POST',
      headers: traktHeaders(token),
      body: JSON.stringify(body)
    })
    if (!res.ok) console.warn(`[trakt] rating push ${res.status}`)
  }
})

export const pushWatched = internalAction({
  args: {
    userId: v.id('users'),
    mediaType: mediaTypeValidator,
    tmdbId: v.number()
  },
  handler: async (ctx, { userId, mediaType, tmdbId }) => {
    const account = await ctx.runQuery(internal.trakt.accountByUser, { userId })
    if (!account || !account.syncWatched) return
    const token = await freshToken(ctx, account)
    const entry = { ids: { tmdb: tmdbId } }
    const body = mediaType === 'movie' ? { movies: [entry] } : { shows: [entry] }
    const res = await fetch(`${TRAKT_API}/sync/history`, {
      method: 'POST',
      headers: traktHeaders(token),
      body: JSON.stringify(body)
    })
    if (!res.ok) console.warn(`[trakt] watched push ${res.status}`)
  }
})

export const pushFavorite = internalAction({
  args: {
    userId: v.id('users'),
    mediaType: mediaTypeValidator,
    tmdbId: v.number(),
    remove: v.optional(v.boolean())
  },
  handler: async (ctx, { userId, mediaType, tmdbId, remove }) => {
    const account = await ctx.runQuery(internal.trakt.accountByUser, { userId })
    if (!account) return
    const token = await freshToken(ctx, account)
    const entry = { ids: { tmdb: tmdbId } }
    const body = mediaType === 'movie' ? { movies: [entry] } : { shows: [entry] }
    const res = await fetch(`${TRAKT_API}/sync/favorites${remove ? '/remove' : ''}`, {
      method: 'POST',
      headers: traktHeaders(token),
      body: JSON.stringify(body)
    })
    if (!res.ok) console.warn(`[trakt] favorite ${remove ? 'remove' : 'add'} ${res.status}`)
  }
})

// ─── internal: live scrobble ─────────────────────────────────────────────────

export const scrobble = internalAction({
  args: {
    userId: v.id('users'),
    action: v.union(v.literal('start'), v.literal('pause'), v.literal('stop')),
    imdbId: v.string(),
    mediaType: mediaTypeValidator,
    season: v.optional(v.number()),
    episode: v.optional(v.number()),
    progress: v.number()
  },
  handler: async (ctx, { userId, action, imdbId, mediaType, season, episode, progress }) => {
    const account = await ctx.runQuery(internal.trakt.accountByUser, { userId })
    if (!account || !account.syncWatched) return
    const token = await freshToken(ctx, account)
    const body: Record<string, unknown> = { progress: Math.min(100, Math.max(0, progress)) }
    if (mediaType === 'movie') {
      body.movie = { ids: { imdb: imdbId } }
    } else {
      body.show = { ids: { imdb: imdbId } }
      body.episode = { season, number: episode }
    }
    const res = await fetch(`${TRAKT_API}/scrobble/${action}`, {
      method: 'POST',
      headers: traktHeaders(token),
      body: JSON.stringify(body)
    })
    // 409 = already scrobbled recently; not an error worth surfacing.
    if (!res.ok && res.status !== 409) {
      console.warn(`[trakt] scrobble ${action} ${res.status}`)
    }
  }
})
