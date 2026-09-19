'use node'

import { getAuthUserId } from '@convex-dev/auth/server'
import { v } from 'convex/values'
import { action } from './_generated/server'

const BASE = 'https://api.themoviedb.org/3'

let rrIdx = 0
const cooldownUntil: number[] = []

function getKeys(): string[] {
  const raw = process.env.TMDB_API_KEYS ?? process.env.TMDB_API_KEY ?? ''
  const keys = raw
    .split(',')
    .map((k) => k.trim())
    .filter((k) => k.length > 0)
  if (cooldownUntil.length !== keys.length) {
    cooldownUntil.length = keys.length
    for (let i = 0; i < keys.length; i++) {
      if (cooldownUntil[i] == null) cooldownUntil[i] = 0
    }
  }
  return keys
}

function pickKey(keys: string[]): { key: string; idx: number } | null {
  if (keys.length === 0) return null
  const now = Date.now()
  for (let i = 0; i < keys.length; i++) {
    const idx = (rrIdx + i) % keys.length
    if ((cooldownUntil[idx] ?? 0) <= now) {
      rrIdx = (idx + 1) % keys.length
      return { key: keys[idx], idx }
    }
  }
  return null
}

function shortestCooldownMs(): number {
  const now = Date.now()
  let min = Infinity
  for (const t of cooldownUntil) {
    const wait = t - now
    if (wait > 0 && wait < min) min = wait
  }
  return min === Infinity ? 0 : min
}

/** GET a TMDB path with the deployment's rotating keys. Shared by the client-facing action
 *  below and by server-side jobs (stats) that need metadata without a signed-in user. */
export async function tmdbGet<T = unknown>(
  path: string,
  params?: Record<string, string>
): Promise<T> {
  const keys = getKeys()
  if (keys.length === 0) throw new Error('TMDB: no API key configured')
  const maxAttempts = keys.length + 1
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    let picked = pickKey(keys)
    if (!picked) {
      const wait = shortestCooldownMs()
      if (wait === 0) throw new Error('TMDB: all keys unavailable')
      console.warn(`[tmdb] all keys cooled down — waiting ${wait}ms before retry`)
      await new Promise((r) => setTimeout(r, wait + 50))
      picked = pickKey(keys)
      if (!picked) throw new Error('TMDB: all keys still cooled down')
    }
    const { key, idx } = picked
    const url = new URL(`${BASE}${path}`)
    url.searchParams.set('api_key', key)
    url.searchParams.set('language', 'en-US')
    if (params) {
      for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
    }
    const res = await fetch(url, { headers: { accept: 'application/json' } })
    if (res.status === 429) {
      const ra = parseInt(res.headers.get('retry-after') ?? '5', 10)
      cooldownUntil[idx] = Date.now() + Math.max(1, ra) * 1000
      console.warn(
        `[tmdb] 429 on key#${idx} for ${path} — cooldown ${ra}s (attempt ${attempt + 1}/${maxAttempts})`
      )
      continue
    }
    if (!res.ok) {
      console.warn(`[tmdb] ${res.status} on key#${idx} for ${path}`)
      throw new Error(`TMDB ${res.status} ${path}`)
    }
    return (await res.json()) as T
  }
  console.error(`[tmdb] rate limit exhausted across ${keys.length} keys for ${path}`)
  throw new Error(`TMDB: rate limit exhausted across ${keys.length} keys for ${path}`)
}

export const fetchEndpoint = action({
  args: {
    path: v.string(),
    params: v.optional(v.record(v.string(), v.string()))
  },
  handler: async (ctx, { path, params }) => {
    const userId = await getAuthUserId(ctx)
    if (userId === null) throw new Error('Not authenticated')
    return await tmdbGet(path, params)
  }
})
