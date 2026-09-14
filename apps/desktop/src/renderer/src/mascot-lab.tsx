import '@fontsource-variable/inter'
import { StrictMode, useEffect, useReducer } from 'react'
import { createRoot } from 'react-dom/client'
import { DropMascot } from './components/brand/drop-mascot'
import { DROP_MOODS, type DropMood } from './components/brand/drop-moods'
import { click, setSoundEnabled } from './lab-sounds'

// A temporary lab for the mascot: every mood, the idle loop toggle, gloss toggle, colour
// presets and the sizes it will be used at. Standalone entry, like the splash, so it runs
// without the app or Electron.

const LABELS: Record<DropMood, string> = {
  idle: 'Idle',
  glance: 'Glance',
  confused: 'Confused',
  waiting: 'Waiting',
  sleepy: 'Sleepy',
  happy: 'Happy'
}
const SIZES = [400, 80, 32] as const
// Same list as the site's colour lab, the brand violet first.
const COLORS = [
  { name: 'violet', fill: '#7A3FE4' },
  { name: 'crimson', fill: '#E0284A' },
  { name: 'cobalt', fill: '#2F6BE0' },
  { name: 'azure', fill: '#1E90FF' },
  { name: 'teal', fill: '#0FA3A3' },
  { name: 'emerald', fill: '#17B36B' },
  { name: 'amber', fill: '#F5A623' },
  { name: 'tangerine', fill: '#FF6A2C' },
  { name: 'magenta', fill: '#D62AA0' },
  { name: 'sky', fill: '#A9CDF0' },
  { name: 'slate', fill: '#767676' },
  { name: 'peach', fill: '#F5B7A0' },
  { name: 'apricot', fill: '#F4C89A' },
  { name: 'butter', fill: '#F2E2A0' }
] as const

type State = {
  mood: DropMood
  loop: boolean
  gloss: boolean
  sound: boolean
  size: (typeof SIZES)[number]
  percent: number | null
  fill: string
  /** Replay bumps this to remount the mascot so entry animations run again. */
  take: number
}
type Event =
  | { type: 'SELECT'; mood: DropMood }
  | { type: 'NEXT' }
  | { type: 'PREV' }
  | { type: 'LOOP'; on: boolean }
  | { type: 'GLOSS'; on: boolean }
  | { type: 'SOUND'; on: boolean }
  | { type: 'SIZE'; size: State['size'] }
  | { type: 'PERCENT'; value: number | null }
  | { type: 'FILL'; fill: string }
  | { type: 'REPLAY' }

function reducer(s: State, e: Event): State {
  const i = DROP_MOODS.indexOf(s.mood)
  switch (e.type) {
    case 'SELECT':
      return { ...s, mood: e.mood }
    case 'NEXT':
      return { ...s, mood: DROP_MOODS[(i + 1) % DROP_MOODS.length] }
    case 'PREV':
      return { ...s, mood: DROP_MOODS[(i - 1 + DROP_MOODS.length) % DROP_MOODS.length] }
    case 'LOOP':
      return { ...s, loop: e.on }
    case 'GLOSS':
      return { ...s, gloss: e.on }
    case 'SOUND':
      return { ...s, sound: e.on }
    case 'SIZE':
      return { ...s, size: e.size }
    case 'PERCENT':
      return { ...s, percent: e.value }
    case 'FILL':
      return { ...s, fill: e.fill }
    case 'REPLAY':
      return { ...s, take: s.take + 1 }
  }
}

const font =
  '"Inter Variable", -apple-system, BlinkMacSystemFont, "SF Pro", "Segoe UI Variable", "Segoe UI", system-ui, sans-serif'

function Segmented<T extends string | number | boolean>({
  value,
  options,
  onChange
}: {
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
}): React.JSX.Element {
  return (
    <div
      style={{
        display: 'inline-flex',
        padding: 3,
        gap: 2,
        borderRadius: 10,
        background: 'rgba(255,255,255,0.08)'
      }}
    >
      {options.map((o) => {
        const active = o.value === value
        return (
          <button
            key={String(o.value)}
            type="button"
            onClick={() => {
              click('toggle')
              onChange(o.value)
            }}
            style={{
              border: 0,
              cursor: 'pointer',
              padding: '7px 13px',
              borderRadius: 8,
              fontFamily: font,
              fontSize: 13,
              fontWeight: 500,
              color: active ? '#111' : 'rgba(255,255,255,0.45)',
              background: active ? '#fff' : 'transparent',
              transition: 'background 160ms ease, color 160ms ease'
            }}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

function Lab(): React.JSX.Element {
  const [s, send] = useReducer(reducer, {
    mood: 'idle',
    loop: true,
    gloss: true,
    sound: true,
    size: 400,
    percent: null,
    fill: COLORS[0].fill,
    take: 0
  })

  useEffect(() => setSoundEnabled(s.sound), [s.sound])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const i = DROP_MOODS.indexOf(s.mood)
      if (e.key === 'ArrowDown' || e.key === 'j') {
        click('state', i + 1)
        send({ type: 'NEXT' })
      }
      if (e.key === 'ArrowUp' || e.key === 'k') {
        click('state', i - 1)
        send({ type: 'PREV' })
      }
      if (e.key === 'r') {
        click('replay')
        send({ type: 'REPLAY' })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [s.mood])

  const label = (text: string): React.JSX.Element => (
    <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', marginBottom: 10 }}>{text}</div>
  )

  return (
    <div
      style={{
        height: '100%',
        display: 'grid',
        gridTemplateColumns: '380px 1fr',
        fontFamily: font,
        color: '#fff'
      }}
    >
      <aside
        style={{
          padding: '40px 0 40px 32px',
          display: 'flex',
          flexDirection: 'column',
          gap: 26,
          overflowY: 'auto'
        }}
      >
        <div>
          {label('State')}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {DROP_MOODS.map((m, i) => {
              const active = m === s.mood
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => {
                    click('state', i)
                    send({ type: 'SELECT', mood: m })
                  }}
                  style={{
                    all: 'unset',
                    cursor: 'pointer',
                    fontSize: 22,
                    lineHeight: 1.3,
                    fontWeight: active ? 700 : 400,
                    color: active ? '#fff' : 'rgba(255,255,255,0.5)',
                    transition: 'color 160ms ease'
                  }}
                >
                  {LABELS[m]}
                </button>
              )
            })}
            <button
              type="button"
              onClick={() => {
                click('replay')
                send({ type: 'REPLAY' })
              }}
              style={{
                all: 'unset',
                cursor: 'pointer',
                fontSize: 22,
                lineHeight: 1.3,
                color: 'rgba(255,255,255,0.5)',
                marginTop: 8
              }}
            >
              Replay
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap' }}>
          <div>
            {label('Idle loop')}
            <Segmented
              value={s.loop}
              options={[
                { value: true, label: 'On' },
                { value: false, label: 'Off' }
              ]}
              onChange={(on) => send({ type: 'LOOP', on })}
            />
          </div>
          <div>
            {label('Gloss')}
            <Segmented
              value={s.gloss}
              options={[
                { value: true, label: 'On' },
                { value: false, label: 'Off' }
              ]}
              onChange={(on) => send({ type: 'GLOSS', on })}
            />
          </div>
          <div>
            {label('Sound')}
            <Segmented
              value={s.sound}
              options={[
                { value: true, label: 'On' },
                { value: false, label: 'Off' }
              ]}
              onChange={(on) => send({ type: 'SOUND', on })}
            />
          </div>
        </div>

        <div>
          {label('Size')}
          <Segmented
            value={s.size}
            options={SIZES.map((v) => ({ value: v, label: String(v) }))}
            onChange={(size) => send({ type: 'SIZE', size })}
          />
        </div>

        <div style={{ opacity: s.mood === 'waiting' ? 1 : 0.35, transition: 'opacity 160ms' }}>
          {label('Progress (waiting)')}
          <Segmented
            value={s.percent === null ? 'none' : String(s.percent)}
            options={[
              { value: 'none', label: 'Indeterminate' },
              { value: '25', label: '25' },
              { value: '60', label: '60' },
              { value: '100', label: '100' }
            ]}
            onChange={(v) => send({ type: 'PERCENT', value: v === 'none' ? null : Number(v) })}
          />
        </div>

        <div>
          {label('Colour')}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, maxWidth: 300 }}>
            {COLORS.map((c, i) => {
              const active = c.fill === s.fill
              return (
                <button
                  key={c.name}
                  type="button"
                  title={c.name}
                  aria-label={c.name}
                  aria-pressed={active}
                  onClick={() => {
                    click('swatch', i)
                    send({ type: 'FILL', fill: c.fill })
                  }}
                  style={{
                    width: 26,
                    height: 26,
                    padding: 0,
                    border: 0,
                    borderRadius: '50%',
                    cursor: 'pointer',
                    background: c.fill,
                    boxShadow: active
                      ? '0 0 0 2px #000, 0 0 0 4px #fff'
                      : '0 0 0 1px rgba(255,255,255,0.12) inset',
                    transition: 'box-shadow 160ms ease'
                  }}
                />
              )
            })}
          </div>
        </div>

        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)' }}>
          Arrow keys or j / k to move, r to replay.
        </div>
      </aside>

      <main style={{ display: 'grid', placeItems: 'center' }}>
        <DropMascot
          key={s.take}
          mood={s.mood}
          loop={s.loop}
          gloss={s.gloss}
          size={s.size}
          fill={s.fill}
          percent={s.mood === 'waiting' ? s.percent : null}
        />
      </main>
    </div>
  )
}

void document.fonts.load('500 14px "Inter Variable"').catch(() => undefined)
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Lab />
  </StrictMode>
)
