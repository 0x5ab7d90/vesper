import { useCallback, useSyncExternalStore } from 'react'
import type { WebStream, WebStreamInput } from '../../../preload/index.d'

// Web sources (ADR-0019): HLS streams for a title from a stream API, listed
// with the cached rows as the way in when debrid has nothing. The main
// process asks every server at once and hands rows over as each answers;
// this side keeps one shared, incrementally filled list per title so the
// picker shows the fast servers immediately and the player finds the same
// list already in hand.

export type { WebStream, WebStreamInput }

const FRESH_MS = 5 * 60_000

interface Entry {
  streams: WebStream[]
  /** Every server has answered or failed. */
  done: boolean
  /** The request itself failed — no seed, or the main process refused it. */
  error: boolean
  startedAt: number
}

const EMPTY: Entry = { streams: [], done: false, error: false, startedAt: 0 }

const entries = new Map<string, Entry>()
const listeners = new Map<string, Set<() => void>>()

function keyOf(input: WebStreamInput): string {
  return `${input.mediaType}:${input.tmdbId}:${input.season ?? ''}:${input.episode ?? ''}`
}

function publish(key: string, next: Entry): void {
  entries.set(key, next)
  listeners.get(key)?.forEach((cb) => cb())
}

function start(key: string, input: WebStreamInput): void {
  const fresh: Entry = { streams: [], done: false, error: false, startedAt: Date.now() }
  entries.set(key, fresh)
  const seen = new Set<string>()
  void window.api.web
    .listStreams(input, (rows) => {
      const cur = entries.get(key) ?? fresh
      const add = rows.filter((r) => !seen.has(r.id))
      add.forEach((r) => seen.add(r.id))
      if (add.length > 0) publish(key, { ...cur, streams: [...cur.streams, ...add] })
    })
    .then((all) => {
      const cur = entries.get(key) ?? fresh
      // The final list is authoritative — it also covers any chunk that was missed.
      const missed = all.filter((r) => !seen.has(r.id))
      publish(key, { ...cur, streams: [...cur.streams, ...missed], done: true })
    })
    .catch((err) => {
      console.error('[web-sources] list failed', err)
      const cur = entries.get(key) ?? fresh
      publish(key, { ...cur, done: true, error: true })
    })
}

function ensure(key: string, input: WebStreamInput): void {
  const cur = entries.get(key)
  if (cur && (!cur.done || Date.now() - cur.startedAt < FRESH_MS)) return
  start(key, input)
}

/** The web streams for a title, filling in server by server. Idle while `enabled` is false. */
export function useWebStreams(input: WebStreamInput, enabled = true): Entry {
  const key = keyOf(input)
  const subscribe = useCallback(
    (cb: () => void): (() => void) => {
      if (!enabled) return () => undefined
      let set = listeners.get(key)
      if (!set) {
        set = new Set()
        listeners.set(key, set)
      }
      set.add(cb)
      ensure(key, input)
      return () => {
        set.delete(cb)
      }
    },
    // The input's identity changes every render; the key is what matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key, enabled]
  )
  const getSnapshot = useCallback((): Entry => {
    if (!enabled) return EMPTY
    return entries.get(key) ?? EMPTY
  }, [key, enabled])
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

const QUALITY_ORDER = ['2160p', '1080p', '720p', '480p', '360p']

function qualityRank(q: string): number {
  const i = QUALITY_ORDER.indexOf(q)
  return i === -1 ? QUALITY_ORDER.length : i
}

/** Highest quality first; arrival order breaks ties. */
export function sortWebStreams(streams: WebStream[]): WebStream[] {
  return streams
    .map((s, i) => ({ s, i }))
    .toSorted((a, b) => qualityRank(a.s.quality) - qualityRank(b.s.quality) || a.i - b.i)
    .map((x) => x.s)
}

/** The quality chip: the API's labels squeezed into the picker's vocabulary. */
export function webQualityLabel(q: string): string {
  if (q === '2160p') return '4K'
  if (/^\d{3,4}p$/.test(q)) return q
  return 'Auto'
}
