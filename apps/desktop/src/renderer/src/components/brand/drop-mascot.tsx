import { useEffect, useRef } from 'react'
import type { DropMood } from './drop-moods'
import './drop-mascot.css'

/**
 * The Vesper drop, same geometry as the site: a circle with two 45 degree tangents meeting a
 * small rounded tip, eyes clipped by the body. One component, six moods, each one a set of CSS
 * transforms and eye shapes so the moods cross-fade into each other. See `drop-moods.ts` for
 * what each mood is for.
 */
export type { DropMood }

interface Props {
  mood: DropMood
  /** 0..100 while waiting; omit for an indeterminate ring. */
  percent?: number | null
  size?: number
  /** Idle daydream loop. Off holds the rest pose. */
  loop?: boolean
  /** Glass treatment: gradient, rim, shading, specular, shadow. Off is the flat mark. */
  gloss?: boolean
  fill?: string
  className?: string
}

const BODY = 'M-44.0 -39.8 A62.2 62.2 0 1 0 44.0 -39.8 L10.6 -73.2 A15.0 15.0 0 0 0 -10.6 -73.2 Z'
// The eye is a path rather than a rect so its shape can transition: a capsule at rest, a smiling
// arch when happy. Both shapes are six cubics in the same order, which is what lets one fold into
// the other. The CSS owns both; this is the rest shape and the fallback if `d` is unsupported.
const EYE =
  'M-7.25 -8.75 C-7.25 -12.754 -4.004 -16 0 -16 C4.004 -16 7.25 -12.754 7.25 -8.75 C7.25 -2.917 7.25 2.917 7.25 8.75 C7.25 12.754 4.004 16 0 16 C-4.004 16 -7.25 12.754 -7.25 8.75 C-7.25 2.917 -7.25 -2.917 -7.25 -8.75 Z'
const DOTS = 12
const RING_RADIUS = 74
const RING_SPIN_MS = 6000

export function DropMascot({
  mood,
  percent = null,
  size = 88,
  loop = true,
  gloss = true,
  fill,
  className
}: Props): React.JSX.Element {
  const root = useRef<HTMLSpanElement>(null)
  const ring = useRef<SVGGElement>(null)

  // While waiting, the eyes chase the leading dot. Its angle is read straight off the ring's
  // CSS animation so the two can never drift apart.
  useEffect(() => {
    const el = root.current
    const ringEl = ring.current
    if (!el || !ringEl || mood !== 'waiting') return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    let raf = 0
    const tick = (): void => {
      const anim = ringEl.getAnimations()[0]
      const t = anim ? Number(anim.currentTime ?? 0) : 0
      const theta = -Math.PI / 2 + (2 * Math.PI * (t % RING_SPIN_MS)) / RING_SPIN_MS
      el.style.setProperty('--gaze-x', `${(4 + Math.cos(theta) * 28).toFixed(2)}px`)
      el.style.setProperty('--gaze-y', `${(-12 + Math.sin(theta) * 22).toFixed(2)}px`)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [mood])

  const lit = percent == null ? 0 : Math.round((Math.max(0, Math.min(100, percent)) / 100) * DOTS)

  return (
    <span
      ref={root}
      className={className ? `drop ${className}` : 'drop'}
      data-mood={mood}
      data-loop={loop ? 'on' : 'off'}
      data-gloss={gloss ? 'on' : 'off'}
      style={
        { width: size, height: size, ...(fill ? { '--fill': fill } : {}) } as React.CSSProperties
      }
      role="img"
      aria-label="Vesper"
    >
      <svg viewBox="0 0 170 170" aria-hidden="true">
        <defs>
          <clipPath id="drop-clip">
            <path d={BODY} />
          </clipPath>
          <linearGradient id="drop-grad" x1="0" y1="0" x2="0" y2="1">
            <stop className="drop__grad-top" offset="0" />
            <stop className="drop__grad-mid" offset="0.55" />
            <stop className="drop__grad-bot" offset="1" />
          </linearGradient>
          <radialGradient id="drop-shade" cx="0.35" cy="0.3" r="0.85">
            <stop offset="0.55" stopColor="#1e46aa" stopOpacity="0" />
            <stop offset="1" stopColor="#1e46aa" stopOpacity="0.38" />
          </radialGradient>
          <filter id="drop-soft" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="5" />
          </filter>
          <filter id="drop-eye-glow" x="-120%" y="-70%" width="340%" height="240%">
            <feGaussianBlur stdDeviation="3" result="b" />
            <feComponentTransfer in="b" result="g">
              <feFuncA type="linear" slope="0.6" />
            </feComponentTransfer>
            <feMerge>
              <feMergeNode in="g" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <g transform="translate(85 92)">
          {/* waiting: the ring of dots */}
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
            <g className="drop__breath">
              <g className="drop__body">
                <path d={BODY} className="drop__shadow drop__gloss" filter="url(#drop-soft)" />
                <path d={BODY} className="drop__fill" />
                <g clipPath="url(#drop-clip)">
                  <path d={BODY} className="drop__gloss" fill="url(#drop-shade)" />
                  <path d={BODY} className="drop__rim drop__gloss" filter="url(#drop-soft)" />
                  <path d={BODY} className="drop__rim-crisp drop__gloss" />
                  <ellipse
                    className="drop__spec drop__gloss"
                    cx="-20"
                    cy="-40"
                    rx="15"
                    ry="22"
                    filter="url(#drop-soft)"
                  />
                  <g className="drop__eyes">
                    <g className="drop__eye-wrap drop__eye-wrap--l" filter="url(#drop-eye-glow)">
                      <path className="drop__eye drop__eye--l" d={EYE} />
                    </g>
                    <g className="drop__eye-wrap drop__eye-wrap--r" filter="url(#drop-eye-glow)">
                      <path className="drop__eye drop__eye--r" d={EYE} />
                    </g>
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
