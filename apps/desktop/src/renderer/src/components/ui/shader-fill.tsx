import { useEffect, useRef, useState } from 'react'
import { createShader, type ShaderHandle } from '@renderer/lib/dither-shader.webgpu'
import { cn } from '@renderer/lib/cn'

// A bar's worth of pixels is tiny, so the budget just stops a very wide track from asking
// for more than the field is worth.
const MAX_PIXELS = 40_000

/**
 * The landing page's dithered field, sized to fill whatever box it sits in. Paints over a
 * solid violet of the same hue, and only fades up once the first frame has landed, so a
 * missing adapter or a slow device leaves the plain colour rather than a hole.
 */
export function ShaderFill({
  className,
  background = '#171515',
  bleed = 0,
  timeScale = 1
}: {
  className?: string
  /** #rrggbb the shader's darkest pixels fall to; match the surface behind the fill. */
  background?: string
  /**
   * Extra canvas height, in px, hidden above and below the box. The field scales off canvas
   * height, so a few-pixel-tall bar would otherwise see one smeared stripe of it; drawing a
   * taller field and showing its middle band keeps the texture at a sane scale. The host
   * must clip overflow.
   */
  bleed?: number
  /** Clock multiplier; a thin slice of the field needs faster drift to read as moving. */
  timeScale?: number
}): React.JSX.Element {
  const canvas = useRef<HTMLCanvasElement>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const element = canvas.current
    if (!element) return
    const controller = new AbortController()
    let handle: ShaderHandle | null = null

    createShader(element, {
      background: { dark: background },
      maxPixels: MAX_PIXELS,
      timeScale,
      signal: controller.signal,
      onError: () => setReady(false)
    })
      .then((created) => {
        if (controller.signal.aborted) {
          created.destroy()
          return
        }
        handle = created
        setReady(true)
      })
      .catch(() => setReady(false))

    return () => {
      controller.abort()
      handle?.destroy()
    }
  }, [background, timeScale])

  return (
    <canvas
      ref={canvas}
      aria-hidden
      className={cn(
        'pointer-events-none absolute left-0 block w-full transition-opacity duration-300 ease-out',
        ready ? 'opacity-100' : 'opacity-0',
        className
      )}
      style={{ top: -bleed, height: `calc(100% + ${bleed * 2}px)` }}
    />
  )
}
