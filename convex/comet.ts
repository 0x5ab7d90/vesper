'use node'

import { getAuthUserId } from '@convex-dev/auth/server'
import { ConvexError, v } from 'convex/values'
import { action } from './_generated/server'

interface CometRawStream {
  name?: string
  title?: string
  description?: string
  url?: string
  // Sootio puts the infohash and byte size directly on the stream object, and flags the
  // rows that are already in the debrid cloud rather than merely findable on an indexer.
  _hash?: string
  _size?: number
  isPersonal?: boolean
  behaviorHints?: {
    bingeGroup?: string
    filename?: string
    // Sootio spells it fileName.
    fileName?: string
    videoSize?: number
    // Meteor exposes cache status directly.
    cached?: boolean
  }
}

type Source = 'comet' | 'torrentio' | 'sootio' | 'meteor'

export interface CometStream {
  playbackHash: string
  source: Source
  name: string
  description: string
  filename?: string
  videoSize: number
  bingeGroup?: string
  cached: boolean
}

const PLAYBACK_HASH_RE = /\/playback\/([a-f0-9]+)\//i
const TORRENTIO_HASH_RE = /\/realdebrid\/[^/]+\/([a-f0-9]{40})\//i
const METEOR_HASH_RE = /\/play\/([a-f0-9]{40})\//i
const TORRENTIO_SIZE_RE = /💾\s*([\d.]+)\s*(TB|GB|MB)/i

const SOURCE_ENV: Record<Source, string> = {
  comet: 'COMET_BASE',
  torrentio: 'TORRENTIO_BASE',
  sootio: 'SOOTIO_BASE',
  meteor: 'METEOR_BASE'
}

function sourceBase(source: Source): string | null {
  const b = process.env[SOURCE_ENV[source]]
  return b ? b.replace(/\/$/, '') : null
}

function idPart(
  type: 'movie' | 'series',
  imdbId: string,
  season?: number,
  episode?: number
): string {
  return type === 'series' && season !== undefined && episode !== undefined
    ? `${imdbId}:${season}:${episode}`
    : imdbId
}

function cometHash(s: CometRawStream): string | null {
  const fromUrl = s.url?.match(PLAYBACK_HASH_RE)?.[1]
  if (fromUrl) return fromUrl.toLowerCase()
  const fromBinge = s.behaviorHints?.bingeGroup?.split('|').at(-1)
  return fromBinge && /^[a-f0-9]{40}$/i.test(fromBinge) ? fromBinge.toLowerCase() : null
}

function torrentioHash(s: CometRawStream): string | null {
  return s.url?.match(TORRENTIO_HASH_RE)?.[1]?.toLowerCase() ?? null
}

// Sootio's donation banner has no _hash (or url), so it drops out here.
function sootioHash(s: CometRawStream): string | null {
  return s._hash && /^[a-f0-9]{40}$/i.test(s._hash) ? s._hash.toLowerCase() : null
}

function meteorHash(s: CometRawStream): string | null {
  return s.url?.match(METEOR_HASH_RE)?.[1]?.toLowerCase() ?? null
}

const HASH_OF: Record<Source, (s: CometRawStream) => string | null> = {
  comet: cometHash,
  torrentio: torrentioHash,
  sootio: sootioHash,
  meteor: meteorHash
}

function torrentioSize(title: string): number {
  const m = title.match(TORRENTIO_SIZE_RE)
  if (!m) return 0
  const n = parseFloat(m[1])
  const unit = m[2].toUpperCase()
  return unit === 'TB' ? n * 1e12 : unit === 'GB' ? n * 1e9 : n * 1e6
}

// Comet marks cached with ⚡; Torrentio with [RD+] (uncached is [RD download]);
// Meteor exposes a boolean (name-wise: [RD🌩️] cached vs [RD☁️] uncached).
//
// Sootio needs its own rule. It stamps [RD+] on every row as a service label, not a cache
// flag, and it searches its indexers by title rather than by IMDb id — so a request for
// Kingdom comes back with Animal Kingdom and The Last Kingdom mixed in, all of them
// claiming to be cached. The honest signal is whether the file is already in the debrid
// cloud: ☁️ (isPersonal) is playable, 💾 is only a torrent it spotted on an indexer, and
// resolving one of those 404s with "Could not resolve link".
function isCached(source: Source, s: CometRawStream): boolean {
  if (source === 'comet') return (s.name ?? '').includes('⚡')
  if (source === 'meteor') return s.behaviorHints?.cached === true
  if (source === 'sootio') return s.isPersonal === true || (s.title ?? '').includes('☁️')
  return (s.name ?? '').includes('[RD+]')
}

function parse(source: Source, s: CometRawStream): CometStream | null {
  const playbackHash = HASH_OF[source](s)
  if (!playbackHash) return null
  const description = s.description ?? s.title ?? ''
  return {
    playbackHash,
    source,
    name: s.name ?? '',
    description,
    filename: s.behaviorHints?.filename ?? s.behaviorHints?.fileName,
    videoSize:
      s.behaviorHints?.videoSize ??
      s._size ??
      (source === 'torrentio' ? torrentioSize(description) : 0),
    bingeGroup: s.behaviorHints?.bingeGroup,
    cached: isCached(source, s)
  }
}

async function fetchRaw(
  source: Source,
  type: 'movie' | 'series',
  imdbId: string,
  season?: number,
  episode?: number
): Promise<CometRawStream[]> {
  const b = sourceBase(source)
  if (!b) return []
  const url = `${b}/stream/${type}/${encodeURIComponent(idPart(type, imdbId, season, episode))}.json`
  const r = await fetch(url, { headers: { accept: 'application/json' } })
  if (!r.ok) throw new Error(`${source} ${r.status} for ${type} ${imdbId}`)
  const body = (await r.json()) as { streams?: CometRawStream[] }
  return body.streams ?? []
}

async function fetchSource(
  source: Source,
  type: 'movie' | 'series',
  imdbId: string,
  season?: number,
  episode?: number
): Promise<CometStream[]> {
  const raw = await fetchRaw(source, type, imdbId, season, episode)
  return raw.map((s) => parse(source, s)).filter((s): s is CometStream => s !== null)
}

// Convex caps function return arrays at 8192 elements; stay well under as a safety net.
const MAX_STREAMS = 4096

const streamArgs = {
  type: v.union(v.literal('movie'), v.literal('series')),
  imdbId: v.string(),
  season: v.optional(v.number()),
  episode: v.optional(v.number())
}

// Dedupe priority on infohash collisions: earlier sources win. Comet first (its RD calls
// go through the single ElfHosted IP, and its descriptions are richest); the rest fill
// gaps. One source erroring (e.g. Torrentio rate-limit) must not blank the list, hence
// allSettled.
const SOURCES: Source[] = ['comet', 'meteor', 'sootio', 'torrentio']

export const fetchStreams = action({
  args: streamArgs,
  handler: async (ctx, { type, imdbId, season, episode }): Promise<CometStream[]> => {
    if ((await getAuthUserId(ctx)) === null) throw new Error('Not authenticated')
    const results = await Promise.allSettled(
      SOURCES.map((src) => fetchSource(src, type, imdbId, season, episode))
    )
    const out: CometStream[] = []
    const seen = new Set<string>()
    for (const r of results) {
      if (r.status !== 'fulfilled') continue
      for (const s of r.value) {
        // Only cached streams play instantly — the client discards the rest. Dropping them
        // here keeps the payload small and stays under Convex's 8192 array-return limit
        // (popular titles return ~10k raw streams).
        if (!s.cached) continue
        if (seen.has(s.playbackHash)) continue
        seen.add(s.playbackHash)
        out.push(s)
      }
    }
    return out.slice(0, MAX_STREAMS)
  }
})

// Resolve a chosen stream to its bare Real-Debrid CDN link. The addon playback URL
// embeds the RD API key, so it must never reach the client — we follow its 302 here
// and hand back only the keyless CDN URL.
export const resolve = action({
  args: {
    ...streamArgs,
    playbackHash: v.string(),
    source: v.optional(
      v.union(
        v.literal('comet'),
        v.literal('torrentio'),
        v.literal('sootio'),
        v.literal('meteor')
      )
    )
  },
  handler: async (
    ctx,
    { type, imdbId, season, episode, playbackHash, source }
  ): Promise<string> => {
    if ((await getAuthUserId(ctx)) === null) throw new Error('Not authenticated')
    const src: Source = source ?? 'comet'
    const raw = await fetchRaw(src, type, imdbId, season, episode)
    const hashOf = HASH_OF[src]
    const match = raw.find((s) => hashOf(s) === playbackHash.toLowerCase())
    // Plain Errors reach the client as "Server Error" with the reason stripped, so anything
    // the viewer could act on is a ConvexError.
    if (!match?.url) throw new ConvexError('That stream is no longer listed. Try another one.')
    const r = await fetch(match.url, {
      method: 'GET',
      redirect: 'manual',
      headers: { Range: 'bytes=0-0' }
    })
    const location = r.headers.get('location')
    if (location) return location
    if (r.ok || r.status === 206) return match.url
    throw new ConvexError(
      r.status === 404
        ? 'That stream is not really cached. Try another one.'
        : `Could not start that stream (${src} returned ${r.status}). Try another one.`
    )
  }
})
