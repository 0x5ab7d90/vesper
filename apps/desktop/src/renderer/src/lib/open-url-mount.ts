import { router } from '../router'
import { openProfile } from './profile-modal'

let pendingRoute: string | null = null
let appReady = false

function navigateNow(route: string): void {
  if (!route.startsWith('/')) return
  // Join links no longer exist (collaboration removed); old links land home.
  if (route.startsWith('/join/') || /^\/list\/[^/]+\/join\//.test(route)) {
    void router.navigate({ to: '/', viewTransition: false })
    return
  }
  // Profiles are a modal, not a page: open it over whatever is showing.
  const user = route.match(/^\/user\/([^/?#]+)/)
  if (user?.[1]) {
    openProfile(decodeURIComponent(user[1]))
    return
  }
  void router.navigate({ to: route, viewTransition: false } as never)
}

export function mountOpenUrlHandler(): () => void {
  if (typeof window === 'undefined' || !window.api?.onOpenUrl) return () => {}
  return window.api.onOpenUrl((route) => {
    if (!route || !route.startsWith('/')) return
    if (appReady) navigateNow(route)
    else pendingRoute = route
  })
}

export function flushPendingDeepLink(): void {
  appReady = true
  if (pendingRoute) {
    const r = pendingRoute
    pendingRoute = null
    navigateNow(r)
  }
}
