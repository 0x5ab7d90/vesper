import { AnimatePresence, m as motion } from 'motion/react'
import { EASE_OUT, EXIT_FADE } from '@renderer/lib/motion'

interface Props {
  visible: boolean
  label: string
  onSkip: () => void
}

export function SkipSegmentButton({ visible, label, onSkip }: Props): React.JSX.Element {
  return (
    <div className="pointer-events-none absolute right-8 bottom-28 z-40">
      <AnimatePresence>
        {visible ? (
          <motion.button
            key={label}
            type="button"
            onClick={onSkip}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={EXIT_FADE}
            transition={{ duration: 0.18, ease: EASE_OUT }}
            whileTap={{ scale: 0.97 }}
            className="pointer-events-auto flex items-center gap-2 rounded-lg bg-white/95 px-4 py-2.5 text-[13px] leading-4 font-semibold text-black outline-none backdrop-blur-md hover:bg-white"
          >
            <span>{label}</span>
            <ChevronRight />
          </motion.button>
        ) : null}
      </AnimatePresence>
    </div>
  )
}

function ChevronRight(): React.JSX.Element {
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
        d="M9 4L15.58 10.58C16.36 11.36 16.36 12.63 15.58 13.41L9 20"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
