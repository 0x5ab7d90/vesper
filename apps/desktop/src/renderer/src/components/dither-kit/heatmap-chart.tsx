'use client'

// Added for Vesper: the kit has no heat map, so this root follows the polar
// root's shape (measure, context, pointer hit-test, layered children).

import { Children, isValidElement, type ReactNode } from 'react'
import type { Margins } from './chart-context'
import { CommonChartContext } from './common-context'
import type { BloomInput } from './dither-paint'
import { HeatmapCanvas } from './heatmap-canvas'
import { HeatmapContext, type HeatmapValue, useHeatmapController } from './heatmap-context'
import { cn } from './lib'
import type { DitherColor } from './palette'
import { useChartDimensions } from './use-chart-dimensions'

const DEFAULT_MARGINS: Margins = { top: 4, right: 4, bottom: 22, left: 36 }

function layerOf(node: ReactNode): 'back' | 'dom' | 'svg' {
  if (!isValidElement(node) || typeof node.type === 'string') return 'svg'
  return (node.type as { chartLayer?: 'back' | 'dom' }).chartLayer ?? 'svg'
}

export type HeatmapChartProps = {
  /** Row labels, top to bottom. */
  rows: string[]
  /** Column labels, left to right. */
  columns: string[]
  /** `values[row][column]`; `null`/`undefined` draws an empty tile. */
  values: HeatmapValue[][]
  /** Series label shown in the tooltip row. */
  label?: string
  color?: DitherColor
  /** Value range for the ramp; defaults to the data's own min/max. */
  domain?: [number, number]
  /** Tooltip heading per cell; defaults to "row · column". */
  headingOf?: (row: number, column: number) => string | null
  /** CSS px between cells. */
  gap?: number
  /** Accessible name for the chart. */
  ariaLabel?: string
  margins?: Partial<Margins>
  className?: string
  animate?: boolean
  animationDuration?: number
  replayToken?: number
  bloom?: BloomInput
  bloomOnHover?: boolean
  /** Fires with the hovered cell as the pointer moves (null on leave). */
  onHoverChange?: (cell: [number, number] | null) => void
  children?: ReactNode
}

/**
 * Composable dither **heat map**: a rows × columns grid of dithered tiles whose
 * density follows the value. Compose `<HeatmapXAxis>`, `<HeatmapYAxis>`,
 * `<HeatmapValues>` and the shared `<Tooltip>` inside.
 */
export function HeatmapChart({
  rows,
  columns,
  values,
  label = 'Value',
  color = 'blue',
  domain,
  headingOf,
  gap = 2,
  ariaLabel = 'Heat map',
  margins: marginsProp,
  className,
  animate = true,
  // Shorter than the other families: the entrance is a stagger across cells,
  // and the last cell should start within ~300ms of the first.
  animationDuration = 600,
  replayToken = 0,
  bloom = 'off',
  bloomOnHover = false,
  onHoverChange,
  children
}: HeatmapChartProps) {
  const { ref, size } = useChartDimensions<HTMLDivElement>()
  const margins = { ...DEFAULT_MARGINS, ...marginsProp }

  const ctx = useHeatmapController({
    rows,
    columns,
    values,
    label,
    color,
    domain,
    headingOf,
    gap,
    dimensions: size,
    margins,
    animate,
    animationDuration,
    replayToken,
    bloom,
    bloomOnHover
  })

  const backChildren: ReactNode[] = []
  const svgChildren: ReactNode[] = []
  const domChildren: ReactNode[] = []
  Children.forEach(children, (child) => {
    const layer = layerOf(child)
    if (layer === 'back') backChildren.push(child)
    else if (layer === 'dom') domChildren.push(child)
    else svgChildren.push(child)
  })

  const onMove = (clientX: number, clientY: number) => {
    const el = ref.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const px = clientX - rect.left
    const py = clientY - rect.top
    const next = ctx.cellAt(px - margins.left, py - margins.top)
    const prev = ctx.hover
    // Only touch state when the pointer crosses into another cell.
    const changed = next?.[0] !== prev?.[0] || next?.[1] !== prev?.[1]
    if (changed) {
      ctx.setHover(next)
      onHoverChange?.(next)
    }
  }

  return (
    <HeatmapContext value={ctx}>
      <CommonChartContext value={ctx.common}>
        <div
          ref={ref}
          className={cn('relative h-full w-full', className)}
          onPointerEnter={() => ctx.setMouseInChart(true)}
          onPointerMove={(e) => onMove(e.clientX, e.clientY)}
          onPointerLeave={() => {
            ctx.setMouseInChart(false)
            ctx.setHover(null)
            onHoverChange?.(null)
          }}
        >
          {ctx.ready && backChildren.length > 0 && (
            <svg
              width={size.width}
              height={size.height}
              className="absolute inset-0 overflow-visible"
              aria-hidden
              role="presentation"
            >
              <g transform={`translate(${margins.left},${margins.top})`}>{backChildren}</g>
            </svg>
          )}
          <HeatmapCanvas />
          {ctx.ready && (
            <svg
              width={size.width}
              height={size.height}
              className="absolute inset-0 overflow-visible"
              role="img"
              aria-label={ariaLabel}
            >
              <g transform={`translate(${margins.left},${margins.top})`}>{svgChildren}</g>
            </svg>
          )}
          {domChildren}
        </div>
      </CommonChartContext>
    </HeatmapContext>
  )
}
