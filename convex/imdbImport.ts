'use node'

import type { FunctionReturnType } from 'convex/server'
import { v } from 'convex/values'
import { internal } from './_generated/api'
import type { Id } from './_generated/dataModel'
import { internalAction, type ActionCtx } from './_generated/server'
import { tmdbGet } from './tmdb'
import { tenToFive } from './trakt'

// Everything that talks to IMDb. Its GraphQL endpoint answers unauthenticated requests that
// carry the web client's headers and serves public profiles by `ur` id; `p.` ids from copied
// links resolve through userProfile. Introspection is off, so the shapes below were confirmed
// by hand. A block from IMDb surfaces as `unavailable`, never as a stack trace.

const IMDB_GRAPHQL = 'https://api.graphql.imdb.com/'
const PAGE = 250
const CONCURRENCY = 6

const HEADERS = {
  'content-type': 'application/json',
  accept: 'application/graphql+json, application/json',
  'x-imdb-client-name': 'imdb-web-next-localized',
  'x-imdb-user-country': 'US',
  'x-imdb-user-language': 'en-US',
  'user-agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36'
}

class ImdbUnavailable extends Error {}
class ImdbNotFound extends Error {}

interface GqlError {
  message: string
  extensions?: { code?: string }
}

async function gql<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  const res = await fetch(IMDB_GRAPHQL, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify({ query, variables })
  }).catch(() => null)
  if (!res) throw new ImdbUnavailable('network')
  if (res.status === 403 || res.status === 429 || res.status >= 500) {
    throw new ImdbUnavailable(`http ${res.status}`)
  }
  // A 400 carries the GraphQL errors in its body; read those before giving up on the status.
  const json = (await res.json().catch(() => null)) as { data?: T; errors?: GqlError[] } | null
  if (!json) throw new Error(`IMDb responded ${res.status}`)
  const notFound = json.errors?.find(
    (e) => e.extensions?.code === 'RESOURCE_NOT_FOUND' || e.extensions?.code === 'BAD_USER_INPUT'
  )
  if (notFound) throw new ImdbNotFound(notFound.message)
  // Field-level errors (a private list, say) leave that field null; the caller reads the null.
  if (!json.data) throw new Error(json.errors?.[0]?.message ?? 'IMDb returned no data')
  return json.data
}

interface ImdbTitle {
  id: string
  titleText: { text: string } | null
  titleType: { id: string } | null
  releaseYear: { year: number } | null
}
const TITLE = 'id titleText { text } titleType { id } releaseYear { year }'

interface PageInfo {
  hasNextPage: boolean
  endCursor: string | null
}

// IMDb types Vesper has no home for. Anything else is worth asking TMDB about.
const SKIP_TYPES = new Set([
  'tvEpisode',
  'videoGame',
  'podcastSeries',
  'podcastEpisode',
  'musicVideo'
])
const TV_TYPES = new Set(['tvSeries', 'tvMiniSeries', 'tvSpecial', 'tvShort'])

type Phase = 'ratings' | 'watchlist' | 'list'

interface Matched {
  mediaType: 'movie' | 'tv'
  tmdbId: number
  title: string
  posterPath?: string
  score?: number
  ratedAt?: number
  addedAt?: number
}
type Row = { title: ImdbTitle; score?: number; ratedAt?: number; addedAt?: number }
interface Unmatched {
  title: string
  year?: number
  reason: string
}

interface FindResponse {
  movie_results?: { id: number; title?: string; poster_path?: string | null }[]
  tv_results?: { id: number; name?: string; poster_path?: string | null }[]
}

type CachedMatch = FunctionReturnType<typeof internal.imdb.cachedMatches>[number]

/** Resolve an IMDb title to a Vesper one. IMDb's type only steers which TMDB list to read
 *  first; TMDB's answer is what counts. `null` is TMDB saying it has nothing; `'error'` is
 *  TMDB not answering. */
async function match(
  title: ImdbTitle
): Promise<Pick<Matched, 'mediaType' | 'tmdbId' | 'title' | 'posterPath'> | null | 'error'> {
  const found = await tmdbGet<FindResponse>(`/find/${title.id}`, {
    external_source: 'imdb_id'
  }).catch(() => null)
  if (!found) return 'error'
  const preferTv = TV_TYPES.has(title.titleType?.id ?? '')
  const movie = found.movie_results?.[0]
  const tv = found.tv_results?.[0]
  const pick = preferTv ? (tv ?? movie) : (movie ?? tv)
  if (!pick) return null
  const isTv = pick === tv
  return {
    mediaType: isTv ? 'tv' : 'movie',
    tmdbId: pick.id,
    title: (isTv ? tv?.name : movie?.title) ?? title.titleText?.text ?? '',
    posterPath: pick.poster_path ?? undefined
  }
}

/** Match a page of rows. A sync re-reads everything on IMDb, so TMDB only hears about titles
 *  the shared cache hasn't seen; the rest resolve from there. */
async function matchAll(
  ctx: ActionCtx,
  rows: Row[]
): Promise<{ items: Matched[]; unmatched: Unmatched[] }> {
  const items: Matched[] = []
  const unmatched: Unmatched[] = []
  const skip = (t: ImdbTitle, reason: string): void => {
    unmatched.push({
      title: t.titleText?.text ?? t.id,
      year: t.releaseYear?.year ?? undefined,
      reason
    })
  }
  const candidates = rows.filter((r) => {
    const type = r.title.titleType?.id ?? ''
    if (SKIP_TYPES.has(type)) {
      skip(r.title, type)
      return false
    }
    return true
  })

  const known = new Map(
    (
      await ctx.runQuery(internal.imdb.cachedMatches, {
        imdbIds: candidates.map((r) => r.title.id)
      })
    ).map((c) => [c.imdbId, c])
  )
  const fresh = candidates.filter((r) => !known.has(r.title.id))
  const learned: CachedMatch[] = []
  for (let i = 0; i < fresh.length; i += CONCURRENCY) {
    const batch = await Promise.all(
      fresh.slice(i, i + CONCURRENCY).map(async (r) => ({ r, m: await match(r.title) }))
    )
    for (const { r, m } of batch) {
      // A failed lookup isn't a miss; leave it out so the next sync asks again.
      if (m === 'error') continue
      const entry: CachedMatch = m ? { imdbId: r.title.id, ...m } : { imdbId: r.title.id }
      known.set(r.title.id, entry)
      learned.push(entry)
    }
  }
  if (learned.length > 0) await ctx.runMutation(internal.imdb.rememberMatches, { matches: learned })

  for (const r of candidates) {
    const c = known.get(r.title.id)
    if (c?.tmdbId !== undefined && c.mediaType) {
      items.push({
        mediaType: c.mediaType,
        tmdbId: c.tmdbId,
        title: c.title ?? r.title.titleText?.text ?? '',
        posterPath: c.posterPath,
        score: r.score,
        ratedAt: r.ratedAt,
        addedAt: r.addedAt
      })
    } else {
      skip(r.title, 'no-match')
    }
  }
  return { items, unmatched }
}

// ─── actions ───────────────────────────────────────────────────────────────

/** First step of a run: turn the pasted id into a `ur` id, learn what is public and how much
 *  there is, then hand off to the first page. */
export const start = internalAction({
  args: {
    userId: v.id('users'),
    runId: v.string(),
    profileId: v.string(),
    scope: v.union(v.literal('all'), v.literal('lists'))
  },
  handler: async (ctx, { userId, runId, profileId, scope }): Promise<void> => {
    const fail = async (
      error: 'not-found' | 'private' | 'unavailable' | 'failed'
    ): Promise<void> => {
      await ctx.runMutation(internal.imdb.fail, { userId, runId, error })
    }
    try {
      let imdbUserId = profileId
      let nickName: string | undefined
      if (profileId.startsWith('p.')) {
        const data = await gql<{ userProfile: { userId: string; nickName: string | null } | null }>(
          'query($profileId: ID!) { userProfile(input: { profileId: $profileId }) { userId nickName } }',
          { profileId }
        )
        if (!data.userProfile?.userId) return await fail('not-found')
        imdbUserId = data.userProfile.userId
        nickName = data.userProfile.nickName ?? undefined
      }

      if (scope === 'lists') {
        await ctx.runMutation(internal.imdb.setResolved, {
          userId,
          runId,
          imdbUserId,
          nickName,
          total: 0
        })
        await ctx.scheduler.runAfter(0, internal.imdbImport.page, {
          userId,
          runId,
          imdbUserId,
          phase: 'list',
          listIndex: 0,
          cursor: undefined,
          watchlistPublic: false
        })
        return
      }

      const totals = await gql<{
        userRatings: { total: number } | null
        predefinedList: { titleListItemSearch: { total: number } | null } | null
      }>(
        `query($id: ID!) {
          userRatings(userId: $id, first: 1) { total }
          predefinedList(userId: $id, classType: WATCH_LIST) { titleListItemSearch(first: 1) { total } }
        }`,
        { id: imdbUserId }
      )
      const ratingsTotal = totals.userRatings?.total ?? 0
      const watchlistTotal = totals.predefinedList?.titleListItemSearch?.total ?? 0
      const ratingsPublic = totals.userRatings !== null
      const watchlistPublic = totals.predefinedList !== null
      if (!ratingsPublic && !watchlistPublic) return await fail('private')

      await ctx.runMutation(internal.imdb.setResolved, {
        userId,
        runId,
        imdbUserId,
        nickName,
        total: ratingsTotal + watchlistTotal
      })
      await ctx.scheduler.runAfter(0, internal.imdbImport.page, {
        userId,
        runId,
        imdbUserId,
        phase: ratingsPublic && ratingsTotal > 0 ? 'ratings' : 'watchlist',
        listIndex: undefined,
        cursor: undefined,
        watchlistPublic
      })
    } catch (err) {
      if (err instanceof ImdbNotFound) return await fail('not-found')
      if (err instanceof ImdbUnavailable) return await fail('unavailable')
      console.error('[imdb] start failed', err)
      await fail('failed')
    }
  }
})

/** One page of one phase. Fetches, matches against TMDB, writes, then schedules the next
 *  page — or the next phase, or the finish. Stops quietly if the run was replaced. */
export const page = internalAction({
  args: {
    userId: v.id('users'),
    runId: v.string(),
    imdbUserId: v.string(),
    phase: v.union(v.literal('ratings'), v.literal('watchlist'), v.literal('list')),
    // Which of the account's lists this page belongs to, for the list phase.
    listIndex: v.optional(v.number()),
    cursor: v.optional(v.string()),
    watchlistPublic: v.boolean()
  },
  handler: async (
    ctx,
    { userId, runId, imdbUserId, phase, listIndex, cursor, watchlistPublic }
  ): Promise<void> => {
    const account = await ctx.runQuery(internal.imdb.accountForRun, { userId, runId })
    if (!account) return
    const lists = account.lists ?? []
    const entry = phase === 'list' ? lists[listIndex ?? 0] : undefined
    if (phase === 'list' && !entry) {
      await ctx.runMutation(internal.imdb.finish, { userId, runId })
      return
    }
    try {
      const { rows, pageInfo, meta } = await fetchPage(imdbUserId, phase, cursor, entry?.imdbListId)
      // A list's name and size are learned on its first page; a private or deleted list has
      // no meta and simply contributes nothing.
      if (entry && cursor === undefined && meta) {
        await ctx.runMutation(internal.imdb.setListMeta, {
          userId,
          runId,
          imdbListId: entry.imdbListId,
          name: meta.name,
          total: meta.total
        })
      }
      const { items, unmatched } = await matchAll(ctx, rows)
      await ctx.runMutation(internal.imdb.applyPage, {
        userId,
        runId,
        phase,
        imdbListId: entry?.imdbListId,
        items,
        unmatched,
        seen: rows.length
      })

      const next = (
        p: Phase,
        c: string | undefined,
        li: number | undefined
      ): Promise<Id<'_scheduled_functions'>> =>
        ctx.scheduler.runAfter(0, internal.imdbImport.page, {
          userId,
          runId,
          imdbUserId,
          phase: p,
          listIndex: li,
          cursor: c,
          watchlistPublic
        })
      const nextList = (from: number): number | null => (from < lists.length ? from : null)
      if (pageInfo.hasNextPage && pageInfo.endCursor) {
        await next(phase, pageInfo.endCursor, listIndex)
      } else if (phase === 'ratings' && watchlistPublic) {
        await next('watchlist', undefined, undefined)
      } else if (phase !== 'list' && nextList(0) !== null) {
        await next('list', undefined, 0)
      } else if (phase === 'list' && nextList((listIndex ?? 0) + 1) !== null) {
        await next('list', undefined, (listIndex ?? 0) + 1)
      } else {
        await ctx.runMutation(internal.imdb.finish, { userId, runId })
      }
    } catch (err) {
      const error = err instanceof ImdbUnavailable ? 'unavailable' : 'failed'
      if (error === 'failed') console.error('[imdb] page failed', err)
      await ctx.runMutation(internal.imdb.fail, { userId, runId, error })
    }
  }
})

interface Page {
  rows: Row[]
  pageInfo: PageInfo
  meta?: { name: string; total: number }
}
const EMPTY_PAGE: Page = { rows: [], pageInfo: { hasNextPage: false, endCursor: null } }

function when(iso: string | null | undefined): number | undefined {
  if (!iso) return undefined
  const t = Date.parse(iso)
  return Number.isFinite(t) ? t : undefined
}

async function fetchPage(
  imdbUserId: string,
  phase: Phase,
  cursor: string | undefined,
  imdbListId?: string
): Promise<Page> {
  if (phase === 'list') {
    if (!imdbListId) return EMPTY_PAGE
    const data = await gql<{
      list: {
        name: { originalText: string } | null
        titleListItemSearch: {
          total: number
          pageInfo: PageInfo
          edges: { title: ImdbTitle; node: { createdDate: string | null } | null }[]
        }
      } | null
    }>(
      `query($id: ID!, $first: Int!, $after: String) {
        list(id: $id) {
          name { originalText }
          titleListItemSearch(first: $first, after: $after) {
            total
            pageInfo { hasNextPage endCursor }
            edges { title { ${TITLE} } node { createdDate } }
          }
        }
      }`,
      { id: imdbListId, first: PAGE, after: cursor ?? null }
    ).catch((err: unknown) => {
      // A deleted or private list is a RESOURCE_NOT_FOUND on the list field; skip it rather
      // than sink the whole run.
      if (err instanceof ImdbNotFound) return null
      throw err
    })
    const conn = data?.list?.titleListItemSearch
    if (!data?.list || !conn) return EMPTY_PAGE
    return {
      pageInfo: conn.pageInfo,
      rows: conn.edges.map((e) => ({ title: e.title, addedAt: when(e.node?.createdDate) })),
      meta: { name: data.list.name?.originalText ?? '', total: conn.total }
    }
  }
  if (phase === 'ratings') {
    const data = await gql<{
      userRatings: {
        pageInfo: PageInfo
        edges: { node: { title: ImdbTitle; userRating: { value: number; date: string } | null } }[]
      } | null
    }>(
      `query($id: ID!, $first: Int!, $after: String) {
        userRatings(userId: $id, first: $first, after: $after) {
          pageInfo { hasNextPage endCursor }
          edges { node { title { ${TITLE} } userRating { value date } } }
        }
      }`,
      { id: imdbUserId, first: PAGE, after: cursor ?? null }
    )
    const conn = data.userRatings
    if (!conn) return EMPTY_PAGE
    return {
      pageInfo: conn.pageInfo,
      rows: conn.edges.flatMap(({ node }) =>
        node.userRating
          ? [
              {
                title: node.title,
                score: tenToFive(node.userRating.value),
                ratedAt: when(node.userRating.date)
              }
            ]
          : []
      )
    }
  }
  const data = await gql<{
    predefinedList: {
      titleListItemSearch: {
        pageInfo: PageInfo
        edges: { title: ImdbTitle; node: { createdDate: string | null } | null }[]
      }
    } | null
  }>(
    `query($id: ID!, $first: Int!, $after: String) {
      predefinedList(userId: $id, classType: WATCH_LIST) {
        titleListItemSearch(first: $first, after: $after) {
          pageInfo { hasNextPage endCursor }
          edges { title { ${TITLE} } node { createdDate } }
        }
      }
    }`,
    { id: imdbUserId, first: PAGE, after: cursor ?? null }
  )
  const conn = data.predefinedList?.titleListItemSearch
  if (!conn) return EMPTY_PAGE
  return {
    pageInfo: conn.pageInfo,
    rows: conn.edges.map((e) => ({ title: e.title, addedAt: when(e.node?.createdDate) }))
  }
}
