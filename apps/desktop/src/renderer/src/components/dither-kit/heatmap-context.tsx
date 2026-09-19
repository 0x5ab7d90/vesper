'use client'

// Added for Vesper: the kit ships no heat map, so this is a new family built on
// the same primitives (Bayer dither, palette seeds, common tooltip context).

import { createContext, use, useCallback, useMemo, useState } from 'react'
import { type Margins, useRevision } from './chart-context'
import type { CommonChart } from './common-context'
import type { BloomInput } from './dither-paint'
import { type DitherColor, type Seed, seedOfColor } from './palette'
import type { Dimensions } from './use-chart-dimensions'

export type HeatmapCell = { x: number; y: number; width: number; height: number }
export type HeatmapValue = number | null | undefined

export type HeatmapContextValue = {
  rows: string[]
  columns: string[]
  values: HeatmapValue[][] // values[row][column]
  label: string
  seed: Seed

  margins: Margins
  plot: { width: number; height: number }
  ready: boolean
  gap: number
  cell: (row: number, column: number) => HeatmapCell
  cellAt: (px: number, py: number) => [number, number] | null

  lo: number
  hi: number
  /** 0–1 position of a value in the colour ramp. */
  norm: (value: number) => number

  hover: [number, number] | null
  setHover: (cell: [number, number] | null) => void
  isMouseInChart: boolean
  setMouseInChart: (inside: boolean) => void
  bloom: BloomInput
  bloomOnHover: boolean

  animate: boolean
  animationDuration: number
  revision: number
  entranceDone: boolean
  markEntranceDone: () => void

  common: CommonChart
}

export const HeatmapContext = createContext<HeatmapContextValue | null>(null)

export function useHeatmap() {
  const ctx = use(HeatmapContext)
  if (!ctx) throw new Error('Heat map parts must be used within <HeatmapChart />.')
  return ctx
}

const isNum = (v: HeatmapValue): v is number => typeof v === 'number' && Number.isFinite(v)

/**
 * Builds the heat map context: a rows × columns grid of equal cells inside the
 * plot rect, the value → ramp mapping, and the hover state every part reads.
 * Hover is a single cell; the common context flattens it to `row * columns +
 * column` so the shared `<Tooltip>` works unchanged. The tooltip anchors to the
 * cell, not the pointer, so raw cursor moves never touch React state.
 */
export function useHeatmapController({
  rows,
  columns,
  values,
  label,
  color,
  domain,
  headingOf,
  gap,
  dimensions,
  margins,
  animate = true,
  animationDuration = 900,
  replayToken = 0,
  bloom = 'off',
  bloomOnHover = false
}: {
  rows: string[]
  columns: string[]
  values: HeatmapValue[][]
  label: string
  color: DitherColor
  domain?: [number, number]
  headingOf?: (row: number, column: number) => string | null
  gap: number
  dimensions: Dimensions
  margins: Margins
  animate?: boolean
  animationDuration?: number
  replayToken?: number
  bloom?: BloomInput
  bloomOnHover?: boolean
}): HeatmapContextValue {
  const revision = useRevision(values, replayToken)

  const [hover, setHover] = useState<[number, number] | null>(null)
  const [isMouseInChart, setMouseInChart] = useState(false)

  const { top: mTop, right: mRight, bottom: mBottom, left: mLeft } = margins
  const stableMargins = useMemo(
    () => ({ top: mTop, right: mRight, bottom: mBottom, left: mLeft }),
    [mTop, mRight, mBottom, mLeft]
  )

  const plotWidth = Math.max(0, dimensions.width - mLeft - mRight)
  const plotHeight = Math.max(0, dimensions.height - mTop - mBottom)
  const nRows = rows.length
  const nCols = columns.length
  const ready = plotWidth > 0 && plotHeight > 0 && nRows > 0 && nCols > 0

  const [entrance, setEntrance] = useState({ revision, done: !animate })
  if (entrance.revision !== revision) setEntrance({ revision, done: !animate })
  const entranceDone = entrance.revision === revision ? entrance.done : !animate
  const markEntranceDone = useCallback(() => setEntrance({ revision, done: true }), [revision])

  // Domain defaults to the data's own range so the ramp spends its full width
  // on the values present; a flat grid gets a unit span so nothing divides by 0.
  const dLo = domain?.[0]
  const dHi = domain?.[1]
  const { lo, hi } = useMemo(() => {
    if (dLo !== undefined && dHi !== undefined) {
      return { lo: dLo, hi: dHi === dLo ? dLo + 1 : dHi }
    }
    let min = Number.POSITIVE_INFINITY
    let max = Number.NEGATIVE_INFINITY
    for (const row of values) {
      for (const v of row) {
        if (!isNum(v)) continue
        if (v < min) min = v
        if (v > max) max = v
      }
    }
    if (!Number.isFinite(min)) return { lo: 0, hi: 1 }
    return { lo: min, hi: max === min ? min + 1 : max }
  }, [values, dLo, dHi])
  const norm = useCallback((v: number) => Math.max(0, Math.min(1, (v - lo) / (hi - lo))), [lo, hi])

  const cellW = nCols > 0 ? plotWidth / nCols : 0
  const cellH = nRows > 0 ? plotHeight / nRows : 0
  const cell = useCallback(
    (row: number, column: number): HeatmapCell => ({
      x: column * cellW + gap / 2,
      y: row * cellH + gap / 2,
      width: Math.max(0, cellW - gap),
      height: Math.max(0, cellH - gap)
    }),
    [cellW, cellH, gap]
  )
  const cellAt = useCallback(
    (px: number, py: number): [number, number] | null => {
      if (cellW <= 0 || cellH <= 0) return null
      if (px < 0 || py < 0 || px >= plotWidth || py >= plotHeight) return null
      return [
        Math.min(nRows - 1, Math.floor(py / cellH)),
        Math.min(nCols - 1, Math.floor(px / cellW))
      ]
    },
    [cellW, cellH, plotWidth, plotHeight, nRows, nCols]
  )

  const seed = useMemo(() => seedOfColor(color), [color])
  const seedOf = useCallback(() => seed, [seed])
  const noop = useCallback(() => {}, [])

  const common: CommonChart = useMemo(() => {
    const hoverIndex = hover ? hover[0] * nCols + hover[1] : null
    const hovered = hover ? cell(hover[0], hover[1]) : null
    return {
      names: ['value'],
      labelOf: () => label,
      seedOf,
      selectedDataKey: null,
      selectDataKey: noop,
      focusDataKey: null,
      setFocusDataKey: noop,
      hoverIndex,
      ready,
      tooltipLeft: Math.max(
        48,
        Math.min(plotWidth + mLeft - 48, hovered ? mLeft + hovered.x + hovered.width / 2 : mLeft)
      ),
      // Ride the hovered cell's top edge, with enough headroom that the
      // upward-lifted card never clips out of the chart.
      tooltipTop: Math.max(mTop + 44, hovered ? mTop + hovered.y : mTop),
      heading: (i) => {
        const r = Math.floor(i / nCols)
        const c = i % nCols
        if (headingOf) return headingOf(r, c)
        return `${rows[r] ?? ''} · ${columns[c] ?? ''}`
      },
      itemsAt: (i) => {
        const v = values[Math.floor(i / nCols)]?.[i % nCols]
        if (!isNum(v)) return []
        return [{ name: 'value', label, value: v, seed, dimmed: false }]
      }
    }
  }, [
    hover,
    nCols,
    cell,
    label,
    seedOf,
    noop,
    ready,
    plotWidth,
    mLeft,
    mTop,
    headingOf,
    rows,
    columns,
    values,
    seed
  ])

  return useMemo<HeatmapContextValue>(
    () => ({
      rows,
      columns,
      values,
      label,
      seed,
      margins: stableMargins,
      plot: { width: plotWidth, height: plotHeight },
      ready,
      gap,
      cell,
      cellAt,
      lo,
      hi,
      norm,
      hover,
      setHover,
      isMouseInChart,
      setMouseInChart,
      bloom,
      bloomOnHover,
      animate,
      animationDuration,
      revision,
      entranceDone,
      markEntranceDone,
      common
    }),
    [
      rows,
      columns,
      values,
      label,
      seed,
      stableMargins,
      plotWidth,
      plotHeight,
      ready,
      gap,
      cell,
      cellAt,
      lo,
      hi,
      norm,
      hover,
      isMouseInChart,
      bloom,
      bloomOnHover,
      animate,
      animationDuration,
      revision,
      entranceDone,
      markEntranceDone,
      common
    ]
  )
}
