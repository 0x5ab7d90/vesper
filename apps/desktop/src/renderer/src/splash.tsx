import '@fontsource-variable/inter'
import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { DropMascot, type DropMood } from './components/brand/drop-mascot'
import { ProgressBar } from './components/splash/progress-bar'

type UpdaterPhase =
  | 'checking'
  | 'available'
  | 'not-available'
  | 'downloading'
  | 'downloaded'
  | 'error'

type UpdaterApi = {
  on: (channel: string, cb: (payload?: unknown) => void) => () => void
}

declare global {
  interface Window {
    updater?: UpdaterApi
  }
}

function cleanVersion(raw?: string): string {
  if (!raw) return ''
  const dash = raw.indexOf('-')
  return dash === -1 ? raw : raw.slice(0, dash)
}

function statusLabel(phase: UpdaterPhase, version: string): string {
  switch (phase) {
    case 'checking':
      return 'Checking for updates'
    case 'available':
      return version ? `Update available, v${version}` : 'Update available'
    case 'not-available':
      return 'Starting Vesper'
    case 'downloading':
      return 'Downloading update'
    case 'downloaded':
      return 'Installing update'
    case 'error':
      return 'Continuing'
  }
}

// Which mascot mood each updater phase maps to. Checking and the two "nothing to do" outcomes
// are the daydream; anything with a download in flight is the ring; downloaded is the pop.
function moodFor(phase: UpdaterPhase): DropMood {
  switch (phase) {
    case 'available':
    case 'downloading':
      return 'waiting'
    case 'downloaded':
      return 'happy'
    default:
      return 'idle'
  }
}

// Browser preview only: with no preload bridge, `?simulate` plays the same cycle the main
// process uses for `--splash-only`, so the splash can be worked on in a plain tab.
function simulate(on: (channel: string, payload?: unknown) => void): () => void {
  let timer = 0
  const start = Date.now()
  // `?simulate&hold=<ms>` freezes the cycle at that point, for screenshots.
  const hold = Number(new URLSearchParams(location.search).get('hold'))
  const step = (): void => {
    const t = hold > 0 ? hold : (Date.now() - start) % 7200
    if (t < 600) on('updater:checking')
    else if (t < 1200) on('updater:available', { version: '0.5.7' })
    else if (t < 5200) on('updater:progress', { percent: ((t - 1200) / 4000) * 100 })
    else if (t < 6400) on('updater:downloaded', { version: '0.5.7' })
    else on('updater:checking')
    timer = window.setTimeout(step, 80)
  }
  step()
  return () => clearTimeout(timer)
}

function SplashApp(): React.JSX.Element {
  const [phase, setPhase] = useState<UpdaterPhase>('checking')
  const [version, setVersion] = useState('')
  const [percent, setPercent] = useState(0)

  useEffect(() => {
    const handlers: Record<string, (payload?: unknown) => void> = {
      'updater:checking': () => setPhase('checking'),
      'updater:available': (p) => {
        const v = (p as { version?: string } | undefined)?.version
        setVersion(cleanVersion(v))
        setPercent(0)
        setPhase('available')
      },
      'updater:not-available': () => setPhase('not-available'),
      'updater:progress': (p) => {
        const pct = (p as { percent?: number } | undefined)?.percent ?? 0
        setPercent(pct)
        setPhase('downloading')
      },
      'updater:downloaded': () => {
        setPercent(100)
        setPhase('downloaded')
      },
      'updater:error': () => setPhase('error')
    }
    const updater = window.updater
    if (!updater) {
      if (location.search.includes('simulate')) {
        return simulate((channel, payload) => handlers[channel]?.(payload))
      }
      return
    }
    const offs = Object.entries(handlers).map(([channel, cb]) => updater.on(channel, cb))
    return () => offs.forEach((off) => off())
  }, [])

  // The bar crawls while nothing is measurable and fills once a download reports progress.
  const measured = phase === 'downloading' || phase === 'downloaded'

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 8,
        boxSizing: 'border-box'
      }}
    >
      <div
        style={{
          width: '100%',
          height: '100%',
          background: '#201d1d',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: 14,
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.6)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 28,
          boxSizing: 'border-box',
          color: '#fdfcfc',
          fontFamily:
            '"Inter Variable", -apple-system, BlinkMacSystemFont, "SF Pro", "SF Pro Text", "Segoe UI Variable", "Segoe UI", system-ui, sans-serif',
          minHeight: 244
        }}
      >
        <DropMascot mood={moodFor(phase)} percent={measured ? percent : null} size={88} />
        <ProgressBar
          value={measured ? percent : null}
          label={statusLabel(phase, version)}
          pendingLabel="Working"
          completeLabel="Update ready"
          style={{ marginTop: 22, maxWidth: 260 }}
        />
      </div>
    </div>
  )
}

// Mount only once Inter is ready, so the text never paints in the fallback
// font and then reflows when the woff2 arrives.
const FONT_WAIT_MS = 500

void Promise.race([
  document.fonts.load('500 14px "Inter Variable"').catch(() => undefined),
  new Promise((resolve) => setTimeout(resolve, FONT_WAIT_MS))
]).then(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <SplashApp />
    </StrictMode>
  )
})
