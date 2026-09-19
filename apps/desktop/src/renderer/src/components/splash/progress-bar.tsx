import { useId, type AriaAttributes, type CSSProperties } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { ShaderFill } from '@renderer/components/ui/shader-fill'

// Ported from interior.dev's progress bar (MIT): an indeterminate crawl that hands over to a
// determinate fill, both on springs, with the label row above the track. The splash has no
// Tailwind, so the styling is inline and tuned to the splash palette. The determinate fill is
// the landing page's dithered field, revealed by a clip so its texture keeps scale, and the
// crawl carries its own patch of the field along with it.

const FILL = { type: 'spring', stiffness: 210, damping: 34, mass: 0.9 } as const
const CROSSFADE = { type: 'spring', stiffness: 260, damping: 34, mass: 0.8 } as const
const INSTANT = { duration: 0 } as const

const ACCENT = '#7a3fe4'
const TRACK = '#171515'
const FILL_SHADOW = 'inset 0 1px 0 rgba(255,255,255,0.35), inset 0 -1px 0 rgba(0,0,0,0.3)'

const fillStyle: CSSProperties = {
  position: 'absolute',
  inset: 0,
  display: 'block',
  transformOrigin: 'left',
  borderRadius: 2,
  background: ACCENT,
  boxShadow: FILL_SHADOW
}

export interface ProgressBarProps {
  /** Progress amount; null shows the indeterminate crawl. */
  value: number | null
  max?: number
  label: string
  pendingLabel?: string
  completeLabel?: string
  style?: CSSProperties
}

export function ProgressBar({
  value,
  max = 100,
  label,
  pendingLabel = 'Working',
  completeLabel = 'Complete',
  style
}: ProgressBarProps): React.JSX.Element {
  const reduced = useReducedMotion()
  const labelId = useId()

  const indeterminate = value === null
  const fraction = value === null || max <= 0 ? 0 : Math.min(1, Math.max(0, value / max))
  const percent = Math.round(fraction * 100)
  const complete = !indeterminate && fraction >= 1

  const measured: AriaAttributes = indeterminate
    ? {}
    : {
        'aria-valuenow': Math.round(fraction * max * 100) / 100,
        'aria-valuetext': `${percent}%`
      }

  return (
    <div style={{ width: '100%', ...style }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: 12
        }}
      >
        <span
          id={labelId}
          style={{
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            fontSize: 13,
            fontWeight: 500,
            color: 'rgba(253, 252, 252, 0.86)'
          }}
        >
          {label}
        </span>

        <span
          aria-hidden
          style={{
            display: 'grid',
            flexShrink: 0,
            justifyItems: 'end',
            color: 'rgba(253, 252, 252, 0.5)'
          }}
        >
          <motion.span
            style={{
              gridColumnStart: 1,
              gridRowStart: 1,
              whiteSpace: 'nowrap',
              fontSize: 12,
              fontWeight: 500,
              lineHeight: '20px'
            }}
            initial={false}
            animate={{ opacity: indeterminate ? 1 : 0 }}
            transition={reduced ? INSTANT : CROSSFADE}
          >
            {pendingLabel}
          </motion.span>

          <motion.span
            style={{
              gridColumnStart: 1,
              gridRowStart: 1,
              whiteSpace: 'nowrap',
              fontSize: 12,
              fontWeight: 500,
              lineHeight: '20px',
              fontVariantNumeric: 'tabular-nums'
            }}
            initial={false}
            animate={{ opacity: indeterminate ? 0 : 1 }}
            transition={reduced ? INSTANT : CROSSFADE}
          >
            {percent}%
          </motion.span>
        </span>
      </div>

      <div
        role="progressbar"
        aria-labelledby={labelId}
        aria-valuemin={0}
        aria-valuemax={max}
        {...measured}
        style={{
          marginTop: 8,
          borderRadius: 4,
          padding: 2,
          background: TRACK,
          boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.5), inset 0 0 0 1px rgba(255,255,255,0.04)'
        }}
      >
        <div style={{ position: 'relative', height: 8, overflow: 'hidden', borderRadius: 2 }}>
          <motion.span
            aria-hidden
            style={{ ...fillStyle, transformOrigin: undefined, overflow: 'hidden' }}
            initial={false}
            animate={{
              clipPath: `inset(0 ${(1 - (indeterminate ? 0 : fraction)) * 100}% 0 0 round 2px)`
            }}
            transition={reduced ? INSTANT : FILL}
          >
            <ShaderFill background={TRACK} bleed={28} timeScale={3} />
            <span
              aria-hidden
              style={{ position: 'absolute', inset: 0, borderRadius: 2, boxShadow: FILL_SHADOW }}
            />
          </motion.span>

          {indeterminate && !reduced ? (
            <motion.span
              aria-hidden
              style={{
                ...fillStyle,
                inset: undefined,
                top: 0,
                bottom: 0,
                left: 0,
                width: '40%',
                overflow: 'hidden'
              }}
              initial={{ x: '-100%', opacity: 0 }}
              animate={{ x: '250%', opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{
                x: { duration: 1.25, ease: 'easeInOut', repeat: Infinity },
                opacity: { duration: 0.18 }
              }}
            >
              <ShaderFill background={TRACK} bleed={28} timeScale={3} />
              <span
                aria-hidden
                style={{ position: 'absolute', inset: 0, borderRadius: 2, boxShadow: FILL_SHADOW }}
              />
            </motion.span>
          ) : null}
        </div>
      </div>

      <span
        aria-live="polite"
        style={{
          position: 'absolute',
          width: 1,
          height: 1,
          overflow: 'hidden',
          clip: 'rect(0 0 0 0)',
          whiteSpace: 'nowrap'
        }}
      >
        {complete ? completeLabel : indeterminate ? pendingLabel : ''}
      </span>
    </div>
  )
}
