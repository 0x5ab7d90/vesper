import { useEffect, useRef } from 'react'
import './drop-mascot.css'

/**
 * The Vesper drop, same geometry as the site: a circle with two 45 degree tangents meeting a
 * small rounded tip, eyes clipped by the body. Three moods for the splash screen:
 *
 * - idle: the five second daydream loop from the site.
 * - updating: the drop shrinks and sits upright while a ring of twelve dots turns around it. The
 *   leading dot is larger and the eyes follow it round. With a known percentage, dots light up
 *   in proportion so the ring doubles as a progress dial.
 * - done: the ring collapses into the drop, it pops back to full size and squints happily.
 */
export type DropMood = 'idle' | 'updating' | 'done'

interface Props {
  mood: DropMood
  /** 0..100 while updating; omit for an indeterminate ring. */
  percent?: number | null
  size?: number
}

const BODY = 'M-44.0 -39.8 A62.2 62.2 0 1 0 44.0 -39.8 L10.6 -73.2 A15.0 15.0 0 0 0 -10.6 -73.2 Z'
const DOTS = 12
const RING_RADIUS = 74
const RING_SPIN_MS = 6000

export function DropMascot({ mood, percent = null, size = 88 }: Props): React.JSX.Element {
  const root = useRef<HTMLSpanElement>(null)
  const ring = useRef<SVGGElement>(null)

  // While updating, the eyes chase the leading dot. Its angle is read straight off the ring's
  // CSS animation so the two can never drift apart.
  useEffect(() => {
    const el = root.current
    const ringEl = ring.current
    if (!el || !ringEl || mood !== 'updating') return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    let raf = 0
    const tick = (): void => {
      const anim = ringEl.getAnimations()[0]
      const t = anim ? Number(anim.currentTime ?? 0) : 0
      // No easing here: the eyes sit exactly where the leading dot is, every frame.
      const theta = -Math.PI / 2 + (2 * Math.PI * (t % RING_SPIN_MS)) / RING_SPIN_MS
      const gx = 4 + Math.cos(theta) * 28
      const gy = -12 + Math.sin(theta) * 22
      el.style.setProperty('--gaze-x', `${gx.toFixed(2)}px`)
      el.style.setProperty('--gaze-y', `${gy.toFixed(2)}px`)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [mood])

  const lit = percent == null ? 0 : Math.round((Math.max(0, Math.min(100, percent)) / 100) * DOTS)

  return (
    <span
      ref={root}
      className="drop"
      data-mood={mood}
      style={{ width: size, height: size }}
      role="img"
      aria-label="Vesper"
    >
      <svg viewBox="0 0 170 170" aria-hidden="true">
        <defs>
          <clipPath id="drop-clip">
            <path d={BODY} />
          </clipPath>
        </defs>
        <g transform="translate(85 92)">
          <g ref={ring} className="drop__ring">
            {Array.from({ length: DOTS }, (_, i) => {
              const a = -Math.PI / 2 + (2 * Math.PI * i) / DOTS
              return (
                <circle
                  key={i}
                  className="drop__dot"
                  data-lead={i === 0 ? '' : undefined}
                  data-lit={i < lit ? '' : undefined}
                  cx={Math.cos(a) * RING_RADIUS}
                  cy={Math.sin(a) * RING_RADIUS}
                  r={i === 0 ? 7 : 5}
                  style={{ transitionDelay: `${i * 22}ms` }}
                />
              )
            })}
          </g>
          <g className="drop__stage">
            <g className="drop__body">
              <path d={BODY} className="drop__fill" />
              <g clipPath="url(#drop-clip)">
                <g className="drop__eyes">
                  <g className="drop__eye-wrap drop__eye-wrap--l">
                    <rect
                      className="drop__eye drop__eye--l"
                      x="-7.25"
                      y="-16"
                      width="14.5"
                      height="32"
                      rx="7.25"
                    />
                  </g>
                  <g className="drop__eye-wrap drop__eye-wrap--r">
                    <rect
                      className="drop__eye drop__eye--r"
                      x="-7.25"
                      y="-16"
                      width="14.5"
                      height="32"
                      rx="7.25"
                    />
                  </g>
                </g>
              </g>
            </g>
          </g>
        </g>
      </svg>
    </span>
  )
}
