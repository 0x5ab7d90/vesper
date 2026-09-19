import { useCallback, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { HeatmapChart } from '@renderer/components/dither-kit/heatmap-chart'
import { HeatmapXAxis, HeatmapYAxis } from '@renderer/components/dither-kit/heatmap-axis'
import { HeatmapValues } from '@renderer/components/dither-kit/heatmap-values'
import { ChartTooltip } from '@renderer/components/profile/chart-tooltip'
import { SectionTitle } from '@renderer/components/ui/section-title'
import { SkeletonSwap } from '@renderer/components/ui/skeleton-swap'
import { cn } from '@renderer/lib/cn'
import { seasonRatingsQuery } from '@renderer/lib/external-queries'
import type { SeasonRatings } from '@renderer/lib/seriesgraph'

// Chart labels in the app's sans at a readable size, overriding the kit's mono default. Small
// text opens up by a hair, the way large text tightens.
const CHART_TEXT =
  '[&_svg_text]:font-sans [&_svg_text]:text-[11px] [&_svg_text]:font-medium [&_svg_text]:tracking-[0.01em] [&_svg_text]:tabular-nums'

// The kit's default margins plus the panel's own padding, so the grid's height can be
// derived from the row count rather than the other way round.
const MARGINS = { top: 12, right: 12, bottom: 30, left: 44 }
const PANEL_PAD = 8
const MAX_GRID_H = 420
const SKELETON_H = 220
// One stable empty list while loading, so the grid memo (and the chart's entrance replay,
// which keys off the values array's identity) doesn't churn on every render.
const NO_SEASONS: SeasonRatings[] = []

interface EpisodeRatingsProps {
  tmdbId: number
}

/** Rows of every season with a rating, columns of E1..Emax, one cell per episode. */
function toGrid(seasons: SeasonRatings[]): {
  rows: string[]
  columns: string[]
  values: (number | null)[][]
  seasonAt: number[]
  cells: SeasonRatings['episodes'][]
} {
  const rated = seasons
    .filter((s) => s.episodes.some((e) => e.rating !== undefined))
    .toSorted((a, b) => a.season - b.season)
  const maxEp = rated.reduce((m, s) => Math.max(m, ...s.episodes.map((e) => e.episode)), 0)
  const columns = Array.from({ length: maxEp }, (_, i) => `E${i + 1}`)
  const cells = rated.map((s) => {
    const byEp: SeasonRatings['episodes'] = []
    for (const e of s.episodes) byEp[e.episode - 1] = e
    return byEp
  })
  const values = cells.map((byEp) =>
    Array.from({ length: maxEp }, (_, i) => byEp[i]?.rating ?? null)
  )
  return {
    rows: rated.map((s) => `S${s.season}`),
    columns,
    values,
    seasonAt: rated.map((s) => s.season),
    cells
  }
}

function rowHeight(rows: number): number {
  const ideal = rows <= 6 ? 32 : rows <= 12 ? 26 : 22
  return Math.min(ideal, Math.floor(MAX_GRID_H / Math.max(rows, 1)))
}

export function EpisodeRatings({ tmdbId }: EpisodeRatingsProps): React.JSX.Element | null {
  const ratings = useQuery(seasonRatingsQuery(tmdbId))

  const seasons = ratings.data ?? NO_SEASONS
  const grid = useMemo(() => toGrid(seasons), [seasons])

  const headingOf = useCallback(
    (r: number, c: number): string => {
      const ep = grid.cells[r]?.[c]
      const tag = `S${grid.seasonAt[r]} E${c + 1}`
      return ep?.name ? `${tag} · ${ep.name}` : tag
    },
    [grid]
  )

  // A show with no rated episodes has nothing to plot, so the whole section leaves
  // rather than showing an empty frame.
  if (!ratings.isLoading && grid.rows.length === 0) return null

  const gridH = MARGINS.top + MARGINS.bottom + grid.rows.length * rowHeight(grid.rows.length)
  const panelH = gridH + PANEL_PAD * 2
  const ratedCount = grid.values.flat().filter((v) => v !== null).length

  return (
    <section className="flex flex-col gap-4">
      <div className="px-6">
        <SectionTitle>Episode ratings</SectionTitle>
      </div>

      <div className="px-6">
        <SkeletonSwap
          ready={!ratings.isLoading}
          reserve={ratings.isLoading ? SKELETON_H : panelH}
          label="Episode ratings"
          skeleton={
            <div
              className="w-full animate-pulse rounded-xl bg-white/[0.04]"
              style={{ height: SKELETON_H }}
            />
          }
        >
          <div
            className={cn('relative overflow-hidden rounded-xl bg-surface-2', CHART_TEXT)}
            style={{ height: panelH, padding: PANEL_PAD }}
          >
            {grid.rows.length > 0 ? (
              <HeatmapChart
                rows={grid.rows}
                columns={grid.columns}
                values={grid.values}
                label="Rating"
                color="violet"
                headingOf={headingOf}
                margins={MARGINS}
                gap={3}
                ariaLabel={`Episode ratings heat map: ${ratedCount} rated episodes across ${grid.rows.length} seasons.`}
              >
                <HeatmapYAxis tickMargin={10} />
                <HeatmapXAxis maxTicks={16} tickMargin={10} />
                <HeatmapValues formatter={(v) => v.toFixed(1)} minWidth={26} minHeight={13} />
                <ChartTooltip valueFormatter={(v) => v.toFixed(1)} />
              </HeatmapChart>
            ) : null}
          </div>
        </SkeletonSwap>
      </div>
    </section>
  )
}
