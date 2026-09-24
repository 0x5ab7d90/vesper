import { useEffect, useRef, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { Button as BaseButton } from '@base-ui/react/button'
import { ScrollChevrons } from '@renderer/components/ui/scroll-chevrons'
import { IMAGE_EDGE } from '@renderer/components/ui/image-outline'
import type { PosterRowItem } from '@renderer/components/media/poster-row'
import { useScrollContainer } from '@renderer/lib/scroll-container'
import { scrollFadeStyle, useScrollEdges } from '@renderer/lib/scroll-edges'
import { usePreloadRoute } from '@renderer/lib/use-preload-route'
import { tmdbImage } from '@renderer/lib/tmdb'
import { cn } from '@renderer/lib/cn'

/**
 * The TV safe area. Televisions overscan, so nothing that matters sits in the outer 64px.
 * Every TV surface lines its content up on this gutter.
 */
export const TV_GUTTER = 'px-16'

// Hover grows a card by 5% and brightens its image edge (IMAGE_EDGE) a touch, so the card
// reads as picked up rather than outlined. The scroller's vertical padding leaves room for the
// growth, since an overflow-x scroller clips vertically too.
export const TV_HOVER_LIFT =
  'transition-[scale] duration-(--hover-dur) ease-(--hover-ease) after:transition-[box-shadow] after:duration-(--hover-dur) hover:scale-[1.05] hover:after:ring-white/20 focus-visible:scale-[1.05] focus-visible:after:ring-white/30 active:scale-[1.02]'

export function TvSectionTitle({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <h2 className={cn(TV_GUTTER, 'text-[28px] leading-8 font-medium tracking-[-0.01em] text-text')}>
      {children}
    </h2>
  )
}

export function TvRow({
  title,
  aside,
  children
}: {
  title: React.ReactNode
  aside?: React.ReactNode
  children: React.ReactNode
}): React.JSX.Element {
  const scrollRef = useRef<HTMLDivElement>(null)
  const edges = useScrollEdges(scrollRef)
  return (
    <section className="flex flex-col gap-3">
      {aside ? (
        <div className="flex items-center justify-between pr-16">
          <TvSectionTitle>{title}</TvSectionTitle>
          {aside}
        </div>
      ) : (
        <TvSectionTitle>{title}</TvSectionTitle>
      )}
      <div className="group relative">
        <div
          ref={scrollRef}
          className={cn(TV_GUTTER, 'scroll-hide flex gap-6 overflow-x-auto py-5')}
          style={scrollFadeStyle(edges)}
        >
          {children}
        </div>
        <ScrollChevrons scrollRef={scrollRef} size="tv" />
      </div>
    </section>
  )
}

export function TvPosterCard({
  item,
  className,
  preloadOnView = true
}: {
  item: PosterRowItem
  /** Overrides the fixed row size, e.g. to fill a grid column. */
  className?: string
  /** Endless grids turn this off: preloading every card that scrolls past floods the queue. */
  preloadOnView?: boolean
}): React.JSX.Element {
  const navigate = useNavigate()
  const ref = useRef<HTMLButtonElement>(null)
  const target = item.type
    ? { to: item.type === 'movie' ? '/movie/$id' : '/tv/$id', params: { id: String(item.id) } }
    : null
  usePreloadRoute(ref, target, { viewport: preloadOnView })
  // Posters fill a quarter of a 1080p row; w342 goes soft at that size.
  const poster = (item.posterPath ? tmdbImage(item.posterPath, 'w500') : undefined) ?? item.poster
  return (
    <BaseButton
      ref={ref}
      onClick={() => {
        if (item.type === 'movie') {
          navigate({ to: '/movie/$id', params: { id: String(item.id) }, viewTransition: false })
        } else if (item.type === 'tv') {
          navigate({ to: '/tv/$id', params: { id: String(item.id) }, viewTransition: false })
        }
      }}
      aria-label={item.title}
      className={cn(
        'relative h-[330px] w-[220px] shrink-0 overflow-hidden rounded-xl bg-surface-2 bg-cover bg-center outline-none',
        IMAGE_EDGE,
        TV_HOVER_LIFT,
        className
      )}
      style={{ backgroundImage: poster ? `url(${poster})` : undefined }}
    >
      {poster ? null : (
        <span className="absolute inset-x-4 bottom-4 text-left text-[18px] leading-6 font-medium text-text">
          {item.title}
        </span>
      )}
    </BaseButton>
  )
}

export function TvPosterRow({
  title,
  items,
  max = 20
}: {
  title: string
  items: PosterRowItem[]
  max?: number
}): React.JSX.Element {
  return (
    <TvRow title={title}>
      {items.slice(0, max).map((item) => (
        <TvPosterCard key={`${item.type}-${item.id}`} item={item} />
      ))}
    </TvRow>
  )
}

/** Title (32px) + gap + the scroller's 20px padding either side of a 330px poster. */
export const TV_POSTER_ROW_HEIGHT = 32 + 12 + 20 + 330 + 20

export function TvPosterRowSkeleton({ title }: { title?: string }): React.JSX.Element {
  return (
    <section aria-hidden className="flex flex-col gap-3">
      {title ? (
        <TvSectionTitle>{title}</TvSectionTitle>
      ) : (
        <div className={cn(TV_GUTTER, 'h-8')}>
          <div className="h-8 w-56 animate-pulse rounded-md bg-surface-2" />
        </div>
      )}
      <div className={cn(TV_GUTTER, 'flex gap-6 overflow-hidden py-5')}>
        {Array.from({ length: 10 }).map((_, i) => (
          <div
            key={i}
            className="h-[330px] w-[220px] shrink-0 animate-pulse rounded-xl bg-surface-2"
          />
        ))}
      </div>
    </section>
  )
}

// Same idea as the desktop home's deferred rows: a row mounts once it is within a screen of
// the viewport, and then stays mounted so its horizontal scroll survives.
export function TvDeferred({ children }: { children: React.ReactNode }): React.JSX.Element {
  const scrollRef = useScrollContainer()
  const ref = useRef<HTMLDivElement>(null)
  const [shown, setShown] = useState(false)

  useEffect(() => {
    if (shown) return
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) setShown(true)
      },
      { root: scrollRef?.current ?? null, rootMargin: '1200px 0px' }
    )
    io.observe(el)
    return () => io.disconnect()
  }, [shown, scrollRef])

  return (
    <div ref={ref} style={{ minHeight: shown ? undefined : TV_POSTER_ROW_HEIGHT }}>
      {shown ? children : <TvPosterRowSkeleton />}
    </div>
  )
}

export function TvPill({
  active,
  onClick,
  children
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'inline-flex h-12 shrink-0 items-center rounded-full px-6 text-[20px] leading-6 font-medium whitespace-nowrap outline-none transition-[background-color,color,scale] duration-(--hover-dur) ease-(--hover-ease) active:scale-[0.97] focus-visible:ring-1 focus-visible:ring-white/30',
        active
          ? 'bg-white text-black'
          : 'bg-white/10 text-text-secondary hover:bg-white/20 hover:text-text'
      )}
    >
      {children}
    </button>
  )
}

export interface TvPillOption<T> {
  value: T
  label: string
}

// A single-choice row of pills (seasons, genres, sorts). Long rows scroll sideways behind
// always-visible arrows: a show with thirty seasons shouldn't need a trackpad.
export function TvPillRow<T extends string | number>({
  label,
  options,
  value,
  onChange
}: {
  label: string
  options: TvPillOption<T>[]
  value: T
  onChange: (value: T) => void
}): React.JSX.Element {
  const scrollRef = useRef<HTMLDivElement>(null)
  const edges = useScrollEdges(scrollRef)

  // Start with the chosen pill in view (season 12 of 20, say). Set scrollLeft directly:
  // scrollIntoView would also drag the page vertically when the row sits below the fold.
  useEffect(() => {
    const el = scrollRef.current
    const active = el?.querySelector<HTMLElement>('[aria-pressed="true"]')
    if (!el || !active) return
    el.scrollLeft = Math.max(0, active.offsetLeft - (el.clientWidth - active.offsetWidth) / 2)
    // Only when the set of pills changes; re-centring on every pick would yank the row around.
  }, [options])

  return (
    <div className="group relative">
      <div
        ref={scrollRef}
        role="group"
        aria-label={label}
        className={cn(TV_GUTTER, 'scroll-hide relative flex gap-3 overflow-x-auto py-1')}
        style={scrollFadeStyle(edges)}
      >
        {options.map((o) => (
          <TvPill key={o.value} active={o.value === value} onClick={() => onChange(o.value)}>
            {o.label}
          </TvPill>
        ))}
      </div>
      <ScrollChevrons scrollRef={scrollRef} size="tv-compact" />
    </div>
  )
}
