import { useEffect, useState } from 'react'
import type Hls from 'hls.js'

export interface EmbeddedTrack {
  id: string
  lang: string
  label: string
  /** "web": a subtitle file a web source serves beside its stream, fetched from `url`. */
  source: 'video' | 'hls' | 'web'
  index: number
  url?: string
}

export function useSubtitleTracks(
  videoRef: React.RefObject<HTMLVideoElement | null>,
  hlsRef: React.RefObject<Hls | null>
): EmbeddedTrack[] {
  const [tracks, setTracks] = useState<EmbeddedTrack[]>([])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    const refresh = (): void => setTracks(collect(video, hlsRef.current))
    refresh()

    const tt = video.textTracks
    tt.addEventListener('addtrack', refresh)
    tt.addEventListener('removetrack', refresh)
    tt.addEventListener('change', refresh)

    const hls = hlsRef.current
    const HLS_EVENTS = ['hlsSubtitleTracksUpdated', 'hlsSubtitleTrackLoaded']
    HLS_EVENTS.forEach((e) => hls?.on(e as Parameters<typeof hls.on>[0], refresh))

    const iv = window.setInterval(refresh, 1000)
    return () => {
      tt.removeEventListener('addtrack', refresh)
      tt.removeEventListener('removetrack', refresh)
      tt.removeEventListener('change', refresh)
      HLS_EVENTS.forEach((e) => hls?.off(e as Parameters<typeof hls.off>[0], refresh))
      window.clearInterval(iv)
    }
  }, [videoRef, hlsRef])

  return tracks
}

function collect(video: HTMLVideoElement, hls: Hls | null): EmbeddedTrack[] {
  const out: EmbeddedTrack[] = []
  for (let i = 0; i < video.textTracks.length; i++) {
    const t = video.textTracks[i]
    if (t.kind !== 'subtitles' && t.kind !== 'captions') continue
    out.push({
      id: `video:${i}`,
      lang: (t.language || 'unknown').toLowerCase(),
      label: t.label || t.language || `Track ${i + 1}`,
      source: 'video',
      index: i
    })
  }
  if (hls) {
    hls.subtitleTracks.forEach((t, i) => {
      out.push({
        id: `hls:${i}`,
        lang: (t.lang || 'unknown').toLowerCase(),
        label: t.name || t.lang || `Track ${i + 1}`,
        source: 'hls',
        index: i
      })
    })
  }
  const seen = new Set<string>()
  return out.filter((t) => {
    const k = `${t.source}:${t.label.toLowerCase()}:${t.lang}`
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
}
