// Ported from interior.dev's tooltip-group (https://www.interior.dev/docs/tooltip-group):
// "delayed once, instant after that" — the first tooltip in a group waits for openDelay,
// then siblings open instantly and the bubble glides between triggers while the group is warm.
import {
  cloneElement,
  createContext,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore
} from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { cn } from '@renderer/lib/cn'

const LEAVE = [0.4, 0, 1, 1] as const

const RISE = { type: 'spring', stiffness: 560, damping: 34, mass: 0.6 } as const

const WARM = { type: 'spring', stiffness: 900, damping: 48, mass: 0.5 } as const

const GLIDE = { type: 'spring', stiffness: 520, damping: 40, mass: 0.75 } as const

const SWAP = { type: 'spring', stiffness: 700, damping: 44, mass: 0.5 } as const

let groups = 0

const stop = (t: Timer): Timer => {
  if (t !== null) clearTimeout(t)
  return null
}

export type TooltipTiming = {
  openDelay: number
  closeDelay: number
  skipDelay: number
}

type Timer = ReturnType<typeof setTimeout> | null

type TooltipStore = {
  seat: string
  subscribe: (fn: () => void) => () => void
  getActive: () => string | null
  getWarm: () => boolean
  getSkipped: () => boolean
  getTravel: () => number
  open: (id: string, immediate: boolean, x?: number) => void
  close: (id: string, immediate: boolean) => void
  dismiss: (id: string) => void
  unblock: (id: string) => void
  setTiming: (next: TooltipTiming) => void
  reset: () => void
  dispose: () => void
}

function createTooltipStore(initialTiming: TooltipTiming): TooltipStore {
  const listeners = new Set<() => void>()

  let timing = initialTiming

  let active: string | null = null
  let pending: string | null = null
  let blocked: string | null = null
  let warm = false
  let skipped = false
  let lastX: number | null = null
  let travel = 0

  let openTimer: Timer = null
  let closeTimer: Timer = null
  let coolTimer: Timer = null

  const notify = (): void => {
    for (const fn of listeners) fn()
  }

  const setActive = (next: string | null): void => {
    if (active === next) return
    if (next !== null) {
      skipped = warm
      warm = true
    }
    active = next
    notify()
  }

  const cool = (): void => {
    coolTimer = stop(coolTimer)
    const { skipDelay } = timing
    if (skipDelay <= 0) {
      if (warm) {
        warm = false
        notify()
      }
      return
    }
    coolTimer = setTimeout(() => {
      coolTimer = null
      warm = false
      notify()
    }, skipDelay)
  }

  groups += 1
  const seat = `tooltip-seat-${groups}`

  return {
    seat,
    subscribe(fn) {
      listeners.add(fn)
      return () => {
        listeners.delete(fn)
      }
    },
    getActive: () => active,
    getWarm: () => warm,
    getSkipped: () => skipped,
    getTravel: () => travel,
    open(id, immediate, x) {
      if (blocked === id) return
      closeTimer = stop(closeTimer)
      coolTimer = stop(coolTimer)
      if (active === id) {
        openTimer = stop(openTimer)
        pending = null
        return
      }
      const arrive = (): void => {
        travel = lastX !== null && x !== undefined ? Math.sign(x - lastX) : 0
        lastX = x ?? null
        setActive(id)
      }
      if (immediate || warm) {
        openTimer = stop(openTimer)
        pending = null
        arrive()
        return
      }
      openTimer = stop(openTimer)
      pending = id
      openTimer = setTimeout(() => {
        openTimer = null
        pending = null
        arrive()
      }, timing.openDelay)
    },
    close(id, immediate) {
      if (pending === id) {
        openTimer = stop(openTimer)
        pending = null
      }
      if (active !== id) return
      closeTimer = stop(closeTimer)
      const finish = (): void => {
        closeTimer = null
        setActive(null)
        cool()
      }
      if (immediate || timing.closeDelay <= 0) {
        finish()
        return
      }
      closeTimer = setTimeout(finish, timing.closeDelay)
    },
    dismiss(id) {
      blocked = id
      openTimer = stop(openTimer)
      closeTimer = stop(closeTimer)
      coolTimer = stop(coolTimer)
      pending = null
      const wasWarm = warm
      warm = false
      if (active === id) setActive(null)
      else if (wasWarm) notify()
    },
    unblock(id) {
      if (blocked === id) blocked = null
    },
    setTiming(next) {
      timing = next
    },
    reset() {
      openTimer = stop(openTimer)
      closeTimer = stop(closeTimer)
      coolTimer = stop(coolTimer)
      pending = null
      blocked = null
      lastX = null
      travel = 0
      const wasWarm = warm
      warm = false
      if (active !== null) setActive(null)
      else if (wasWarm) notify()
    },
    dispose() {
      openTimer = stop(openTimer)
      closeTimer = stop(closeTimer)
      coolTimer = stop(coolTimer)
      listeners.clear()
    }
  }
}

const TooltipGroupContext = createContext<TooltipStore | null>(null)

function useDismissOnBlur(store: TooltipStore, enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return
    const bail = (): void => store.reset()
    const onVisibility = (): void => {
      if (document.hidden) store.reset()
    }
    window.addEventListener('blur', bail)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.removeEventListener('blur', bail)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [store, enabled])
}

export type TooltipGroupProps = {
  children: React.ReactNode
  openDelay?: number
  closeDelay?: number
  skipDelay?: number
  onWarmChange?: (warm: boolean) => void
  className?: string
}

export function TooltipGroup({
  children,
  openDelay = 200,
  closeDelay = 120,
  skipDelay = 400,
  onWarmChange,
  className = ''
}: TooltipGroupProps): React.JSX.Element {
  const [store] = useState(() => createTooltipStore({ openDelay, closeDelay, skipDelay }))
  useEffect(() => {
    store.setTiming({ openDelay, closeDelay, skipDelay })
  }, [store, openDelay, closeDelay, skipDelay])

  const warm = useSyncExternalStore(store.subscribe, store.getWarm, () => false)

  const report = useRef(onWarmChange)
  useEffect(() => {
    report.current = onWarmChange
  })

  useEffect(() => {
    report.current?.(warm)
  }, [warm])

  useEffect(() => () => store.dispose(), [store])
  useDismissOnBlur(store, true)

  return (
    <TooltipGroupContext.Provider value={store}>
      {className ? <div className={className}>{children}</div> : children}
    </TooltipGroupContext.Provider>
  )
}

export type UseTooltipOptions = {
  disabled?: boolean
  openDelay?: number
  closeDelay?: number
  skipDelay?: number
}

export type TooltipTriggerProps = {
  onPointerEnter: (event: React.PointerEvent<HTMLElement>) => void
  onPointerLeave: (event: React.PointerEvent<HTMLElement>) => void
  onPointerDown: (event: React.PointerEvent<HTMLElement>) => void
  onPointerCancel: (event: React.PointerEvent<HTMLElement>) => void
  onFocus: (event: React.FocusEvent<HTMLElement>) => void
  onBlur: (event: React.FocusEvent<HTMLElement>) => void
  onKeyDown: (event: React.KeyboardEvent<HTMLElement>) => void
}

export type UseTooltipReturn = {
  open: boolean
  warm: boolean
  skipped: boolean
  travel: number
  tooltipId: string
  seat: string
  triggerProps: TooltipTriggerProps
}

function isKeyboardFocus(el: HTMLElement): boolean {
  try {
    return el.matches(':focus-visible')
  } catch {
    return true
  }
}

function useTooltip({
  disabled = false,
  openDelay = 200,
  closeDelay = 120,
  skipDelay = 400
}: UseTooltipOptions = {}): UseTooltipReturn {
  const tooltipId = `tt-${useId()}`
  const group = useContext(TooltipGroupContext)

  const [solo] = useState(() =>
    group === null ? createTooltipStore({ openDelay, closeDelay, skipDelay }) : null
  )
  const store = group ?? (solo as TooltipStore)

  useEffect(() => {
    solo?.setTiming({ openDelay, closeDelay, skipDelay })
  }, [solo, openDelay, closeDelay, skipDelay])

  useEffect(() => {
    return () => {
      store.close(tooltipId, true)
      solo?.dispose()
    }
  }, [store, solo, tooltipId])
  useDismissOnBlur(store, group === null)

  const open = useSyncExternalStore(
    store.subscribe,
    () => store.getActive() === tooltipId,
    () => false
  )
  const warm = useSyncExternalStore(store.subscribe, store.getWarm, () => false)
  const skipped = useSyncExternalStore(store.subscribe, store.getSkipped, () => false)
  const travel = useSyncExternalStore(store.subscribe, store.getTravel, () => 0)

  useEffect(() => {
    if (!disabled) return
    store.close(tooltipId, true)
  }, [disabled, store, tooltipId])

  const triggerProps: TooltipTriggerProps = {
    onPointerEnter: (event) => {
      if (!disabled) store.open(tooltipId, false, event.clientX)
    },
    onPointerLeave: () => {
      store.unblock(tooltipId)
      store.close(tooltipId, false)
    },
    onPointerDown: () => store.dismiss(tooltipId),
    onPointerCancel: () => {
      store.unblock(tooltipId)
      store.close(tooltipId, true)
    },
    onFocus: (event) => {
      if (disabled) return
      if (!isKeyboardFocus(event.currentTarget)) return
      store.open(tooltipId, true)
    },
    onBlur: () => {
      store.unblock(tooltipId)
      store.close(tooltipId, true)
    },
    onKeyDown: (event) => {
      if (event.key === 'Escape') store.dismiss(tooltipId)
    }
  }

  return { open, warm, skipped, travel, tooltipId, seat: store.seat, triggerProps }
}

type TriggerChild = React.ReactElement<
  React.HTMLAttributes<HTMLElement> & { 'aria-describedby'?: string }
>

export type TooltipProps = UseTooltipOptions & {
  label: React.ReactNode
  children: TriggerChild
  side?: 'top' | 'bottom'
  /** Where the bubble grows from: centred on the trigger, or from its left edge outward —
   *  for triggers hugging a clipped container's edge, where a centred bubble would be cut. */
  align?: 'center' | 'start'
  className?: string
  style?: React.CSSProperties
  contentClassName?: string
}

function chain<E>(
  theirs: ((event: E) => void) | undefined,
  ours: (event: E) => void
): (event: E) => void {
  return (event) => {
    theirs?.(event)
    ours(event)
  }
}

export function Tooltip({
  label,
  children,
  side = 'top',
  align = 'center',
  disabled = false,
  openDelay,
  closeDelay,
  skipDelay,
  className,
  style,
  contentClassName
}: TooltipProps): React.JSX.Element {
  const { open, skipped, travel, tooltipId, seat, triggerProps } = useTooltip({
    disabled,
    openDelay,
    closeDelay,
    skipDelay
  })
  const reduced = useReducedMotion()

  const described = [children.props['aria-describedby'], open ? tooltipId : null]
    .filter(Boolean)
    .join(' ')

  const trigger = cloneElement(children, {
    'aria-describedby': described.length > 0 ? described : undefined,
    onPointerEnter: chain(children.props.onPointerEnter, triggerProps.onPointerEnter),
    onPointerLeave: chain(children.props.onPointerLeave, triggerProps.onPointerLeave),
    onPointerDown: chain(children.props.onPointerDown, triggerProps.onPointerDown),
    onPointerCancel: chain(children.props.onPointerCancel, triggerProps.onPointerCancel),
    onFocus: chain(children.props.onFocus, triggerProps.onFocus),
    onBlur: chain(children.props.onBlur, triggerProps.onBlur),
    onKeyDown: chain(children.props.onKeyDown, triggerProps.onKeyDown)
  })

  const lift = side === 'top' ? 7 : -7

  const bubble = (
    <AnimatePresence>
      {open && (
        <motion.span
          role="tooltip"
          id={tooltipId}
          layoutId={reduced ? undefined : seat}
          initial={
            reduced
              ? false
              : skipped
                ? { opacity: 0, scale: 1, y: 0, filter: 'blur(0px)' }
                : { opacity: 0, scale: 0.9, y: lift, filter: 'blur(4px)' }
          }
          animate={{ opacity: 1, scale: 1, y: 0, filter: 'blur(0px)' }}
          exit={
            reduced
              ? { opacity: 0, transition: { duration: 0 } }
              : {
                  opacity: 0,
                  scale: 0.96,
                  y: lift * 0.35,
                  filter: 'blur(2px)',
                  transition: { duration: 0.12, ease: LEAVE }
                }
          }
          transition={reduced ? { duration: 0 } : { ...(skipped ? WARM : RISE), layout: GLIDE }}
          style={{
            transformOrigin: `${align === 'center' ? '50%' : '0%'} ${side === 'top' ? '100%' : '0%'}`
          }}
          className={cn(
            'relative w-max max-w-[220px] shrink-0 overflow-hidden rounded-md px-2 py-1 text-[12px] leading-4 font-medium text-text',
            contentClassName
          )}
        >
          <motion.span
            aria-hidden
            layout={!reduced}
            transition={reduced ? { duration: 0 } : GLIDE}
            className="absolute inset-0 rounded-md bg-surface-3 shadow-[0_4px_16px_rgba(0,0,0,0.3)]"
          />
          <motion.span
            layout={reduced ? false : 'position'}
            initial={
              reduced
                ? false
                : skipped
                  ? { opacity: 0, x: travel * 14, y: 0 }
                  : { opacity: 0, x: 0, y: 9 }
            }
            animate={{ opacity: 1, x: 0, y: 0 }}
            transition={reduced ? { duration: 0 } : SWAP}
            className="relative block whitespace-nowrap"
          >
            {label}
          </motion.span>
        </motion.span>
      )}
    </AnimatePresence>
  )

  return (
    <span className={cn('relative inline-flex', className)} style={style}>
      {trigger}

      {/* A zero-width flex box centred on the trigger: the bubble grows out of it in both
          directions, so it stays centred whatever the label's width. */}
      <span
        aria-hidden={!open}
        className={cn(
          'pointer-events-none absolute z-[100] flex w-0',
          align === 'center' ? 'left-1/2 justify-center' : 'left-0 justify-start'
        )}
        style={side === 'top' ? { bottom: 'calc(100% + 7px)' } : { top: 'calc(100% + 7px)' }}
      >
        {bubble}
      </span>
    </span>
  )
}
