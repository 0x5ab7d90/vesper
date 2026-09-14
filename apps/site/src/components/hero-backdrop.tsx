import { useEffect, useRef, useState } from "react"

import { createShader, type ShaderHandle } from "./hero-shader.webgpu"

// The band sits on the frame's black, so the shader's darkest pixels should be
// that same black rather than the shader's own off-black default.
const BACKDROP = "#000000"

// The canvas spans the whole frame but the app window hides all but its rim, so
// a full-resolution field would spend ~90% of every frame on pixels nobody sees.
// The shader sizes its glyph cells off the ratio it is handed, so they stay the
// same size on screen as this comes down; only the rim gets softer.
const MAX_PIXELS = 300_000

/**
 * The rim of motion around the app window in the hero: an ascii field drawn
 * with WebGPU. It fades up out of the frame's black once the first frame is
 * ready, so a slow adapter never shows a half-drawn canvas. The shader holds a
 * still frame under `prefers-reduced-motion`.
 */
export function HeroBackdrop() {
  const canvas = useRef<HTMLCanvasElement>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const element = canvas.current
    if (!element) return

    const controller = new AbortController()
    let handle: ShaderHandle | null = null

    createShader(element, {
      background: { dark: BACKDROP },
      maxPixels: MAX_PIXELS,
      signal: controller.signal,
      onError: () => setReady(false),
    })
      .then((created) => {
        if (controller.signal.aborted) {
          created.destroy()
          return
        }
        handle = created
        setReady(true)
      })
      // No WebGPU, no adapter, or the device went away. The band stays black,
      // which is the frame colour, so there is nothing to report.
      .catch(() => setReady(false))

    return () => {
      controller.abort()
      handle?.destroy()
    }
  }, [])

  return (
    <canvas
      ref={canvas}
      aria-hidden="true"
      style={{
        position: "absolute",
        inset: 0,
        display: "block",
        width: "100%",
        height: "100%",
        opacity: ready ? 1 : 0,
        transition: "opacity 700ms ease-out",
        pointerEvents: "none",
      }}
    />
  )
}
