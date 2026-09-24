import { useEffect, useRef, useState } from 'react'
import { Link, Outlet, useRouterState } from '@tanstack/react-router'
import { AnimatePresence, m as motion, useReducedMotion } from 'motion/react'
import { WindowsControls } from '@renderer/components/layout/top-bar'
import { UserMenu } from '@renderer/components/layout/user-menu'
import { PersonModal } from '@renderer/components/media/person-modal'
import { ProfileModal } from '@renderer/components/profile/profile-modal'
import { ChevronLeftIcon, TvIcon } from '@renderer/components/icons'
import { useSmoothScroll } from '@renderer/hooks/use-smooth-scroll'
import { ScrollContainerContext } from '@renderer/lib/scroll-container'
import { setTvMode } from '@renderer/lib/tv-mode'
import { useTvAmbient } from '@renderer/lib/tv-ambient'
import { EASE_OUT } from '@renderer/lib/motion'
import { useNavState } from '@renderer/lib/use-nav-state'
import { isMac, isWindows } from '@renderer/lib/platform'
import { cn } from '@renderer/lib/cn'

/** Routes that draw their own full-bleed TV layout; everything else sits on a plate under the nav. */
function hasTvLayout(pathname: string): boolean {
  return (
    pathname === '/' ||
    pathname === '/search' ||
    pathname === '/explore' ||
    pathname.startsWith('/movie/') ||
    pathname.startsWith('/tv/')
  )
}

// The whole app at ten feet: no sidebars, no title-bar search, one row of big targets across
// the top, and pages that fill the screen edge to edge.
export function TvShell(): React.JSX.Element {
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const scrollRef = useRef<HTMLDivElement>(null)
  const scrollContentRef = useRef<HTMLDivElement>(null)
  const lenisRef = useSmoothScroll(scrollRef, scrollContentRef)
  const [scrolled, setScrolled] = useState(false)
  const [fullscreen, setFullscreen] = useState(true)

  useEffect(() => {
    if (lenisRef.current) lenisRef.current.scrollTo(0, { immediate: true })
    else scrollRef.current?.scrollTo({ top: 0, left: 0, behavior: 'instant' })
  }, [pathname, lenisRef])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const onScroll = (): void => setScrolled(el.scrollTop > 8)
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [])

  // Opening the app straight into Big Picture should fill the screen the same way switching to it
  // does. After that the window is the user's: F11 out and we stay out.
  useEffect(() => {
    let cancelled = false
    void window.api.window.isFullScreen().then((fs) => {
      if (cancelled) return
      setFullscreen(fs)
      if (!fs) void window.api.window.setFullScreen(true)
    })
    const off = window.api.window.onFullScreenChange(setFullscreen)
    return () => {
      cancelled = true
      off()
    }
  }, [])

  const tvLayout = hasTvLayout(pathname)

  return (
    <div className="relative h-full bg-bg">
      <AmbientGlow />
      <div ref={scrollRef} className="scroll-hide relative h-full overflow-y-auto">
        <div ref={scrollContentRef}>
          <ScrollContainerContext.Provider value={scrollRef}>
            {tvLayout ? (
              <Outlet />
            ) : (
              <div className="px-12 pt-28 pb-12">
                <main className="min-h-[calc(100vh-160px)] overflow-hidden rounded-lg bg-surface">
                  <Outlet />
                </main>
              </div>
            )}
          </ScrollContainerContext.Provider>
        </div>
      </div>
      <TvNav pathname={pathname} scrolled={scrolled} fullscreen={fullscreen} />
      <ProfileModal />
      <PersonModal />
    </div>
  )
}

// A blurred, dimmed copy of the title on screen, fixed behind the scroller. The two scrims
// keep it a glow rather than a picture: text on top stays legible over the brightest art.
function AmbientGlow(): React.JSX.Element {
  const src = useTvAmbient()
  const reduceMotion = useReducedMotion()
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <AnimatePresence initial={false}>
        {src ? (
          <motion.div
            key={src}
            className="absolute -inset-[15%] bg-cover bg-center"
            style={{
              backgroundImage: `url(${src})`,
              filter: 'blur(90px) saturate(1.5)'
            }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.55 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduceMotion ? 0 : 1.2, ease: EASE_OUT }}
          />
        ) : null}
      </AnimatePresence>
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(120% 90% at 50% 0%, rgba(0,0,0,0) 0%, rgba(0,0,0,0.35) 60%, rgba(0,0,0,0.6) 100%)'
        }}
      />
    </div>
  )
}

// Blur steps from strongest at the top to none, each one masked to a shorter band than the
// last, so the frosting thins out gradually instead of stopping at a hard line.
const BLUR_STEPS = [
  { blur: 2, from: 60, to: 100 },
  { blur: 6, from: 40, to: 80 },
  { blur: 14, from: 20, to: 60 },
  { blur: 28, from: 0, to: 40 }
]

// Reaches well past the nav's own height so the fade has room to happen over the page rather
// than at the nav's bottom edge.
function NavBackdrop({ scrolled }: { scrolled: boolean }): React.JSX.Element {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-44">
      {/* Each step fades on its own: opacity below 1 on a shared wrapper would cut the steps
          off from the page behind them, and they'd have nothing to blur mid-transition. */}
      {BLUR_STEPS.map((s) => {
        const mask = `linear-gradient(180deg, black ${s.from}%, transparent ${s.to}%)`
        return (
          <div
            key={s.blur}
            className={cn(
              'absolute inset-0 transition-opacity duration-300 ease-out',
              scrolled ? 'opacity-100' : 'opacity-0'
            )}
            style={{
              backdropFilter: `blur(${s.blur}px)`,
              WebkitBackdropFilter: `blur(${s.blur}px)`,
              maskImage: mask,
              WebkitMaskImage: mask
            }}
          />
        )
      })}
      <div
        className="absolute inset-0 transition-opacity duration-300 ease-out"
        style={{
          background:
            'linear-gradient(180deg, rgba(0,0,0,0.7) 0%, rgba(0,0,0,0.45) 45%, rgba(0,0,0,0) 100%)',
          opacity: scrolled ? 1 : 0.85
        }}
      />
    </div>
  )
}

const TABS = [
  { to: '/', label: 'Home' },
  { to: '/explore', label: 'Browse' },
  { to: '/search', label: 'Search' }
] as const

const NAV_PILL =
  'inline-flex h-12 items-center gap-3 rounded-full px-6 text-[20px] leading-6 font-medium outline-none transition-[background-color,color,scale] duration-(--hover-dur) ease-(--hover-ease) active:scale-[0.97] focus-visible:ring-1 focus-visible:ring-white/30'

function TvNav({
  pathname,
  scrolled,
  fullscreen
}: {
  pathname: string
  scrolled: boolean
  fullscreen: boolean
}): React.JSX.Element {
  const nav = useNavState()
  const [menuOpen, setMenuOpen] = useState(false)
  const windowed = !fullscreen
  // The three tabs are top-level places; everything else is somewhere you came from.
  const showBack = !TABS.some((t) => t.to === pathname) && nav.canGoBack

  return (
    <header
      className={cn(
        'absolute inset-x-0 top-0 z-40 flex h-24 items-center gap-3 px-12',
        windowed && !menuOpen ? 'app-drag' : 'app-no-drag',
        windowed && isWindows && 'pr-0'
      )}
    >
      <NavBackdrop scrolled={scrolled} />
      {windowed && isMac ? <div className="w-[78px] shrink-0" aria-hidden /> : null}
      <nav className="app-no-drag flex items-center gap-2">
        {showBack ? (
          <button
            type="button"
            aria-label="Back"
            onClick={nav.back}
            className={cn(
              NAV_PILL,
              'mr-2 w-12 justify-center bg-white/10 px-0 text-text hover:bg-white/20'
            )}
          >
            <ChevronLeftIcon className="size-6" />
          </button>
        ) : null}
        {TABS.map((t) => (
          <NavLink key={t.to} to={t.to} active={pathname === t.to}>
            {t.label}
          </NavLink>
        ))}
      </nav>

      <div className="app-no-drag ml-auto flex items-center gap-4">
        <button
          type="button"
          onClick={() => setTvMode(false)}
          className={cn(NAV_PILL, 'bg-white/10 text-text hover:bg-white/20')}
        >
          <TvIcon className="size-6" />
          Exit Big Picture
        </button>
        <UserMenu onOpenChange={setMenuOpen} avatarClassName="size-12" />
      </div>
      {windowed && isWindows ? <WindowsControls /> : null}
    </header>
  )
}

function NavLink({
  to,
  active,
  children
}: {
  to: (typeof TABS)[number]['to']
  active: boolean
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <Link
      to={to}
      className={cn(
        NAV_PILL,
        active ? 'bg-white text-black' : 'text-text-tertiary hover:bg-white/10 hover:text-text'
      )}
    >
      {children}
    </Link>
  )
}
