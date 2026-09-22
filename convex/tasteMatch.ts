import { getAuthUserId } from '@convex-dev/auth/server'
import { v } from 'convex/values'
import type { Doc, Id } from './_generated/dataModel'
import { query, type QueryCtx } from './_generated/server'
import { canViewActivity } from './stats'

// Fewer titles compared than this and a percentage would be noise, so the card says so instead.
const MIN_COMPARED = 3
// The score is pulled toward this by PRIOR_WEIGHT imaginary titles, so three perfect agreements
// read as a strong match rather than a flat 100%.
const PRIOR = 0.6
const PRIOR_WEIGHT = 2
// How much two people agree on a title, indexed by how many stars apart they are.
const AGREEMENT = [1, 0.75, 0.35, 0.1, 0]
// Four stars or a favorite counts as loving it.
const LOVED = 4
const MAX_TITLES = 4

type Title = { mediaType: 'movie' | 'tv'; tmdbId: number; title: string; posterPath?: string }

interface Taste {
  ratings: Map<string, Doc<'ratings'>>
  favorites: Set<string>
  showcase: Map<string, Title>
  watched: Map<string, Title>
}

const keyOf = (t: { mediaType: string; tmdbId: number }): string => `${t.mediaType}:${t.tmdbId}`

async function listItems(
  ctx: QueryCtx,
  userId: Id<'users'>,
  kind: 'liked' | 'watched'
): Promise<Doc<'listItems'>[]> {
  const list = await ctx.db
    .query('lists')
    .withIndex('by_userId_and_kind', (q) => q.eq('userId', userId).eq('kind', kind))
    .unique()
  if (!list) return []
  return await ctx.db
    .query('listItems')
    .withIndex('by_listId', (q) => q.eq('listId', list._id))
    .collect()
}

function toTitle(i: Title): Title {
  return { mediaType: i.mediaType, tmdbId: i.tmdbId, title: i.title, posterPath: i.posterPath }
}

async function loadTaste(ctx: QueryCtx, profile: Doc<'profiles'>): Promise<Taste> {
  const [ratings, liked, watched] = await Promise.all([
    ctx.db
      .query('ratings')
      .withIndex('by_userId', (q) => q.eq('userId', profile.userId))
      .collect(),
    listItems(ctx, profile.userId, 'liked'),
    listItems(ctx, profile.userId, 'watched')
  ])
  const showcase = new Map<string, Title>()
  for (const item of profile.showcase ?? []) if (item) showcase.set(keyOf(item), toTitle(item))
  return {
    ratings: new Map(ratings.map((r) => [keyOf(r), r])),
    favorites: new Set([...liked.map(keyOf), ...showcase.keys()]),
    showcase,
    watched: new Map(watched.map((i) => [keyOf(i), toTitle(i)]))
  }
}

/** A rating when there is one, otherwise a favorite reads as five stars. */
function stars(taste: Taste, key: string): number | undefined {
  return taste.ratings.get(key)?.score ?? (taste.favorites.has(key) ? 5 : undefined)
}

/**
 * How closely the viewer's ratings and favorites line up with this profile's, plus titles you
 * both love. Behind the same gate as their Stats tab.
 * Their private Favorites list counts toward the score but is never listed by title; only
 * what they rated or put in their showcase is.
 */
export const withUsername = query({
  args: { username: v.string() },
  handler: async (ctx, { username }) => {
    const me = await getAuthUserId(ctx)
    if (me === null) return null
    const [profile, mine] = await Promise.all([
      ctx.db
        .query('profiles')
        .withIndex('by_username', (q) => q.eq('username', username))
        .unique(),
      ctx.db
        .query('profiles')
        .withIndex('by_userId', (q) => q.eq('userId', me))
        .unique()
    ])
    if (!profile || !mine || profile.userId === me) return null
    if (!(await canViewActivity(ctx, profile))) return null

    const [a, b] = await Promise.all([loadTaste(ctx, mine), loadTaste(ctx, profile)])
    const listable = (key: string): boolean => b.ratings.has(key) || b.showcase.has(key)
    const titleFor = (key: string): Title | undefined =>
      b.showcase.get(key) ?? b.watched.get(key) ?? a.showcase.get(key) ?? a.watched.get(key)

    let compared = 0
    let agreement = 0
    const shared: { key: string; total: number }[] = []
    for (const key of new Set([...a.ratings.keys(), ...a.favorites])) {
      const mineStars = stars(a, key)
      const theirStars = stars(b, key)
      if (mineStars === undefined || theirStars === undefined) continue
      compared += 1
      agreement += AGREEMENT[Math.min(4, Math.abs(mineStars - theirStars))]!
      if (mineStars >= LOVED && theirStars >= LOVED && listable(key)) {
        shared.push({ key, total: mineStars + theirStars })
      }
    }

    let inCommon = 0
    const [small, large] = a.watched.size <= b.watched.size ? [a, b] : [b, a]
    for (const key of small.watched.keys()) if (large.watched.has(key)) inCommon += 1

    return {
      percent:
        compared < MIN_COMPARED
          ? null
          : Math.round((100 * (agreement + PRIOR * PRIOR_WEIGHT)) / (compared + PRIOR_WEIGHT)),
      compared,
      inCommon,
      shared: shared
        .sort((x, y) => y.total - x.total)
        .map((s) => titleFor(s.key))
        .filter((t): t is Title => !!t?.posterPath)
        .slice(0, MAX_TITLES)
    }
  }
})
