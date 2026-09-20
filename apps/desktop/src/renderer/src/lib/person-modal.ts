import { useSyncExternalStore } from 'react'

// People open in a modal over whatever page is showing, the same way profiles do: a cast row, a
// search result and a crew credit all sit on pages you were in the middle of reading, and taking
// the whole screen away to show one actor loses your place.

let current: number | null = null
const listeners = new Set<() => void>()

function emit(): void {
  for (const l of listeners) l()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function openPerson(tmdbId: number): void {
  current = tmdbId
  emit()
}

export function closePerson(): void {
  current = null
  emit()
}

export function usePersonModalId(): number | null {
  return useSyncExternalStore(
    subscribe,
    () => current,
    () => null
  )
}
