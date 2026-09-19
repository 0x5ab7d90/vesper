import { AnimatePresence, m as motion } from 'motion/react'
import { formatOffset } from '@renderer/lib/subtitle-offset'
import { EASE_OUT, EXIT_FADE } from '@renderer/lib/motion'

interface Props {
  visible: boolean
  offsetSec: number
}

export function SubtitleOffsetHud({ visible, offsetSec }: Props): React.JSX.Element {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-20 z-40 flex justify-center">
      <AnimatePresence>
        {visible ? (
          <motion.div
            key="hud"
            className="flex items-center gap-2 rounded-full bg-black/70 px-4 py-2 text-[13px] leading-4 font-semibold text-white backdrop-blur-md"
            initial={{ opacity: 0, y: -4, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={EXIT_FADE}
            transition={{ duration: 0.18, ease: EASE_OUT }}
          >
            <ClockGlyph />
            <span>Subtitle offset</span>
            <span className="tabular-nums text-white/85">{formatOffset(offsetSec)}</span>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  )
}

function ClockGlyph(): React.JSX.Element {
  return (
    <svg
      viewBox="0 0 24 24"
      width="14"
      height="14"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <path
        d="M12 7.75V12L14.75 14.75M21.25 12C21.25 17.10 17.10 21.25 12 21.25C6.89 21.25 2.75 17.10 2.75 12C2.75 6.89 6.89 2.75 12 2.75C17.10 2.75 21.25 6.89 21.25 12Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
