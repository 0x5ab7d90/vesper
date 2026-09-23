import { useEffect, useRef } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { api } from '@convex/_generated/api'

/**
 * Keeps a connected IMDb profile flowing in. IMDb can't tell Vesper something changed, so the
 * app asks: coming back to the window syncs ratings, the watchlist and known lists (the server
 * also runs a sync every half hour and paces both). New lists are different — IMDb's API
 * won't enumerate them and only a real browser gets the lists page — so they are looked for
 * here, in a hidden window, right after connecting and then hourly while the app is open.
 */

const FOCUS_GAP_MS = 60_000
const LOOK_DELAY_MS = 20_000
const LOOK_EVERY_MS = 60 * 60_000

export function useImdbSync(): void {
  const connection = useQuery(api.imdb.connection)
  const sync = useMutation(api.imdb.sync)
  const addLists = useMutation(api.imdb.addLists)
  const markListsBlocked = useMutation(api.imdb.markListsBlocked)

  const connected = !!connection
  useEffect(() => {
    if (!connected) return
    let last = 0
    const onFocus = (): void => {
      if (Date.now() - last < FOCUS_GAP_MS) return
      last = Date.now()
      void sync().catch(() => undefined)
    }
    onFocus()
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [connected, sync])

  const imdbUserId = connection?.imdbUserId
  // Nobody has looked since connecting (or since "Sync now" asked for a fresh look).
  const neverLooked = !!connection && connection.listsDiscovery === undefined
  const lastLook = useRef<{ imdbUserId: string; at: number } | null>(null)
  const looking = useRef(false)
  useEffect(() => {
    const discover = window.api.imdb?.discoverLists
    if (!imdbUserId || !discover) return
    const look = (): void => {
      if (looking.current) return
      looking.current = true
      lastLook.current = { imdbUserId, at: Date.now() }
      discover(imdbUserId)
        .then((ids) =>
          ids === null
            ? markListsBlocked()
            : addLists({ imdbListIds: ids, source: 'discovered' }).then(() => undefined)
        )
        .catch(() => markListsBlocked().catch(() => undefined))
        .finally(() => {
          looking.current = false
        })
    }
    const prior = lastLook.current?.imdbUserId === imdbUserId ? lastLook.current.at : null
    // Launch waits a beat so the hidden window doesn't compete with startup.
    const wait = neverLooked
      ? 0
      : prior === null
        ? LOOK_DELAY_MS
        : Math.max(LOOK_DELAY_MS, prior + LOOK_EVERY_MS - Date.now())
    let timer = setTimeout(function tick() {
      look()
      timer = setTimeout(tick, LOOK_EVERY_MS)
    }, wait)
    return () => clearTimeout(timer)
  }, [imdbUserId, neverLooked, addLists, markListsBlocked])
}
