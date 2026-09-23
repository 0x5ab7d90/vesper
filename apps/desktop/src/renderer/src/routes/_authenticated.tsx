import { useCallback, useEffect, useRef, useState } from 'react'
import { createFileRoute, Outlet, redirect, useRouterState } from '@tanstack/react-router'
import { Allotment, LayoutPriority, type AllotmentHandle } from 'allotment'
import 'allotment/dist/style.css'
import { TopBar } from '@renderer/components/layout/top-bar'
import { LeftSidebar } from '@renderer/components/layout/left-sidebar'
import { RightSidebar } from '@renderer/components/layout/right-sidebar'
import { PersonModal } from '@renderer/components/media/person-modal'
import { ProfileModal } from '@renderer/components/profile/profile-modal'
import { popularMoviesQuery, trendingTvQuery } from '@renderer/lib/tmdb-queries'
import { useImdbSync } from '@renderer/hooks/use-imdb-sync'
import { usePersistedState } from '@renderer/hooks/use-persisted-state'
import { useSmoothScroll } from '@renderer/hooks/use-smooth-scroll'
import { ScrollContainerContext } from '@renderer/lib/scroll-container'
import { cn } from '@renderer/lib/cn'

interface ShellLayout {
  leftWidth: number
  rightWidth: number
  leftVisible: boolean
  rightVisible: boolean
}

const LEFT_DEFAULT = 280
const RIGHT_DEFAULT = 280
const LEFT_MAX = 400
const RIGHT_MAX = 400
const ANIM_MS = 220
const FADE_OUT_MS = 140
const FADE_IN_MS = 180
const SHELL_PAD = 16
const SNAP_THRESHOLD = 10

const INITIAL: ShellLayout = {
  leftWidth: LEFT_DEFAULT,
  rightWidth: RIGHT_DEFAULT,
  leftVisible: true,
  rightVisible: true
}

const easeOutQuart = (t: number): number => 1 - Math.pow(1 - t, 4)

// A sidebar laid out at `width: 100%` re-wraps its text on every frame of a collapse tween, so
// copy visibly squishes on the way out. Pinning the pane's content to the width it animates from
// (or to, on expand) makes it clip and slide instead, and the fade keeps the last narrow frames
// from reading as a hard cut.
function pinPane(el: HTMLDivElement | null, width: number, show: boolean): void {
  if (!el) return
  el.style.transition = 'none'
  el.style.width = `${width}px`
  el.style.opacity = show ? '0' : '1'
  void el.offsetWidth
  el.style.transition = `opacity ${show ? FADE_IN_MS : FADE_OUT_MS}ms ease-out`
  el.style.opacity = show ? '1' : '0'
}

function unpinPane(el: HTMLDivElement | null): void {
  if (!el) return
  el.style.transition = ''
  el.style.width = ''
  el.style.opacity = ''
}

export const Route = createFileRoute('/_authenticated')({
  beforeLoad: ({ context, location }) => {
    if (context.auth.isLoading) return
    if (!context.auth.isAuthenticated) {
      throw redirect({
        to: '/signin',
        search: { redirect: location.href }
      })
    }
  },
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(popularMoviesQuery()),
      context.queryClient.ensureQueryData(trendingTvQuery())
    ]),
  component: AuthedLayout
})

function AuthedLayout(): React.JSX.Element {
  const [layout, setLayout] = usePersistedState<ShellLayout>('vesper.layout.shell', INITIAL)
  const layoutRef = useRef(layout)
  useEffect(() => {
    layoutRef.current = layout
  }, [layout])
  const allotmentRef = useRef<AllotmentHandle>(null)
  const initialLeft = layout.leftVisible ? layout.leftWidth : 0
  const initialRight = layout.rightVisible ? layout.rightWidth : 0
  // Only the collapsed/expanded booleans are React state. Pane widths change on every frame of
  // a drag or a collapse tween and nothing in the tree needs to re-render for them.
  const [leftCollapsed, setLeftCollapsed] = useState(initialLeft === 0)
  const [rightCollapsed, setRightCollapsed] = useState(initialRight === 0)
  const initialTotal =
    typeof window !== 'undefined' ? Math.max(800, window.innerWidth - SHELL_PAD) : 1440
  const [defaultSizes] = useState<number[]>(() => [
    initialLeft,
    Math.max(0, initialTotal - initialLeft - initialRight),
    initialRight
  ])
  const sizesRef = useRef<number[]>(defaultSizes)
  const animatingRef = useRef(false)
  const rafRef = useRef<number | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const scrollContentRef = useRef<HTMLDivElement>(null)
  const leftInnerRef = useRef<HTMLDivElement>(null)
  const rightInnerRef = useRef<HTMLDivElement>(null)
  const pathname = useRouterState({ select: (s) => s.location.pathname })

  const lenisRef = useSmoothScroll(scrollRef, scrollContentRef)
  useImdbSync()

  useEffect(() => {
    // Lenis keeps its own scroll target; jumping the element directly would snap back.
    if (lenisRef.current) lenisRef.current.scrollTo(0, { immediate: true })
    else scrollRef.current?.scrollTo({ top: 0, left: 0, behavior: 'instant' })
  }, [pathname, lenisRef])

  useEffect(() => {
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    }
  }, [])

  const tween = useCallback((target: number[], onDone?: () => void): void => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    animatingRef.current = true
    const start = sizesRef.current.slice()
    const t0 = performance.now()
    const step = (): void => {
      const t = Math.min(1, (performance.now() - t0) / ANIM_MS)
      const k = easeOutQuart(t)
      const next = start.map((s, i) => Math.round(s + ((target[i] ?? s) - s) * k))
      allotmentRef.current?.resize(next)
      sizesRef.current = next
      if (t < 1) {
        rafRef.current = requestAnimationFrame(step)
      } else {
        rafRef.current = null
        animatingRef.current = false
        onDone?.()
      }
    }
    rafRef.current = requestAnimationFrame(step)
  }, [])

  const target = (l: number, r: number): number[] => {
    const total = sizesRef.current.reduce((a, b) => a + b, 0)
    return [l, Math.max(0, total - l - r), r]
  }

  const collapseLeft = useCallback((): void => {
    const el = leftInnerRef.current
    pinPane(el, sizesRef.current[0] ?? 0, false)
    tween(target(0, sizesRef.current[2] ?? 0), () => {
      unpinPane(el)
      setLayout((p) => ({ ...p, leftVisible: false }))
    })
  }, [tween, setLayout])
  const expandLeft = useCallback((): void => {
    setLayout((p) => ({ ...p, leftVisible: true }))
    const el = leftInnerRef.current
    const width = layoutRef.current.leftWidth || LEFT_DEFAULT
    pinPane(el, width, true)
    tween(target(width, sizesRef.current[2] ?? 0), () => unpinPane(el))
  }, [tween, setLayout])
  const collapseRight = useCallback((): void => {
    const el = rightInnerRef.current
    pinPane(el, sizesRef.current[2] ?? 0, false)
    tween(target(sizesRef.current[0] ?? 0, 0), () => {
      unpinPane(el)
      setLayout((p) => ({ ...p, rightVisible: false }))
    })
  }, [tween, setLayout])
  const expandRight = useCallback((): void => {
    setLayout((p) => ({ ...p, rightVisible: true }))
    const el = rightInnerRef.current
    const width = layoutRef.current.rightWidth || RIGHT_DEFAULT
    pinPane(el, width, true)
    tween(target(sizesRef.current[0] ?? 0, width), () => unpinPane(el))
  }, [tween, setLayout])

  const handleChange = (sizes: number[]): void => {
    let next = sizes
    if (!animatingRef.current) {
      const [l, c, r] = sizes
      let snappedL = l
      let snappedC = c
      let snappedR = r
      if (l !== undefined && l > 0 && Math.abs(l - LEFT_DEFAULT) <= SNAP_THRESHOLD) {
        const delta = LEFT_DEFAULT - l
        snappedL = LEFT_DEFAULT
        snappedC = (c ?? 0) - delta
      }
      if (r !== undefined && r > 0 && Math.abs(r - RIGHT_DEFAULT) <= SNAP_THRESHOLD) {
        const delta = RIGHT_DEFAULT - r
        snappedR = RIGHT_DEFAULT
        snappedC = (snappedC ?? 0) - delta
      }
      if (snappedL !== l || snappedR !== r) {
        next = [snappedL ?? 0, snappedC ?? 0, snappedR ?? 0]
        allotmentRef.current?.resize(next)
      }
    }
    sizesRef.current = next
    const [l, , r] = next
    // Same-value updates bail out in React, so these are free on frames where nothing crossed 0.
    if (l !== undefined) setLeftCollapsed(l === 0)
    if (r !== undefined) setRightCollapsed(r === 0)
    if (animatingRef.current) return
    setLayout((p) => ({
      ...p,
      leftWidth: l !== undefined && l > 0 ? l : p.leftWidth,
      rightWidth: r !== undefined && r > 0 ? r : p.rightWidth,
      leftVisible: l === undefined ? p.leftVisible : l > 0,
      rightVisible: r === undefined ? p.rightVisible : r > 0
    }))
  }

  return (
    <div className="flex h-full flex-col bg-bg">
      <TopBar
        leftCollapsed={leftCollapsed}
        rightCollapsed={rightCollapsed}
        onExpandLeft={expandLeft}
        onExpandRight={expandRight}
      />
      <div className="flex min-h-0 flex-1 px-2 pt-1 pb-2">
        <Allotment
          ref={allotmentRef}
          proportionalLayout={false}
          separator={false}
          onChange={handleChange}
          defaultSizes={defaultSizes}
        >
          <Allotment.Pane minSize={0} maxSize={LEFT_MAX} preferredSize={LEFT_DEFAULT} snap>
            <div className="flex h-full justify-end overflow-hidden">
              <div ref={leftInnerRef} className="h-full w-full shrink-0 pr-1.5">
                <LeftSidebar onCollapse={collapseLeft} />
              </div>
            </div>
          </Allotment.Pane>
          <Allotment.Pane priority={LayoutPriority.High}>
            <main className="h-full min-w-0 overflow-hidden rounded-lg bg-surface">
              <div
                ref={scrollRef}
                className={cn(
                  'h-full overflow-y-auto',
                  // Explore is the one pane with a visible scrollbar; reserve its gutter so
                  // the grid's column width doesn't jump when content grows past the fold.
                  pathname === '/explore' ? '[scrollbar-gutter:stable]' : 'scroll-hide'
                )}
              >
                <div ref={scrollContentRef}>
                  <ScrollContainerContext.Provider value={scrollRef}>
                    <Outlet />
                  </ScrollContainerContext.Provider>
                </div>
              </div>
            </main>
          </Allotment.Pane>
          <Allotment.Pane minSize={0} maxSize={RIGHT_MAX} preferredSize={RIGHT_DEFAULT} snap>
            <div className="flex h-full overflow-hidden">
              <div ref={rightInnerRef} className="h-full w-full shrink-0 pl-1.5">
                <RightSidebar onCollapse={collapseRight} />
              </div>
            </div>
          </Allotment.Pane>
        </Allotment>
      </div>
      <ProfileModal />
      <PersonModal />
    </div>
  )
}
