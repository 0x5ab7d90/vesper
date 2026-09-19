'use node'

import { v } from 'convex/values'
import { internal } from './_generated/api'
import { internalAction } from './_generated/server'
import type { ProfileStatsData } from './stats'
import { tmdbGet } from './tmdb'

type MediaType = 'movie' | 'tv'
type Key = { mediaType: MediaType; tmdbId: number }
type Meta = Key & {
  genres: string[]
  runtimeMin?: number
  year?: number
  originalLanguage?: string
  voteAverage?: number
  episodes?: number
  fetchedAt: number
}

const CONCURRENCY = 6
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const keyOf = (k: Key): string => `${k.mediaType}:${k.tmdbId}`

async function fetchMeta(item: Key): Promise<Meta> {
  // Only the key: callers pass whole watched items, and the cache row must not carry extras.
  const key: Key = { mediaType: item.mediaType, tmdbId: item.tmdbId }
  const fetchedAt = Date.now()
  try {
    if (key.mediaType === 'movie') {
      const d = await tmdbGet<{
        genres?: { name: string }[]
        runtime?: number | null
        release_date?: string
        original_language?: string
        vote_average?: number
      }>(`/movie/${key.tmdbId}`)
      return {
        ...key,
        genres: (d.genres ?? []).map((g) => g.name),
        runtimeMin: d.runtime ?? undefined,
        year: d.release_date ? Number(d.release_date.slice(0, 4)) || undefined : undefined,
        originalLanguage: d.original_language,
        voteAverage: d.vote_average,
        fetchedAt
      }
    }
    const d = await tmdbGet<{
      genres?: { name: string }[]
      episode_run_time?: number[]
      first_air_date?: string
      original_language?: string
      vote_average?: number
      number_of_episodes?: number
    }>(`/tv/${key.tmdbId}`)
    return {
      ...key,
      genres: (d.genres ?? []).map((g) => g.name),
      runtimeMin: d.episode_run_time?.[0],
      year: d.first_air_date ? Number(d.first_air_date.slice(0, 4)) || undefined : undefined,
      originalLanguage: d.original_language,
      voteAverage: d.vote_average,
      episodes: d.number_of_episodes,
      fetchedAt
    }
  } catch (e) {
    // Unknown to TMDB (or a transient failure): record the attempt so the job does not ask
    // again on every refresh. Genres stay empty and the title simply drops out of the charts.
    console.warn(`[stats] no meta for ${keyOf(key)}: ${e instanceof Error ? e.message : e}`)
    return { ...key, genres: [], fetchedAt }
  }
}

function top(counts: Map<string, number>, n: number): { label: string; count: number }[] {
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, n)
    .map(([label, count]) => ({ label, count }))
}

export const compute = internalAction({
  args: { userId: v.id('users') },
  handler: async (ctx, { userId }) => {
    try {
      const { items, ratings, tvSeconds } = await ctx.runQuery(internal.stats.inputs, { userId })

      // Metadata: cached rows first, then fill the gaps from TMDB in small parallel batches.
      const known = await ctx.runQuery(internal.stats.metaFor, {
        keys: items.map((i) => ({ mediaType: i.mediaType, tmdbId: i.tmdbId }))
      })
      const meta = new Map<string, Meta>()
      for (const m of known) meta.set(keyOf(m), m)
      const missing = items.filter((i) => !meta.has(keyOf(i)))
      for (let i = 0; i < missing.length; i += CONCURRENCY) {
        const batch = await Promise.all(missing.slice(i, i + CONCURRENCY).map(fetchMeta))
        for (const m of batch) meta.set(keyOf(m), m)
        await ctx.runMutation(internal.stats.saveMeta, {
          rows: batch.map(({ mediaType, tmdbId, ...rest }) => ({ mediaType, tmdbId, ...rest }))
        })
      }

      // Tallies.
      const genres = new Map<string, number>()
      const decades = new Map<string, number>()
      const languages = new Map<string, number>()
      const months = new Map<string, number>()
      let movies = 0
      let shows = 0
      let movieMinutes = 0
      type Ref = { title: string; posterPath?: string }
      let longestMovie: (Ref & { runtimeMin: number }) | null = null
      let oldest: (Ref & { year: number }) | null = null
      let newest: (Ref & { year: number }) | null = null

      const since = new Date()
      since.setMonth(since.getMonth() - 11, 1)
      since.setHours(0, 0, 0, 0)
      for (let i = 0; i < 12; i++) {
        const d = new Date(since.getFullYear(), since.getMonth() + i, 1)
        months.set(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, 0)
      }

      for (const item of items) {
        const m = meta.get(keyOf(item))
        if (item.mediaType === 'movie') movies++
        else shows++

        const added = new Date(item.addedAt)
        const mk = `${added.getFullYear()}-${String(added.getMonth() + 1).padStart(2, '0')}`
        if (months.has(mk)) months.set(mk, (months.get(mk) ?? 0) + 1)

        if (!m) continue
        for (const g of m.genres) genres.set(g, (genres.get(g) ?? 0) + 1)
        if (m.originalLanguage) {
          languages.set(m.originalLanguage, (languages.get(m.originalLanguage) ?? 0) + 1)
        }
        if (m.year) {
          const label = `${Math.floor(m.year / 10) * 10}s`
          decades.set(label, (decades.get(label) ?? 0) + 1)
          const ref: Ref = { title: item.title, posterPath: item.posterPath }
          if (!oldest || m.year < oldest.year) oldest = { ...ref, year: m.year }
          if (!newest || m.year > newest.year) newest = { ...ref, year: m.year }
        }
        if (item.mediaType === 'movie' && m.runtimeMin) {
          movieMinutes += m.runtimeMin
          if (!longestMovie || m.runtimeMin > longestMovie.runtimeMin) {
            longestMovie = {
              title: item.title,
              posterPath: item.posterPath,
              runtimeMin: m.runtimeMin
            }
          }
        }
      }

      const refOf = new Map(
        items.map((i) => [keyOf(i), { title: i.title, posterPath: i.posterPath } as Ref])
      )
      let topRated: (Ref & { score: number }) | null = null
      for (const r of ratings) {
        const ref = refOf.get(keyOf(r))
        if (!ref) continue
        if (!topRated || r.score > topRated.score) topRated = { ...ref, score: r.score }
      }
      const distribution = [0, 0, 0, 0, 0]
      for (const r of ratings) {
        const i = Math.round(r.score) - 1
        if (i >= 0 && i < 5) distribution[i]!++
      }
      const ratingsSummary =
        ratings.length > 0
          ? {
              count: ratings.length,
              average:
                Math.round((ratings.reduce((s, r) => s + r.score, 0) / ratings.length) * 10) / 10,
              distribution
            }
          : null

      const monthRows = [...months.entries()].map(([key, count]) => ({
        key,
        label: MONTHS[Number(key.slice(5)) - 1]!,
        count
      }))
      const busiest = monthRows.reduce<(typeof monthRows)[number] | null>(
        (best, row) => (row.count > 0 && (!best || row.count > best.count) ? row : best),
        null
      )

      const stats: ProfileStatsData = {
        movies,
        shows,
        hoursWatched: Math.round(((movieMinutes * 60 + tvSeconds) / 3600) * 10) / 10,
        genres: top(genres, 8),
        decades: [...decades.entries()]
          .sort((a, b) => a[0].localeCompare(b[0]))
          .map(([label, count]) => ({ label, count })),
        months: monthRows,
        languages: top(languages, 5).map(({ label, count }) => ({ code: label, count })),
        ratings: ratingsSummary,
        highlights: {
          longestMovie,
          oldest,
          newest,
          topRated,
          busiestMonth: busiest ? { label: busiest.label, count: busiest.count } : null
        }
      }

      await ctx.runMutation(internal.stats.saveSnapshot, { userId, itemCount: items.length, stats })
    } catch (e) {
      await ctx.runMutation(internal.stats.clearComputing, { userId })
      throw e
    }
  }
})
