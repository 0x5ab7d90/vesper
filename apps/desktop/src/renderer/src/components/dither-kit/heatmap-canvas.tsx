'use client'

// Added for Vesper: canvas painter for the heat map family.

import { useEffect, useRef } from 'react'
import {
  BAYER,
  backingSize,
  bloomLayerStyle,
  clamp01,
  easeOutCubic,
  OFF_TIER,
  prefersReducedMotion
} from './dither-paint'
import { useHeatmap } from './heatmap-context'
import { PALETTE, rgb } from './palette'

// How far (as a fraction of the diagonal sweep) each cell's fade-in trails the
// reveal front, so the entrance ripples rather than steps.
const SPREAD = 0.35
// Alpha floor for the lowest value: a cell at the bottom of the ramp still
// reads as present, not empty.
const FLOOR = 0.22

/**
 * Dither canvas for heat maps. Each cell is a block of ordered-dither scatter
 * whose density follows the value's place in the ramp: the low end is a sparse
 * sprinkle, the high end near-solid. One colour, varying alpha (the same rule
 * the rest of the engine follows) so it reads on both themes. Cells ripple in
 * along the diagonal on mount. Hover is instant: the hovered cell lifts and
 * gets a solid rim with no easing, since hover fires more than anything else
 * and any lag there reads as the chart trailing the pointer.
 */
export function HeatmapCanvas() {
  const ctx = useHeatmap()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const bloomRef = useRef<HTMLCanvasElement>(null)

  const { width, height } = ctx.plot
  const { cols, rows } = backingSize(width, height)

  const state = useRef(ctx)
  useEffect(() => {
    state.current = ctx
  })

  useEffect(() => {
    const canvas = canvasRef.current
    const c = canvas?.getContext('2d')
    if (!(canvas && c) || cols <= 0 || rows <= 0) return
    canvas.width = cols
    canvas.height = rows

    const bloomCanvas = bloomRef.current
    const bloomCtx = bloomCanvas?.getContext('2d') ?? null
    if (bloomCanvas) {
      bloomCanvas.width = cols
      bloomCanvas.height = rows
    }

    const reduce = prefersReducedMotion()
    const animate = state.current.animate && !reduce
    const duration = state.current.animationDuration
    let raf = 0
    let animStart = 0
    let lastProg = -1
    let lastRevision = state.current.revision
    let entranceReported = !animate
    let intensity = 0
    let needsFill = true
    let lastHover: string | null | undefined = Symbol() as never

    // One ImageData write per repaint instead of a fillRect per backing pixel:
    // a wide panel is ~100k pixels, and per-pixel draw calls made hover feel laggy.
    const img = c.createImageData(cols, rows)
    const px = img.data
    const paint = (prog: number) => {
      const s = state.current
      px.fill(0)
      const nRows = s.rows.length
      const nCols = s.columns.length
      const sx = cols / Math.max(width, 1)
      const sy = rows / Math.max(height, 1)
      // The gap between cells is an inset measured in panel pixels, but the backing canvas is
      // coarser than the panel once MAX_COLS caps it. On a wide window a 3px gap lands under
      // half a backing pixel, rounds away, and the row fuses into one band. Quantise cells to
      // the backing grid and always keep at least one pixel back for the gap.
      const gx = Math.max(1, Math.round(s.gap * sx))
      const gy = Math.max(1, Math.round(s.gap * sy))
      // Ease-out: the sweep moves right away and settles, like anything that appears.
      const reveal = easeOutCubic(prog)
      const diag = Math.max(nRows + nCols - 2, 1)
      const [fr, fg, fb] = s.seed.fill
      const [er, eg, eb] = PALETTE.grey.fill
      let rim: [number, number, number, number] | null = null

      for (let r = 0; r < nRows; r++) {
        for (let col = 0; col < nCols; col++) {
          // Cell bounds come from the gapless grid the cell sits in, so neighbours quantise to
          // the same boundary and every cell ends up the same size.
          const rect = s.cell(r, col)
          const x0 = Math.max(0, Math.round((rect.x - s.gap / 2) * sx))
          const y0 = Math.max(0, Math.round((rect.y - s.gap / 2) * sy))
          const xEnd = Math.round((rect.x + rect.width + s.gap / 2) * sx)
          const yEnd = Math.round((rect.y + rect.height + s.gap / 2) * sy)
          const x1 = Math.min(cols, Math.max(x0 + 1, xEnd - gx))
          const y1 = Math.min(rows, Math.max(y0 + 1, yEnd - gy))
          // Diagonal ripple: a cell's share of the sweep is its distance from
          // the top-left corner; it fades in over SPREAD of the sweep behind the front.
          const frac = (r + col) / diag
          const appear = animate ? clamp01((reveal * (1 + SPREAD) - frac) / SPREAD) : 1
          if (appear <= 0) continue

          const v = s.values[r]?.[col]
          if (typeof v !== 'number' || !Number.isFinite(v)) {
            // No value: a faint solid tile so the grid still reads complete.
            const a = Math.round(0.1 * appear * 255)
            for (let y = y0; y < y1; y++) {
              let i = (y * cols + x0) * 4
              for (let x = x0; x < x1; x++, i += 4) {
                px[i] = er
                px[i + 1] = eg
                px[i + 2] = eb
                px[i + 3] = a
              }
            }
            continue
          }

          const density = s.norm(v)
          const active = s.hover !== null && s.hover[0] === r && s.hover[1] === col
          const lift = intensity * 0.12 + (active ? 0.35 : 0)
          const k = (FLOOR + (1 - FLOOR) * density) * (1 + lift)
          const onA = Math.round(clamp01(k) * appear * 255)
          const offA = Math.round(clamp01(k * OFF_TIER) * appear * 255)
          const threshold = 0.1 * lift
          for (let y = y0; y < y1; y++) {
            const bayer = BAYER[y & 3]
            let i = (y * cols + x0) * 4
            for (let x = x0; x < x1; x++, i += 4) {
              px[i] = fr
              px[i + 1] = fg
              px[i + 2] = fb
              px[i + 3] = density > bayer[x & 3] - threshold ? onA : offA
            }
          }
          if (active) rim = [x0, y0, x1, y1]
        }
      }
      c.putImageData(img, 0, 0)
      if (rim) {
        // Solid rim on the hovered cell so it is unmistakable over the dither.
        const [x0, y0, x1, y1] = rim
        c.fillStyle = rgb(s.seed.fill, 1, 0.9)
        c.fillRect(x0, y0, x1 - x0, 1)
        c.fillRect(x0, y1 - 1, x1 - x0, 1)
        c.fillRect(x0, y0, 1, y1 - y0)
        c.fillRect(x1 - 1, y0, 1, y1 - y0)
      }
    }

    const draw = (now: number) => {
      raf = requestAnimationFrame(draw)
      const s = state.current
      if (!s.ready) return
      if (bloomCtx) {
        const on = s.bloom !== 'off' && (!s.bloomOnHover || s.isMouseInChart)
        if (on) {
          bloomCtx.clearRect(0, 0, cols, rows)
          bloomCtx.drawImage(canvas, 0, 0)
        }
      }
      if (s.revision !== lastRevision) {
        lastRevision = s.revision
        animStart = 0
        lastProg = -1
        entranceReported = false
      }
      if (!animStart) animStart = now
      const prog = animate ? Math.min(1, (now - animStart) / duration) : 1
      if (prog >= 1 && !entranceReported) {
        entranceReported = true
        s.markEntranceDone()
      }

      const hoverKey = s.hover ? `${s.hover[0]},${s.hover[1]}` : null
      if (hoverKey !== lastHover) {
        lastHover = hoverKey
        needsFill = true
      }
      const itTarget = s.isMouseInChart ? 1 : 0
      if (Math.abs(intensity - itTarget) > 0.001) {
        intensity += (itTarget - intensity) * (reduce ? 1 : 0.16)
        needsFill = true
      } else intensity = itTarget
      if (prog !== lastProg) {
        lastProg = prog
        needsFill = true
      }

      if (!needsFill) return
      paint(prog)
      needsFill = false
    }

    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [cols, rows, width, height])

  const bloom = bloomLayerStyle(ctx.bloom, ctx.bloomOnHover ? ctx.isMouseInChart : true)
  const pos = { left: ctx.margins.left, top: ctx.margins.top, width, height } as const

  return (
    <>
      <canvas
        ref={canvasRef}
        className="pointer-events-none absolute"
        style={{ ...pos, imageRendering: 'pixelated' }}
      />
      <canvas
        ref={bloomRef}
        className="pointer-events-none absolute"
        style={{ ...pos, transition: 'opacity 220ms ease', ...(bloom ?? { opacity: 0 }) }}
      />
    </>
  )
}
