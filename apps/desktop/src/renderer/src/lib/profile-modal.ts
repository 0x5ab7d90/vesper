import { useSyncExternalStore } from 'react'

// Profiles open in a modal over whatever page is showing, so the "open" state lives outside
// React: any surface (sidebar rows, search, context menus, deep links) can call openProfile.

let current: string | null = null
const listeners = new Set<() => void>()

function emit(): void {
  for (const l of listeners) l()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function openProfile(username: string): void {
  current = username
  emit()
}

export function closeProfile(): void {
  current = null
  emit()
}

export function useProfileModalUsername(): string | null {
  return useSyncExternalStore(
    subscribe,
    () => current,
    () => null
  )
}
