/*
 * ikousikdas · OpenShaders — https://openshaders.com/@ikousikdas
 * WebGPU · dither
 *
 * Vendored. The upstream React wrapper was dropped; hero-backdrop.tsx drives
 * `createShader` directly so it can tell when the first frame lands. Two other
 * changes from the source, both marked below: the `maxPixels` option, and a
 * tinted floor under the field so the rim never bottoms out to black.
 */

const FIELD_SHADER = `struct Uniforms {
  resolution: vec2f,
  time: f32,
  lightMode: f32,
  darkBackground: vec3f,
  pixelRatio: f32,
  lightBackground: vec3f,
}
@group(0) @binding(0) var<uniform> u: Uniforms;

const HUE: f32 = 0.698732793;
const HUE_SPREAD: f32 = 0.158122376;
const HUE_TRAVEL: f32 = 1.9665072;
const CHROMA: f32 = 0.164083183;
const LIGHTNESS: f32 = 0.518666744;
const COLOUR_CYCLE: f32 = 0.228598669;
const THETA: f32 = 2.12045741;
const SHEAR: f32 = 0.958195627;
const SHRINK: f32 = 0.947512805;
const LAYERS: f32 = 80.0;
const WARP_FREQ_X: f32 = 0.589318752;
const WARP_FREQ_Y: f32 = 2.07117844;
const WARP_AMP_X: f32 = 0.13557522;
const WARP_AMP_Y: f32 = 0.034511786;
const ASPECT_X: f32 = 2.49771571;
const ASPECT_Y: f32 = 0.134689555;
const OFFSET_X: f32 = 0.3501077;
const OFFSET_Y: f32 = -0.0350841135;
const TILT: f32 = 0.919211268;
const ZOOM: f32 = 0.981723249;
const CENTRE_X: f32 = -0.139665559;
const CENTRE_Y: f32 = -0.687601686;
const GLOW_SIZE: f32 = 0.00258922996;
const FALLOFF: f32 = 0.313483953;
const VIGNETTE: f32 = 0.0647038072;
const FLOW_SPEED: f32 = 0.395169288;
const FLOW_DIRECTION: f32 = 1.0;
const BREATH_RATE: f32 = 0.382269382;
const BREATH_AMOUNT: f32 = 0.110518456;
const PHASE: f32 = 61.4440804;
const ECHO: f32 = 0.0;
const ECHO_SHIFT: f32 = -0.187745616;
const SOFTNESS: f32 = 0.00265127933;
const LIGHT_SWING: f32 = 0.188226059;

// Added to the vendored source: the floor the field can never fall below.
const FLOOR_LIGHTNESS: f32 = 0.50;
const FLOOR_CHROMA: f32 = 0.115;

@vertex fn vertexMain(@builtin(vertex_index) index: u32) -> @builtin(position) vec4f {
  let position = vec2f(f32((index << 1u) & 2u), f32(index & 2u));
  return vec4f(position * 2.0 - 1.0, 0.0, 1.0);
}

const TAU: f32 = 6.28318530718;

fn oklchToLinear(L: f32, C: f32, h: f32) -> vec3f {
  let a = C * cos(h);
  let b = C * sin(h);
  let l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  let m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  let s_ = L - 0.0894841775 * a - 1.2914855480 * b;
  var lms = vec3f(l_, m_, s_);
  lms = lms * lms * lms;
  return mat3x3f(4.0767416621, -1.2684380046, -0.0041960863,
                 -3.3077115913, 2.6097574011, -0.7034186147,
                 0.2309699292, -0.3413193965, 1.7076147010) * lms;
}

fn fmod(x: f32, y: f32) -> f32 { return x - y * floor(x / y); }

fn blueNoise(p: vec2f, frame: f32) -> f32 {
  let q = p + 5.588238 * fmod(frame, 64.0);
  return fract(52.9829189 * fract(0.06711056 * q.x + 0.00583715 * q.y));
}

@fragment fn fragmentMain(@builtin(position) position: vec4f) -> @location(0) vec4f {
  let R = u.resolution;
  let frag = vec2f(position.x, R.y - position.y);
  let pos = (frag - 0.5 * R) / R.y;
  let t = u.time * FLOW_SPEED * FLOW_DIRECTION + PHASE;
  let breath = (-sin(u.time * BREATH_RATE * 1.5) + sin(u.time * BREATH_RATE + 1.0)) * 0.25 + 0.5;

  var p = (pos - vec2f(CENTRE_X, CENTRE_Y)) * (ZOOM - breath * BREATH_AMOUNT);
  let ct = cos(TILT);
  let st = sin(TILT);
  p = mat2x2f(ct, st, -st, ct) * p;

  let fold = mat2x2f(cos(THETA), sin(THETA), -SHEAR, cos(THETA));

  let hue0 = HUE * TAU;
  let hue1 = hue0 + HUE_SPREAD * TAU;
  var color = vec3f(0.0);

  for (var i: f32 = 1.0; i <= 96.0; i += 1.0) {
    if (i > LAYERS) { break; }
    p.x += -sin(p.y * WARP_FREQ_X + t + i * 0.007) * WARP_AMP_X;
    p.y += -sin(p.x * WARP_FREQ_Y - t + i * 0.02) * WARP_AMP_Y;
    p = fold * p * SHRINK;

    let q = p - vec2f(OFFSET_X + breath * 0.1, OFFSET_Y);
    let s = vec2f(q.x * ASPECT_X, q.y * ASPECT_Y);
    var glow = GLOW_SIZE / (dot(s, s) + SOFTNESS);
    if (ECHO > 0.0) {
      let e = vec2f((q.x - ECHO_SHIFT) * ASPECT_X, s.y);
      glow += ECHO * GLOW_SIZE / (dot(e, e) + SOFTNESS);
    }
    glow *= 0.25 + breath * 0.4;

    let r = length(p);
    let k = sin(i * COLOUR_CYCLE + t * 1.2 + r * HUE_TRAVEL) * 0.5 + 0.5;
    let tint = clamp(oklchToLinear(LIGHTNESS + LIGHT_SWING * k, CHROMA * (0.75 + 0.35 * k), mix(hue0, hue1, k)), vec3f(0.0), vec3f(1.0));
    color += glow * tint * exp2(-r * FALLOFF);
  }

  let x = max(color, vec3f(0.0));
  color = (x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14);
  color = pow(clamp(color, vec3f(0.0), vec3f(1.0)), vec3f(0.85, 0.92, 0.98));

  // Added to the vendored source. The field drifts, so wherever no structure
  // happens to be near, the rim fell to the page's black and the dither had no
  // signal left to work with. Screening a dim tint from the field's own hue
  // under everything puts a floor on it: the texture stays legible everywhere
  // and the bright structures still read on top.
  let floorTint = clamp(oklchToLinear(FLOOR_LIGHTNESS, FLOOR_CHROMA, mix(hue0, hue1, 0.5)), vec3f(0.0), vec3f(1.0));
  color = floorTint + color * (1.0 - floorTint);

  let edge = smoothstep(0.5, 1.6, length(pos));
  color *= 1.0 - edge * VIGNETTE;

  let dark = u.darkBackground + color * (1.0 - u.darkBackground);
  let strength = max(color.r, max(color.g, color.b));
  let light = u.lightBackground * (1.0 - strength) + color * 0.96;
  color = mix(dark, light, vec3f(u.lightMode));

  color += (blueNoise(frag, floor(u.time * 24.0)) - 0.5) / 255.0;
  return vec4f(clamp(color, vec3f(0.0), vec3f(1.0)), 1.0);
}
`

const RARITY_SHADER = `struct Uniforms {
  resolution: vec2f,
  time: f32,
  lightMode: f32,
  darkBackground: vec3f,
  pixelRatio: f32,
  lightBackground: vec3f,
}
@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var sceneSampler: sampler;
@group(0) @binding(2) var tScene: texture_2d<f32>;

const STRENGTH: f32 = 0.901340127;
const SCALE: f32 = 1.23227406;
const SEED: f32 = 0.0523844287;

@vertex fn vertexMain(@builtin(vertex_index) index: u32) -> @builtin(position) vec4f {
  let position = vec2f(f32((index << 1u) & 2u), f32(index & 2u));
  return vec4f(position * 2.0 - 1.0, 0.0, 1.0);
}

const TAU: f32 = 6.28318530718;
const LUMA = vec3f(0.2126, 0.7152, 0.0722);

fn toInk(c: vec3f) -> vec3f { return mix(c - u.darkBackground, u.lightBackground - c, vec3f(u.lightMode)); }
fn fromInk(ink: vec3f) -> vec3f { return mix(u.darkBackground + ink, u.lightBackground - ink, vec3f(u.lightMode)); }
fn sceneInk(uv: vec2f) -> vec3f {
  let c = clamp(uv, vec2f(0.0), vec2f(1.0));
  return toInk(textureSample(tScene, sceneSampler, vec2f(c.x, 1.0 - c.y)).rgb);
}

fn fmod(x: f32, y: f32) -> f32 { return x - y * floor(x / y); }
fn fmod2(x: vec2f, y: f32) -> vec2f { return x - y * floor(x / y); }

const BAYER = mat4x4f(
  0.94118, 0.29412, 0.76471, 0.05882,
  0.47059, 0.70588, 0.23529, 0.52941,
  0.82353, 0.11765, 0.88235, 0.17647,
  0.35294, 0.58824, 0.41176, 0.64706
);

fn dither(frag: vec2f) -> vec3f {
  let cell = max(2.0, floor(SCALE * 2.2 * u.pixelRatio + 0.5));
  let grid = floor(frag / cell);
  let soft = sceneInk(frag / u.resolution);
  let ink = sceneInk((grid + 0.5) * cell / u.resolution);
  let level = dot(ink, LUMA);
  let levels = 8.0;
  let b = vec2i(fmod2(grid, 4.0));
  let bayer = BAYER;
  let v = pow(max(level, 0.0), 0.8) * levels + bayer[b.x][b.y];
  let quantised = pow(floor(v) / levels, 1.25);
  let dithered = ink * (quantised / max(level, 1e-4));
  let presence = smoothstep(0.03, 0.14, level) * (0.38 + 0.2 * STRENGTH);
  return mix(soft, dithered, vec3f(presence));
}

@fragment fn fragmentMain(@builtin(position) position: vec4f) -> @location(0) vec4f {
  let frag = vec2f(position.x, u.resolution.y - position.y);
  let ink = dither(frag);
  var color = fromInk(clamp(ink, vec3f(0.0), vec3f(1.0)));
  return vec4f(clamp(color, vec3f(0.0), vec3f(1.0)), 1.0);
}
`

export type ShaderTheme = "dark" | "light"

export type ShaderOptions = {
  theme?: ShaderTheme
  background?: { dark?: string; light?: string }
  autoplay?: boolean
  signal?: AbortSignal
  onError?: (error: Error) => void
  /** Added to the vendored source: lowers the per-frame pixel budget. */
  maxPixels?: number
}

export type ShaderHandle = {
  setTheme(theme: ShaderTheme): void
  render(time: number): void
  destroy(): void
}

const MAX_PIXELS = 2400000
const THEME_EASE = 7

function parseHex(hex: string): [number, number, number] {
  const match = /^#([0-9a-f]{6})$/i.exec(hex.trim())
  if (!match) throw new Error(`Background colours must be #rrggbb, got "${hex}".`)
  return [0, 2, 4].map((i) => parseInt(match[1].slice(i, i + 2), 16) / 255) as [
    number,
    number,
    number,
  ]
}

function animate(
  options: ShaderOptions,
  draw: (time: number, theme: number, pixelRatio: number) => void,
  canvas: HTMLCanvasElement,
  release: () => void,
  maxDimension = Infinity,
): ShaderHandle {
  const autoplay = options.autoplay !== false
  const stillness = window.matchMedia("(prefers-reduced-motion: reduce)")
  let resolution = window.matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`)
  let deviceRatio = window.devicePixelRatio || 1
  let width = canvas.clientWidth,
    height = canvas.clientHeight
  let visible = true
  let disposed = false
  let targetTheme = options.theme === "light" ? 1 : 0
  let theme = targetTheme
  let frame = 0
  let elapsed = 0
  let lastTime = 0
  let previous: number | null = null

  function canDraw() {
    return !disposed && !document.hidden && visible && width > 0 && height > 0
  }

  function fitCanvas() {
    const scale = Math.min(
      deviceRatio,
      2,
      Math.sqrt((options.maxPixels ?? MAX_PIXELS) / (width * height)),
      maxDimension / width,
      maxDimension / height,
    )
    const w = Math.max(1, Math.floor(width * scale)),
      h = Math.max(1, Math.floor(height * scale))
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w
      canvas.height = h
    }
    return w / width
  }

  function render(time: number) {
    if (disposed) return
    lastTime = time
    if (!canDraw()) return
    try {
      draw(time, theme, fitCanvas())
    } catch (error) {
      destroy()
      const failure = error instanceof Error ? error : new Error(String(error))
      if (options.onError) options.onError(failure)
      else console.error(failure)
    }
  }

  function schedule() {
    if (!frame && canDraw()) frame = requestAnimationFrame(tick)
  }

  function refresh() {
    if (!canDraw()) {
      cancelAnimationFrame(frame)
      frame = 0
      previous = null
    } else schedule()
  }

  function tick(now: number) {
    frame = 0
    if (!canDraw()) {
      previous = null
      return
    }
    const delta = previous === null ? 0 : Math.min((now - previous) / 1000, 0.1)
    previous = now
    if (autoplay) {
      if (!stillness.matches) elapsed += delta
      theme += (targetTheme - theme) * (1 - Math.exp(-delta * THEME_EASE))
      if (Math.abs(targetTheme - theme) < 0.002) theme = targetTheme
    }
    render(autoplay ? elapsed : lastTime)
    if (autoplay && (!stillness.matches || theme !== targetTheme)) schedule()
    else previous = null
  }

  function pixelRatioChanged() {
    if (disposed) return
    const next = window.devicePixelRatio || 1
    if (deviceRatio === next) return
    deviceRatio = next
    resolution.removeEventListener("change", pixelRatioChanged)
    resolution = window.matchMedia(`(resolution: ${next}dppx)`)
    resolution.addEventListener("change", pixelRatioChanged)
    refresh()
  }

  const observer = new ResizeObserver(([entry]) => {
    if (disposed || !entry) return
    const next = entry.contentRect
    if (width === next.width && height === next.height) return
    width = next.width
    height = next.height
    refresh()
  })
  const intersection = new IntersectionObserver(([entry]) => {
    if (disposed || !entry || visible === entry.isIntersecting) return
    visible = entry.isIntersecting
    refresh()
  })

  function destroy() {
    if (disposed) return
    disposed = true
    cancelAnimationFrame(frame)
    frame = 0
    observer.disconnect()
    intersection.disconnect()
    resolution.removeEventListener("change", pixelRatioChanged)
    stillness.removeEventListener("change", refresh)
    document.removeEventListener("visibilitychange", refresh)
    window.removeEventListener("resize", pixelRatioChanged)
    options.signal?.removeEventListener("abort", destroy)
    release()
  }

  observer.observe(canvas)
  intersection.observe(canvas)
  resolution.addEventListener("change", pixelRatioChanged)
  stillness.addEventListener("change", refresh)
  document.addEventListener("visibilitychange", refresh)
  window.addEventListener("resize", pixelRatioChanged)
  options.signal?.addEventListener("abort", destroy, { once: true })
  if (options.signal?.aborted) destroy()
  else schedule()

  return {
    setTheme(next: ShaderTheme) {
      if (disposed) return
      targetTheme = next === "light" ? 1 : 0
      if (autoplay) refresh()
      else {
        theme = targetTheme
        render(lastTime)
      }
    },
    render,
    destroy,
  }
}

const UNIFORM_FLOATS = 12

export async function createShader(
  canvas: HTMLCanvasElement,
  options: ShaderOptions = {},
): Promise<ShaderHandle> {
  const dark = parseHex(options.background?.dark ?? "#090909")
  const light = parseHex(options.background?.light ?? "#ffffff")
  options.signal?.throwIfAborted()
  if (!navigator.gpu) throw new Error("WebGPU is not available in this browser.")
  const adapter = await navigator.gpu.requestAdapter()
  options.signal?.throwIfAborted()
  if (!adapter) throw new Error("No WebGPU adapter is available.")
  const device = await adapter.requestDevice()
  let context: GPUCanvasContext | null = null
  let configured = false
  let released = false
  let failure: Error | null = null
  let handle: ShaderHandle | null = null

  function release() {
    if (released) return
    released = true
    options.signal?.removeEventListener("abort", abort)
    device.removeEventListener("uncapturederror", gpuError)
    if (configured) context?.unconfigure()
    device.destroy()
  }

  function abort() {
    if (handle) handle.destroy()
    else release()
  }

  function fail(error: Error) {
    if (released) return
    failure = error
    if (handle) {
      handle.destroy()
      if (options.onError) options.onError(error)
      else console.error(error)
    } else release()
  }

  function gpuError(event: GPUUncapturedErrorEvent) {
    event.preventDefault()
    fail(new Error(event.error.message))
  }

  function checkActive() {
    options.signal?.throwIfAborted()
    if (failure) throw failure
  }

  options.signal?.addEventListener("abort", abort, { once: true })
  device.addEventListener("uncapturederror", gpuError)
  void device.lost.then((info) => {
    if (!released) fail(new Error(`WebGPU device lost: ${info.message || info.reason}.`))
  })

  try {
    checkActive()
    const format = navigator.gpu.getPreferredCanvasFormat()
    const uniforms = device.createBuffer({
      size: UNIFORM_FLOATS * 4,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    })
    const uniformData = new Float32Array(UNIFORM_FLOATS)
    const fieldModule = device.createShaderModule({ code: FIELD_SHADER })
    const postModule = device.createShaderModule({ code: RARITY_SHADER })
    const [fieldPipeline, postPipeline, postBlendPipeline] = await Promise.all([
      device.createRenderPipelineAsync({
        layout: "auto",
        vertex: { module: fieldModule, entryPoint: "vertexMain" },
        fragment: {
          module: fieldModule,
          entryPoint: "fragmentMain",
          targets: [{ format: "rgba8unorm" }],
        },
        primitive: { topology: "triangle-list" },
      }),
      device.createRenderPipelineAsync({
        layout: "auto",
        vertex: { module: postModule, entryPoint: "vertexMain" },
        fragment: { module: postModule, entryPoint: "fragmentMain", targets: [{ format }] },
        primitive: { topology: "triangle-list" },
      }),
      device.createRenderPipelineAsync({
        layout: "auto",
        vertex: { module: postModule, entryPoint: "vertexMain" },
        fragment: {
          module: postModule,
          entryPoint: "fragmentMain",
          targets: [
            {
              format,
              blend: {
                color: { srcFactor: "constant", dstFactor: "one-minus-constant" },
                alpha: { srcFactor: "one", dstFactor: "zero" },
              },
            },
          ],
        },
        primitive: { topology: "triangle-list" },
      }),
    ])
    checkActive()
    const fieldBindGroup = device.createBindGroup({
      layout: fieldPipeline.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: { buffer: uniforms } }],
    })
    const sceneSampler = device.createSampler({
      magFilter: "linear",
      minFilter: "linear",
      addressModeU: "clamp-to-edge",
      addressModeV: "clamp-to-edge",
    })
    let scene: GPUTexture | null = null
    let sceneView: GPUTextureView | null = null
    let postBindGroups: GPUBindGroup[] = []

    function sceneFor(width: number, height: number) {
      if (scene && sceneView && scene.width === width && scene.height === height)
        return { view: sceneView, postBindGroups }
      scene?.destroy()
      scene = device.createTexture({
        size: [width, height],
        format: "rgba8unorm",
        usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
      })
      const view = scene.createView()
      sceneView = view
      postBindGroups = [postPipeline, postBlendPipeline].map((pipeline) =>
        device.createBindGroup({
          layout: pipeline.getBindGroupLayout(0),
          entries: [
            { binding: 0, resource: { buffer: uniforms } },
            { binding: 1, resource: sceneSampler },
            { binding: 2, resource: view },
          ],
        }),
      )
      return { view, postBindGroups }
    }

    const canvasContext = canvas.getContext("webgpu")
    if (!canvasContext) throw new Error("A WebGPU canvas context could not be created.")
    context = canvasContext
    context.configure({ device, format, alphaMode: "opaque" })
    configured = true

    handle = animate(
      options,
      (time, theme, pixelRatio) => {
        const { width, height } = canvas
        const output = canvasContext.getCurrentTexture().createView()
        const target = sceneFor(width, height)
        const drawThemed = (mode: number, blend: boolean) => {
          uniformData.set([
            width,
            height,
            time,
            mode,
            dark[0],
            dark[1],
            dark[2],
            pixelRatio,
            light[0],
            light[1],
            light[2],
            0,
          ])
          device.queue.writeBuffer(uniforms, 0, uniformData)
          const encoder = device.createCommandEncoder()
          const fieldPass = encoder.beginRenderPass({
            colorAttachments: [{ view: target.view, loadOp: "clear", storeOp: "store" }],
          })
          fieldPass.setPipeline(fieldPipeline)
          fieldPass.setBindGroup(0, fieldBindGroup)
          fieldPass.draw(3)
          fieldPass.end()

          const postPass = encoder.beginRenderPass({
            colorAttachments: [{ view: output, loadOp: blend ? "load" : "clear", storeOp: "store" }],
          })
          postPass.setPipeline(blend ? postBlendPipeline : postPipeline)
          postPass.setBindGroup(0, target.postBindGroups[blend ? 1 : 0])
          if (blend) postPass.setBlendConstant({ r: theme, g: theme, b: theme, a: theme })
          postPass.draw(3)
          postPass.end()
          device.queue.submit([encoder.finish()])
        }
        if (theme <= 0 || theme >= 1) {
          drawThemed(theme, false)
          return
        }
        drawThemed(0, false)
        drawThemed(1, true)
      },
      canvas,
      release,
      device.limits.maxTextureDimension2D,
    )
    return handle
  } catch (error) {
    release()
    throw failure ?? error
  }
}
