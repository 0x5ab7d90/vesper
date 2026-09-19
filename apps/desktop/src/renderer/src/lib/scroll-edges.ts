import { useEffect, useState, type CSSProperties, type RefObject } from 'react'

const FADE = 28

/**
 * Which edges of a horizontal scroller still have content past them. Used to fade the edge
 * that has more to scroll, so the cut-off reads as "keeps going" rather than "ends here".
 */
export function useScrollEdges(ref: RefObject<HTMLElement | null>): {
  start: boolean
  end: boolean
} {
  const [edges, setEdges] = useState({ start: false, end: false })

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const update = (): void => {
      const start = el.scrollLeft > 1
      const end = el.scrollLeft + el.clientWidth < el.scrollWidth - 1
      setEdges((prev) => (prev.start === start && prev.end === end ? prev : { start, end }))
    }
    update()
    el.addEventListener('scroll', update, { passive: true })
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => {
      el.removeEventListener('scroll', update)
      ro.disconnect()
    }
  }, [ref])

  return edges
}

/** A mask that fades whichever edges still hide content. */
export function scrollFadeStyle(edges: { start: boolean; end: boolean }): CSSProperties {
  if (!edges.start && !edges.end) return {}
  const from = edges.start ? `transparent, black ${FADE}px` : 'black'
  const to = edges.end ? `black calc(100% - ${FADE}px), transparent` : 'black'
  const mask = `linear-gradient(to right, ${from}, ${to})`
  return { maskImage: mask, WebkitMaskImage: mask }
}
