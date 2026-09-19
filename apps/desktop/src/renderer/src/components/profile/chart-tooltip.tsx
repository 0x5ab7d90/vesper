import { useState } from 'react'
import { AnimatePresence, m as motion } from 'motion/react'
import { useCommonChart } from '@renderer/components/dither-kit/common-context'
import { rgb } from '@renderer/components/dither-kit/palette'

const GLIDE = { type: 'spring', stiffness: 520, damping: 38, mass: 0.6 } as const

/**
 * Vesper's tooltip for the dither charts. Reads the kit's shared chart context but draws in
 * the app's own grammar: raised surface, hairline border, sans type, tabular figures. It glides
 * between points rather than snapping, and keeps its last content while fading out.
 */
export function ChartTooltip({
  labelKey,
  valueFormatter,
  heading: showHeading = true
}: {
  labelKey?: string
  valueFormatter?: (value: number, name: string) => string
  /** Pass false where the rows already say everything, as in a donut keyed by codes. */
  heading?: boolean
}): React.JSX.Element {
  const chart = useCommonChart()
  const show = chart.ready && chart.hoverIndex != null

  const [lastIndex, setLastIndex] = useState(0)
  if (chart.hoverIndex != null && chart.hoverIndex !== lastIndex) setLastIndex(chart.hoverIndex)
  const index = chart.hoverIndex ?? lastIndex

  const items = chart.itemsAt(index)
  // A pie's heading is the slice name, which the single row already carries; only show the
  // heading when it adds something.
  const rawHeading = showHeading ? chart.heading(index, labelKey) : null
  const heading =
    rawHeading && !items.some((i) => i.label.toLowerCase() === rawHeading.toLowerCase())
      ? rawHeading
      : null

  return (
    <AnimatePresence>
      {show && items.length > 0 ? (
        <motion.div
          key="chart-tooltip"
          initial={{
            opacity: 0,
            x: '-50%',
            y: '-115%',
            top: chart.tooltipTop,
            left: chart.tooltipLeft
          }}
          animate={{
            opacity: 1,
            x: '-50%',
            y: '-115%',
            top: chart.tooltipTop,
            left: chart.tooltipLeft
          }}
          exit={{ opacity: 0, transition: { duration: 0.1 } }}
          transition={GLIDE}
          className="pointer-events-none absolute z-10 flex min-w-[88px] flex-col gap-0.5 rounded-lg bg-surface-3 px-2.5 py-1.5 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08),0_8px_24px_rgba(0,0,0,0.45)]"
        >
          {heading ? (
            <span className="text-[11px] leading-4 font-medium text-text-tertiary">{heading}</span>
          ) : null}
          {items.map((item) => (
            <span
              key={item.name}
              className="flex items-center gap-1.5 text-[12px] leading-4 font-medium tabular-nums text-text"
              style={{ opacity: item.dimmed ? 0.4 : 1 }}
            >
              <span
                aria-hidden
                className="size-1.5 rounded-[1px]"
                style={{ backgroundColor: rgb(item.seed.fill) }}
              />
              <span className="text-text-tertiary">{item.label}</span>
              <span className="ml-auto pl-3">
                {valueFormatter
                  ? valueFormatter(item.value, item.name)
                  : item.value.toLocaleString()}
              </span>
            </span>
          ))}
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}

ChartTooltip.chartLayer = 'dom' as const
