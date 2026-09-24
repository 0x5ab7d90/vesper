import { useEffect, useSyncExternalStore } from 'react'

// The TV shell glows with the colours of whatever title is on screen. Heroes report their
// backdrop here and the shell paints a blurred copy of it behind everything. The last image
// sticks when a page has no art of its own (search, lists), so moving around never drops the
// glow back to black.

let current: string | null = null
const listeners = new Set<() => void>()

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

// The glow is blurred past recognition, so a thumbnail looks identical to the full-size art
// and costs a fraction of the decode.
function thumbnail(url: string): string {
  return url.replace(/\/(original|w1280|w780)\//, '/w300/')
}

export function useTvAmbientSource(url: string | undefined): void {
  useEffect(() => {
    if (!url) return
    const next = thumbnail(url)
    if (next === current) return
    current = next
    for (const l of listeners) l()
  }, [url])
}

export function useTvAmbient(): string | null {
  return useSyncExternalStore(
    subscribe,
    () => current,
    () => null
  )
}
