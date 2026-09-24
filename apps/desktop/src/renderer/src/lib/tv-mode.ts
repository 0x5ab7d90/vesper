import { useSyncExternalStore } from 'react'

// Big Picture swaps the whole shell for a 10-foot layout. The flag lives outside React because
// the toggle sits in the title bar while the shell that reacts to it is further up the tree, and
// it persists so a machine plugged into a TV opens straight back into it.

const KEY = 'vesper.ui.tvMode'

function read(): boolean {
  try {
    return window.localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

let current = typeof window === 'undefined' ? false : read()
const listeners = new Set<() => void>()

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function setTvMode(on: boolean): void {
  if (on === current) return
  current = on
  try {
    window.localStorage.setItem(KEY, on ? '1' : '0')
  } catch {
    // quota / private mode — the mode still applies for this session
  }
  for (const l of listeners) l()
  // A TV is a whole screen: entering fills it, leaving hands the window back.
  void window.api.window.setFullScreen(on)
}

export function useTvMode(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => current,
    () => false
  )
}
