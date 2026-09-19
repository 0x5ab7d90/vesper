'use client'

// Added for Vesper: axes for the heat map family, in the kit's axis grammar.

import { useHeatmap } from './heatmap-context'

/** Column labels under the grid, one per column, thinned to `maxTicks`. */
export function HeatmapXAxis({
  tickMargin = 8,
  maxTicks = 12,
  tickFormatter
}: {
  tickMargin?: number
  maxTicks?: number
  tickFormatter?: (label: string, index: number) => string
}) {
  const ctx = useHeatmap()
  if (!ctx.ready) return null
  const step = Math.max(1, Math.ceil(ctx.columns.length / maxTicks))
  const y = ctx.plot.height + tickMargin

  return (
    <g className="fill-current font-mono text-[10px] text-muted-foreground tabular-nums">
      {ctx.columns.map((label, i) => {
        if (i % step !== 0) return null
        const rect = ctx.cell(0, i)
        return (
          <text
            // biome-ignore lint/suspicious/noArrayIndexKey: index is the stable column position
            key={i}
            x={rect.x + rect.width / 2}
            y={y}
            textAnchor="middle"
            dominantBaseline="hanging"
            fill="currentColor"
          >
            {tickFormatter ? tickFormatter(label, i) : label}
          </text>
        )
      })}
    </g>
  )
}

/** Row labels beside the grid, one per row. `highlight` brightens one row's label. */
export function HeatmapYAxis({
  tickMargin = 8,
  highlight = null,
  tickFormatter
}: {
  tickMargin?: number
  highlight?: number | null
  tickFormatter?: (label: string, index: number) => string
}) {
  const ctx = useHeatmap()
  if (!ctx.ready) return null

  return (
    <g className="fill-current font-mono text-[10px] text-muted-foreground tabular-nums">
      {ctx.rows.map((label, i) => {
        const rect = ctx.cell(i, 0)
        return (
          <text
            // biome-ignore lint/suspicious/noArrayIndexKey: index is the stable row position
            key={i}
            x={-tickMargin}
            y={rect.y + rect.height / 2}
            textAnchor="end"
            dominantBaseline="central"
            fill="currentColor"
            className={highlight === i ? 'text-foreground' : undefined}
          >
            {tickFormatter ? tickFormatter(label, i) : label}
          </text>
        )
      })}
    </g>
  )
}
