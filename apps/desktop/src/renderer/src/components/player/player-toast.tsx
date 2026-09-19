import { AnimatePresence, m as motion } from 'motion/react'
import { EASE_OUT, EXIT_FADE } from '@renderer/lib/motion'

interface Props {
  message: string | null
}

export function PlayerToast({ message }: Props): React.JSX.Element {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-20 z-40 flex justify-center">
      <AnimatePresence>
        {message ? (
          <motion.div
            key={message}
            className="rounded-full bg-black/72 px-4 py-2 text-[13px] leading-4 font-medium text-white backdrop-blur-md"
            initial={{ opacity: 0, y: -4, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={EXIT_FADE}
            transition={{ duration: 0.18, ease: EASE_OUT }}
          >
            {message}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  )
}
