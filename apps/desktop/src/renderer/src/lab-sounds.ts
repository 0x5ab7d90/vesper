// Synthesised UI sounds for the mascot lab, all Web Audio, no samples. The aim is a mechanical
// keyboard feel: a filtered noise transient for the click itself, a low sine "thock" for the
// body, and small pitch differences so the state list plays like a little scale.

export type ClickKind = 'state' | 'toggle' | 'swatch' | 'replay'

let ctx: AudioContext | null = null
let out: GainNode | null = null
let noise: AudioBuffer | null = null
let enabled = true

export function setSoundEnabled(on: boolean): void {
  enabled = on
}

function graph(): { ctx: AudioContext; out: GainNode; noise: AudioBuffer } {
  if (!ctx) {
    ctx = new AudioContext()
    const comp = ctx.createDynamicsCompressor()
    comp.threshold.value = -18
    comp.knee.value = 12
    comp.ratio.value = 6
    comp.attack.value = 0.002
    comp.release.value = 0.08
    out = ctx.createGain()
    out.gain.value = 0.55
    out.connect(comp).connect(ctx.destination)
    const len = Math.floor(ctx.sampleRate * 0.06)
    noise = ctx.createBuffer(1, len, ctx.sampleRate)
    const data = noise.getChannelData(0)
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1
  }
  if (ctx.state === 'suspended') void ctx.resume()
  return { ctx, out: out!, noise: noise! }
}

function transient(
  t: number,
  freq: number,
  q: number,
  gain: number,
  ms: number,
  type: BiquadFilterType = 'bandpass'
): void {
  const g = graph()
  const src = g.ctx.createBufferSource()
  src.buffer = g.noise
  const f = g.ctx.createBiquadFilter()
  f.type = type
  f.frequency.value = freq
  f.Q.value = q
  const env = g.ctx.createGain()
  env.gain.setValueAtTime(gain, t)
  env.gain.exponentialRampToValueAtTime(0.001, t + ms / 1000)
  src.connect(f).connect(env).connect(g.out)
  src.start(t)
  src.stop(t + ms / 1000 + 0.02)
}

function tone(
  t: number,
  from: number,
  to: number,
  gain: number,
  ms: number,
  kind: OscillatorType = 'sine'
): void {
  const g = graph()
  const o = g.ctx.createOscillator()
  o.type = kind
  o.frequency.setValueAtTime(from, t)
  o.frequency.exponentialRampToValueAtTime(to, t + ms / 1000)
  const env = g.ctx.createGain()
  env.gain.setValueAtTime(0.0001, t)
  env.gain.exponentialRampToValueAtTime(gain, t + 0.003)
  env.gain.exponentialRampToValueAtTime(0.001, t + ms / 1000)
  o.connect(env).connect(g.out)
  o.start(t)
  o.stop(t + ms / 1000 + 0.02)
}

/** One click. `index` shifts the pitch a little so neighbouring buttons sound related, not identical. */
export function click(kind: ClickKind, index = 0): void {
  if (!enabled) return
  let t: number
  try {
    t = graph().ctx.currentTime
  } catch {
    return
  }
  const step = Math.pow(2, (index % 8) / 12)
  switch (kind) {
    case 'state':
      // press: bright click plus a thock, then a softer release click a beat later
      transient(t, 2600 * step, 1.4, 0.9, 14)
      tone(t, 210 * step, 150 * step, 0.5, 70)
      transient(t + 0.075, 3600, 1.1, 0.35, 10)
      break
    case 'toggle':
      transient(t, 3300, 1.2, 0.7, 10)
      tone(t, 300, 240, 0.28, 40)
      break
    case 'swatch':
      // a soft bubble pop, no hard transient
      tone(t, 620 * step, 330 * step, 0.4, 60)
      transient(t, 1500, 0.8, 0.25, 12, 'lowpass')
      break
    case 'replay':
      transient(t, 2600, 1.4, 0.9, 14)
      tone(t, 210, 150, 0.5, 70)
      transient(t + 0.09, 2900, 1.4, 0.8, 14)
      tone(t + 0.09, 260, 190, 0.45, 70)
      break
  }
}
