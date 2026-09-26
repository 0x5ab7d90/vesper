import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { cn } from '@renderer/lib/cn'
import {
  fetchAndParseSubtitle,
  findActiveCue,
  stripSubtitleTags,
  type SubtitleCue
} from '@renderer/lib/subtitles'
import {
  FONT_FAMILY_CSS,
  colorWithOpacity,
  edgeShadowFor,
  type SubtitleStyle
} from '@renderer/lib/subtitle-prefs'
import type { EmbeddedTrack } from '@renderer/lib/use-subtitle-tracks'

export type SelectedSub =
  | { source: 'embedded'; track: EmbeddedTrack }
  | { source: 'online'; url: string; lang: string }
  | { source: 'local'; name: string; cues: SubtitleCue[] }
  | null

type EngineCue = { start: number; end: number; text: string }

interface Props {
  getCurrentTime: () => number
  selected: SelectedSub
  style: SubtitleStyle
  bottomGap: number
  offsetSec?: number
  getEmbeddedCues?: (id: string, fromSec?: number) => AsyncIterable<EngineCue>
  embeddedLoadFromSec?: number
}

export function SubtitleOverlay({
  getCurrentTime,
  selected,
  style,
  bottomGap,
  offsetSec = 0,
  getEmbeddedCues,
  embeddedLoadFromSec = 0
}: Props): React.JSX.Element | null {
  if (!selected) return null
  if (selected.source === 'online') {
    return (
      <OnlineSubtitleOverlay
        getCurrentTime={getCurrentTime}
        url={selected.url}
        style={style}
        bottomGap={bottomGap}
        offsetSec={offsetSec}
      />
    )
  }
  if (selected.source === 'local') {
    return (
      <LocalSubtitleOverlay
        getCurrentTime={getCurrentTime}
        cues={selected.cues}
        style={style}
        bottomGap={bottomGap}
        offsetSec={offsetSec}
      />
    )
  }
  // A web source's own track is a file like any online one, only listed as the stream's.
  if (selected.source === 'embedded' && selected.track.url) {
    return (
      <OnlineSubtitleOverlay
        getCurrentTime={getCurrentTime}
        url={selected.track.url}
        style={style}
        bottomGap={bottomGap}
        offsetSec={offsetSec}
      />
    )
  }
  if (selected.source === 'embedded' && getEmbeddedCues) {
    return (
      <EmbeddedSubtitleOverlay
        key={selected.track.id}
        getCurrentTime={getCurrentTime}
        trackId={selected.track.id}
        loadFromSec={embeddedLoadFromSec}
        getCues={getEmbeddedCues}
        style={style}
        bottomGap={bottomGap}
        offsetSec={offsetSec}
      />
    )
  }
  return null
}

function EmbeddedSubtitleOverlay({
  getCurrentTime,
  trackId,
  loadFromSec,
  getCues,
  style,
  bottomGap,
  offsetSec
}: {
  getCurrentTime: () => number
  trackId: string
  loadFromSec: number
  getCues: (id: string, fromSec?: number) => AsyncIterable<EngineCue>
  style: SubtitleStyle
  bottomGap: number
  offsetSec: number
}): React.JSX.Element | null {
  // Reading a subtitle track scans the container, so we read forward from the playhead (fast via
  // a timestamp seek) instead of from t=0. Each seek re-streams from the new spot; cues merge into
  // one set keyed by start time so jumping around accumulates coverage. Resets per track (keyed).
  const byStart = useRef(new Map<number, SubtitleCue>())
  const [cues, setCues] = useState<SubtitleCue[]>([])
  useEffect(() => {
    let cancelled = false
    let flushQueued = false
    const flush = (): void => {
      flushQueued = false
      if (!cancelled) {
        setCues([...byStart.current.values()].sort((a, b) => a.startSec - b.startSec))
      }
    }
    void (async () => {
      try {
        for await (const c of getCues(trackId, Math.max(0, loadFromSec - 1))) {
          if (cancelled) break
          if (!byStart.current.has(c.start)) {
            byStart.current.set(c.start, { startSec: c.start, endSec: c.end, text: c.text })
            if (!flushQueued) {
              flushQueued = true
              setTimeout(flush, 300)
            }
          }
        }
      } catch (e) {
        if (!cancelled) console.warn('[subtitles] cue stream failed', e)
      }
      flush()
    })()
    return () => {
      cancelled = true
    }
  }, [trackId, loadFromSec, getCues])
  const text = useActiveCueText(getCurrentTime, cues.length ? cues : null, offsetSec)
  if (!text) return null
  return <CueBox text={text} style={style} bottomGap={bottomGap} />
}

function OnlineSubtitleOverlay({
  getCurrentTime,
  url,
  style,
  bottomGap,
  offsetSec
}: {
  getCurrentTime: () => number
  url: string
  style: SubtitleStyle
  bottomGap: number
  offsetSec: number
}): React.JSX.Element | null {
  const { data: cues } = useQuery({
    queryKey: ['sub-cues', url],
    queryFn: () => fetchAndParseSubtitle(url),
    staleTime: 60 * 60_000
  })
  const text = useActiveCueText(getCurrentTime, cues ?? null, offsetSec)
  if (!text) return null
  return <CueBox text={text} style={style} bottomGap={bottomGap} />
}

function LocalSubtitleOverlay({
  getCurrentTime,
  cues,
  style,
  bottomGap,
  offsetSec
}: {
  getCurrentTime: () => number
  cues: SubtitleCue[]
  style: SubtitleStyle
  bottomGap: number
  offsetSec: number
}): React.JSX.Element | null {
  const text = useActiveCueText(getCurrentTime, cues.length ? cues : null, offsetSec)
  if (!text) return null
  return <CueBox text={text} style={style} bottomGap={bottomGap} />
}

function useActiveCueText(
  getCurrentTime: () => number,
  cues: SubtitleCue[] | null,
  offsetSec: number
): string {
  const [text, setText] = useState('')
  const lastIdRef = useRef<string>('')
  const offsetRef = useRef(offsetSec)
  offsetRef.current = offsetSec
  useEffect(() => {
    if (!cues) {
      setText('')
      return
    }
    let raf = 0
    const tick = (): void => {
      const cue = findActiveCue(cues, getCurrentTime() - offsetRef.current)
      const next = cue ? stripSubtitleTags(cue.text) : ''
      const id = cue ? `${cue.startSec}` : ''
      if (id !== lastIdRef.current) {
        lastIdRef.current = id
        setText(next)
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [getCurrentTime, cues])
  return text
}

function CueBox({
  text,
  style,
  bottomGap
}: {
  text: string
  style: SubtitleStyle
  bottomGap: number
}): React.JSX.Element {
  const bottom = bottomGap + (style.position / 100) * 60
  const baseFontPx = 22
  const fontSize = (style.fontSize / 100) * baseFontPx
  const textColor = colorWithOpacity(style.fontColor, style.fontOpacity)
  const bgColor = colorWithOpacity(style.bgColor, style.bgOpacity)
  const windowColor = colorWithOpacity(style.windowColor, style.windowOpacity)
  const textShadow =
    style.edgeType === 'none'
      ? undefined
      : edgeShadowFor(style.edgeType, colorWithOpacity(style.edgeColor, 100))
  const fontFamily = FONT_FAMILY_CSS[style.fontFamily]
  const textTransform: React.CSSProperties['textTransform'] =
    style.fontFamily === 'smallCaps' ? 'uppercase' : undefined
  const fontVariant: React.CSSProperties['fontVariant'] =
    style.fontFamily === 'smallCaps' ? 'all-small-caps' : undefined

  return (
    <div
      className={cn('pointer-events-none absolute right-0 left-0 z-30 flex justify-center px-8')}
      style={{ bottom: `${bottom}%` }}
    >
      <div
        className="max-w-[80%] rounded-md"
        style={{
          backgroundColor: style.windowOpacity > 0 ? windowColor : undefined,
          padding: style.windowOpacity > 0 ? '6px 10px' : undefined
        }}
      >
        <div
          className="text-center font-semibold whitespace-pre-line"
          style={{
            color: textColor,
            backgroundColor: style.bgOpacity > 0 ? bgColor : undefined,
            padding: style.bgOpacity > 0 ? '2px 8px' : undefined,
            borderRadius: style.bgOpacity > 0 ? 4 : undefined,
            fontSize: `${fontSize}px`,
            lineHeight: 1.25,
            fontFamily,
            textShadow,
            textTransform,
            fontVariant
          }}
        >
          {text}
        </div>
      </div>
    </div>
  )
}
