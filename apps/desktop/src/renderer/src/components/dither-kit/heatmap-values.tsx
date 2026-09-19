'use client'

// Added for Vesper: in-cell value labels for the heat map family.

import { useHeatmap } from './heatmap-context'

/**
 * The value printed inside each cell. Hidden while the cells are narrower than
 * `minWidth` (a long season list on a small window) so labels never collide,
 * and faded in after the entrance so they don't float over undrawn tiles.
 */
export function HeatmapValues({
  formatter = (v) => String(v),
  minWidth = 30,
  minHeight = 16
}: {
  formatter?: (value: number) => string
  minWidth?: number
  minHeight?: number
}) {
  const ctx = useHeatmap()
  if (!ctx.ready) return null
  const probe = ctx.cell(0, 0)
  if (probe.width < minWidth || probe.height < minHeight) return null

  return (
    <g
      className="fill-current font-mono text-[10px] text-foreground tabular-nums"
      style={{
        opacity: ctx.entranceDone ? 1 : 0,
        transition: 'opacity 240ms cubic-bezier(0.23, 1, 0.32, 1)'
      }}
    >
      {ctx.values.map((row, r) =>
        row.map((v, c) => {
          if (typeof v !== 'number' || !Number.isFinite(v)) return null
          const rect = ctx.cell(r, c)
          const active = ctx.hover !== null && ctx.hover[0] === r && ctx.hover[1] === c
          // Dense tiles are nearly solid colour, so the label eases back to
          // keep contrast even; the hovered cell's label is always full.
          const opacity = active ? 1 : 0.55 + 0.45 * (1 - ctx.norm(v))
          return (
            <text
              key={`${r}-${c}`}
              x={rect.x + rect.width / 2}
              y={rect.y + rect.height / 2}
              textAnchor="middle"
              dominantBaseline="central"
              fill="currentColor"
              style={{ opacity }}
            >
              {formatter(v)}
            </text>
          )
        })
      )}
    </g>
  )
}
