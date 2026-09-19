import { PolarRoot } from '@renderer/components/dither-kit/polar-root'
import { polarX, polarY } from '@renderer/components/dither-kit/polar'
import { usePolarChart } from '@renderer/components/dither-kit/polar-context'
import { Radar } from '@renderer/components/dither-kit/radar'
import { RadarCanvas } from '@renderer/components/dither-kit/radar-canvas'
import { ChartTooltip } from '@renderer/components/profile/chart-tooltip'

const SERIES = { count: { label: 'Titles', color: 'violet' as const } }
const LEVELS = 4

// Concrete colours rather than tokens: the image exporter drops CSS-driven fill and stroke on
// SVG elements, so the frame carries its colours as plain attributes. These match
// --color-border at 14% ink and --color-text-tertiary.
const RING = 'rgba(255,255,255,0.14)'
const LABEL = '#b3b3b3'
const LABEL_HOT = '#ffffff'

/**
 * The genre radar for the stats card. Same canvas as the kit's radar, with a frame drawn in
 * attributes so rings, spokes and labels survive being exported to an image.
 */
export function TasteRadar({
  data,
  className
}: {
  data: { label: string; count: number }[]
  className?: string
}): React.JSX.Element {
  return (
    <PolarRoot
      chartType="radar"
      Canvas={RadarCanvas}
      backDecoration={<Frame />}
      dataKey=""
      nameKey="label"
      data={data}
      config={SERIES}
      margins={{ top: 16, right: 64, bottom: 16, left: 64 }}
      className={className}
    >
      <Radar dataKey="count" variant="gradient" />
      <ChartTooltip labelKey="label" />
    </PolarRoot>
  )
}

function Frame(): React.JSX.Element | null {
  const ctx = usePolarChart()
  if (!ctx.ready || !ctx.radar) return null
  const { axes } = ctx.radar
  const { x: cx, y: cy } = ctx.center
  const R = ctx.outerRadius

  const ring = (radius: number): string =>
    `${axes
      .map(
        (ax, i) =>
          `${i === 0 ? 'M' : 'L'}${polarX(cx, radius, ax.angle).toFixed(1)},${polarY(cy, radius, ax.angle).toFixed(1)}`
      )
      .join(' ')} Z`

  return (
    <g>
      <g stroke={RING} fill="none" strokeWidth={1}>
        {Array.from({ length: LEVELS }, (_, l) => (
          <path key={l} d={ring((R * (l + 1)) / LEVELS)} />
        ))}
        {axes.map((ax, i) => (
          <line
            key={ax.label}
            x1={cx}
            y1={cy}
            x2={polarX(cx, R, ax.angle)}
            y2={polarY(cy, R, ax.angle)}
            stroke={ctx.hoverIndex === i ? LABEL : RING}
          />
        ))}
      </g>
      <g fontFamily="inherit" fontSize={11} fontWeight={500}>
        {axes.map((ax, i) => {
          const lx = polarX(cx, R + 10, ax.angle)
          const ly = polarY(cy, R + 10, ax.angle)
          const anchor =
            Math.abs(Math.cos(ax.angle)) < 0.3 ? 'middle' : Math.cos(ax.angle) > 0 ? 'start' : 'end'
          return (
            <text
              key={ax.label}
              x={lx}
              y={ly}
              textAnchor={anchor}
              dominantBaseline="central"
              fill={ctx.hoverIndex === i ? LABEL_HOT : LABEL}
            >
              {ax.label}
            </text>
          )
        })}
      </g>
    </g>
  )
}

Frame.chartLayer = 'back' as const
