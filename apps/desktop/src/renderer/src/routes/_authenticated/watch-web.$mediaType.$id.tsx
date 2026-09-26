import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import Hls from 'hls.js'
import { Popover } from '@base-ui/react/popover'
import { cn } from '@renderer/lib/cn'
import { squircleStyle } from '@renderer/components/ui/squircle-surface'
import { CheckIcon } from '@renderer/components/icons'
import {
  BackArrowIcon,
  BigPauseIcon,
  BigPlayIcon,
  ExitFullscreenIcon,
  FullscreenIcon,
  IconButton,
  SpinnerIcon,
  StreamsGlyph,
  VolumeFullIcon,
  VolumeHalfIcon,
  VolumeMuteIcon,
  VolumeSlider
} from '@renderer/components/player/hls-chrome'
import {
  sortWebStreams,
  useWebStreams,
  webQualityLabel,
  type WebStream
} from '@renderer/lib/web-sources'
import { useDiscordPresence } from '@renderer/hooks/use-discord-presence'
import { movieDetailsQuery, tvDetailsQuery } from '@renderer/lib/tmdb-queries'
import type { TmdbSeasonSummary } from '@renderer/lib/tmdb'
import { api } from '@convex/_generated/api'
import { useKeepAwake } from '@renderer/hooks/use-keep-awake'
import { SubtitleMenu } from '@renderer/components/player/subtitle-menu'
import { FlagTile } from '@renderer/components/player/flag-tile'
import { SubtitleOverlay, type SelectedSub } from '@renderer/components/player/subtitle-overlay'
import type { EmbeddedTrack } from '@renderer/lib/use-subtitle-tracks'
import { toIso1 } from '@renderer/lib/lang'
import {
  readSubtitleStyle,
  writeSubtitleStyle,
  type SubtitleStyle
} from '@renderer/lib/subtitle-prefs'
import { readOffset, writeOffset, type OffsetScope } from '@renderer/lib/subtitle-offset'
import { useQuery as useTanstackQuery } from '@tanstack/react-query'
import { useMutation } from 'convex/react'
import { ContextMenu } from '@base-ui/react/context-menu'
import { PlayerContextMenuPopup } from '@renderer/components/player/player-context-menu'
import { VideoAnime4k } from '@renderer/lib/player/anime4k-video'
import type { Anime4kPreset, Anime4kStatus } from '@renderer/lib/player/anime4k'
import {
  readAnime4kEnabled,
  readAnime4kPreset,
  writeAnime4kEnabled,
  writeAnime4kPreset
} from '@renderer/lib/player-prefs'

// Web sources play through hls.js + <video>, the same way fights do
// (ADR-0016): the custom engine has no manifest layer. Unlike fights these
// are finite, so the chrome carries a seek bar and position/duration flow to
// presence. Quality is whatever the picked row promised, locked to the top
// variant when the playlist is a master (ADR-0019).

type SearchParams = {
  streamId: string
  title: string
  episodeLabel?: string
  poster?: string
  imdbId?: string
  year?: number
  season?: number
  episode?: number
}

export const Route = createFileRoute('/_authenticated/watch-web/$mediaType/$id')({
  validateSearch: (search): SearchParams => {
    const s = search as Record<string, unknown>
    const num = (v: unknown): number | undefined =>
      typeof v === 'number' && Number.isFinite(v) ? v : undefined
    return {
      streamId: String(s.streamId ?? ''),
      title: String(s.title ?? ''),
      episodeLabel: s.episodeLabel ? String(s.episodeLabel) : undefined,
      poster: s.poster ? String(s.poster) : undefined,
      imdbId: s.imdbId ? String(s.imdbId) : undefined,
      year: num(s.year),
      season: num(s.season),
      episode: num(s.episode)
    }
  },
  component: WatchWebPage
})

const CHROME_HIDE_MS = 2500
// Same cadence the custom player writes at: often enough to resume where you were, rare enough
// that a two hour film is not a few thousand mutations.
const SAVE_THROTTLE_MS = 15000
const VOLUME_KEY = 'vesper.player.volume'
const SEEK_STEP_SEC = 10

type Phase = 'loading' | 'playing' | 'error'

function WatchWebPage(): React.JSX.Element {
  const search = Route.useSearch()
  const params = Route.useParams()
  const navigate = useNavigate()
  const mediaType = params.mediaType === 'movie' ? 'movie' : 'tv'
  const tmdbId = Number(params.id)

  const goBack = useCallback((): void => {
    void navigate({
      to: mediaType === 'movie' ? '/movie/$id' : '/tv/$id',
      params: { id: params.id }
    })
  }, [navigate, mediaType, params.id])

  // Same store the picker filled, so the list is already in hand on arrival.
  const web = useWebStreams({
    title: search.title,
    mediaType,
    tmdbId,
    imdbId: search.imdbId,
    year: search.year,
    season: search.season,
    episode: search.episode
  })
  const streams = useMemo(() => sortWebStreams(web.streams), [web.streams])

  const videoRef = useRef<HTMLVideoElement | null>(null)
  const upscaleCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const upscalerRef = useRef<VideoAnime4k | null>(null)
  const [upscaling, setUpscaling] = useState(false)
  const [anime4kValue, setAnime4kValue] = useState<Anime4kPreset | 'off'>(() =>
    readAnime4kEnabled() ? readAnime4kPreset() : 'off'
  )
  const [anime4kStatus, setAnime4kStatus] = useState<Anime4kStatus | null>(null)
  const [playbackSpeed, setPlaybackSpeed] = useState(1)
  const [ctxMenuOpen, setCtxMenuOpen] = useState(false)
  const upsertProgress = useMutation(api.playback.upsert)
  const lastSavedRef = useRef(0)
  // The search params carry a ready-made poster URL, but the row stores a TMDB path. These are
  // the same queries the title page ran, so they are usually served from cache.
  const movieDetails = useTanstackQuery({
    ...movieDetailsQuery(tmdbId),
    enabled: mediaType === 'movie' && Number.isFinite(tmdbId) && tmdbId > 0
  })
  const tvDetails = useTanstackQuery({
    ...tvDetailsQuery(tmdbId),
    enabled: mediaType === 'tv' && Number.isFinite(tmdbId) && tmdbId > 0
  })
  const hlsRef = useRef<Hls | null>(null)
  const attemptRef = useRef(0)
  const menuOpenRef = useRef(false)
  const recoveredRef = useRef(false)

  const [phase, setPhase] = useState<Phase>('loading')
  const [selectedId, setSelectedId] = useState<string>(search.streamId)
  const [switcherOpen, setSwitcherOpen] = useState(false)
  const [paused, setPaused] = useState(false)
  const [muted, setMuted] = useState(false)
  const [volume, setVolume] = useState(() => {
    const v = Number(localStorage.getItem(VOLUME_KEY))
    return Number.isFinite(v) && v > 0 && v <= 1 ? v : 1
  })
  const [timePos, setTimePos] = useState(0)
  const [duration, setDuration] = useState(0)
  const [buffered, setBuffered] = useState<Array<{ start: number; end: number }>>([])

  // Subtitles: online, local, and whatever files the row's site serves beside
  // its stream (anime sites do; the playlist itself carries none the app can
  // read). Style and sync are the same prefs the VOD player keeps, so a
  // viewer's setup carries across.
  const [selectedSub, setSelectedSub] = useState<SelectedSub>(null)
  const [subStyle, setSubStyle] = useState<SubtitleStyle>(() => readSubtitleStyle())
  const [subOffsetSec, setSubOffsetSec] = useState(0)
  const offsetWriteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    writeSubtitleStyle(subStyle)
  }, [subStyle])
  const offsetScope = useMemo<OffsetScope>(
    () => ({
      imdbId: search.imdbId ?? '',
      season: search.season,
      episode: search.episode,
      selected: selectedSub
    }),
    [search.imdbId, search.season, search.episode, selectedSub]
  )
  // A new track brings its own remembered sync; any pending write for the
  // old one is dropped rather than landing on the new key.
  const selectSub = useCallback(
    (sub: SelectedSub): void => {
      if (offsetWriteTimerRef.current) {
        clearTimeout(offsetWriteTimerRef.current)
        offsetWriteTimerRef.current = null
      }
      setSelectedSub(sub)
      setSubOffsetSec(
        readOffset({
          imdbId: search.imdbId ?? '',
          season: search.season,
          episode: search.episode,
          selected: sub
        })
      )
    },
    [search.imdbId, search.season, search.episode]
  )
  useEffect(() => {
    if (selectedSub?.source !== 'online') return
    if (offsetWriteTimerRef.current) clearTimeout(offsetWriteTimerRef.current)
    offsetWriteTimerRef.current = setTimeout(() => writeOffset(offsetScope, subOffsetSec), 400)
    return () => {
      if (offsetWriteTimerRef.current) {
        clearTimeout(offsetWriteTimerRef.current)
        offsetWriteTimerRef.current = null
      }
    }
  }, [subOffsetSec, offsetScope, selectedSub])

  // Picture-in-picture is the element's own here — a real <video> needs no
  // canvas capture bridge.
  const [pipActive, setPipActive] = useState(false)
  const togglePip = useCallback(async (): Promise<void> => {
    const video = videoRef.current
    if (!video) return
    try {
      if (document.pictureInPictureElement) await document.exitPictureInPicture()
      else if (document.pictureInPictureEnabled) await video.requestPictureInPicture()
    } catch (err) {
      console.error('picture-in-picture failed', err)
    }
  }, [])

  const selected = useMemo(
    () => streams.find((s) => s.id === selectedId) ?? null,
    [streams, selectedId]
  )

  const streamTracks = useMemo(() => (selected ? webTracks(selected) : []), [selected])

  // A stream's own tracks belong to it. When one starts, the same language on
  // it takes over from the last stream's; and until the viewer picks for
  // themselves, a Japanese-audio stream starts with its English track on, as
  // the site would.
  const selectedSubRef = useRef<SelectedSub>(null)
  useEffect(() => {
    selectedSubRef.current = selectedSub
  }, [selectedSub])
  const pickedSubRef = useRef(false)
  const pickSub = useCallback(
    (sub: SelectedSub): void => {
      pickedSubRef.current = true
      selectSub(sub)
    },
    [selectSub]
  )
  const adoptStreamTracks = useCallback(
    (stream: WebStream): void => {
      const tracks = webTracks(stream)
      const cur = selectedSubRef.current
      if (cur?.source === 'embedded' && cur.track.source === 'web') {
        const same = tracks.find((t) => t.lang === cur.track.lang)
        selectSub(same ? { source: 'embedded', track: same } : null)
        return
      }
      if (cur !== null || pickedSubRef.current || stream.lang !== 'ja') return
      const english = tracks.filter((t) => t.lang === 'en')
      const track = english.find((t) => stream.subtitles?.[t.index]?.default) ?? english[0]
      if (track) selectSub({ source: 'embedded', track })
    },
    [selectSub]
  )

  useEffect(() => {
    const video = videoRef.current
    const canvas = upscaleCanvasRef.current
    if (!video || !canvas) return
    const upscaler = new VideoAnime4k()
    upscalerRef.current = upscaler
    upscaler.onStatus = (status) => {
      setUpscaling(status.kind === 'active')
      setAnime4kStatus(status)
    }
    const sync = (): void => {
      const enabled = readAnime4kEnabled()
      const preset = readAnime4kPreset()
      setAnime4kValue(enabled ? preset : 'off')
      upscaler.setPref({ enabled, preset })
    }
    void upscaler.attach(video, canvas).then(sync)
    // A new stream means new dimensions, and the bypass rule is a function of them.
    video.addEventListener('loadedmetadata', sync)
    // Settings writes the pref from another surface; localStorage events carry the change.
    window.addEventListener('storage', sync)
    return () => {
      video.removeEventListener('loadedmetadata', sync)
      window.removeEventListener('storage', sync)
      upscaler.destroy()
      upscalerRef.current = null
      setUpscaling(false)
    }
  }, [])

  const destroyHls = useCallback((): void => {
    hlsRef.current?.destroy()
    hlsRef.current = null
  }, [])

  const startStream = useCallback(
    async (stream: WebStream, resumeSec: number): Promise<void> => {
      const attempt = ++attemptRef.current
      recoveredRef.current = false
      destroyHls()
      setPhase('loading')
      setSelectedId(stream.id)
      adoptStreamTracks(stream)
      const video = videoRef.current
      if (!video) return

      const fail = (): void => {
        if (attempt !== attemptRef.current) return
        destroyHls()
        setPhase('error')
        setSwitcherOpen(false)
        menuOpenRef.current = false
      }

      const hls = new Hls({ enableWorker: true })
      hlsRef.current = hls
      hls.on(Hls.Events.MANIFEST_PARSED, (_e, data) => {
        let top = 0
        for (let i = 0; i < data.levels.length; i++) {
          if ((data.levels[i].bitrate ?? 0) > (data.levels[top].bitrate ?? 0)) top = i
        }
        hls.currentLevel = top
        // A playlist carrying several audio tracks (a dual-audio release)
        // plays the one the row promised: Japanese for a sub, English for a dub.
        const audio = hls.audioTracks.findIndex((t) => toIso1(t.lang ?? '') === stream.lang)
        if (hls.audioTracks.length > 1 && audio !== -1) hls.audioTrack = audio
        if (resumeSec > 0) video.currentTime = resumeSec
        void video.play().catch(() => undefined)
        if (attempt === attemptRef.current) setPhase('playing')
      })
      hls.on(Hls.Events.ERROR, (_e, data) => {
        if (!data.fatal) return
        if (data.type === Hls.ErrorTypes.MEDIA_ERROR && !recoveredRef.current) {
          recoveredRef.current = true
          hls.recoverMediaError()
          return
        }
        fail()
      })
      hls.loadSource(stream.url)
      hls.attachMedia(video)
    },
    [destroyHls, adoptStreamTracks]
  )

  // Start the row the picker chose as soon as its server has answered. Only
  // once every server is in does a missing id (a stale deep link) fall back
  // to the best row.
  const startedRef = useRef(false)
  useEffect(() => {
    if (startedRef.current) return
    const first =
      streams.find((s) => s.id === search.streamId) ?? (web.done ? streams[0] : undefined)
    if (!first) return
    // Deferred a tick so the start happens outside the effect body itself; a
    // dev-mode double run cancels the first timer instead of starting twice.
    const id = setTimeout(() => {
      startedRef.current = true
      void startStream(first, 0)
    }, 0)
    return () => clearTimeout(id)
  }, [streams, web.done, search.streamId, startStream])

  const switchTo = useCallback(
    (stream: WebStream): void => {
      // A switch keeps the viewer's place — it's the same title on another server.
      void startStream(stream, videoRef.current?.currentTime ?? 0)
    },
    [startStream]
  )

  // Last episode of the last season, specials aside — what promotes a finished episode into a
  // finished series. See playback.upsert.
  const isSeriesFinale = useMemo(() => {
    if (mediaType !== 'tv') return false
    const numbered = (tvDetails.data?.seasons ?? []).filter(
      (s) => s.season_number > 0 && s.episode_count > 0
    )
    const last = numbered.reduce<TmdbSeasonSummary | null>(
      (best, s) => (!best || s.season_number > best.season_number ? s : best),
      null
    )
    if (!last) return false
    return search.season === last.season_number && search.episode === last.episode_count
  }, [mediaType, search.season, search.episode, tvDetails.data])

  /**
   * Reports where the viewer is, so web streams feed the same places the custom player does:
   * Continue Watching, the friends sidebar, profile recents, Trakt, and the watched list. Rows
   * are keyed by IMDb id, so a stream that arrived without one simply is not reported.
   */
  const saveProgress = useCallback(
    (overrideState?: 'playing' | 'paused' | 'idle'): void => {
      const video = videoRef.current
      if (!video || !search.imdbId || !duration) return
      void upsertProgress({
        imdbId: search.imdbId,
        mediaType,
        season: search.season,
        episode: search.episode,
        positionSec: Math.floor(video.currentTime),
        durationSec: Math.floor(duration),
        state: overrideState ?? (video.paused ? 'paused' : 'playing'),
        title: search.title,
        tmdbId,
        posterPath:
          (mediaType === 'movie' ? movieDetails.data?.poster_path : tvDetails.data?.poster_path) ??
          undefined,
        backdropPath:
          (mediaType === 'movie'
            ? movieDetails.data?.backdrop_path
            : tvDetails.data?.backdrop_path) ?? undefined,
        episodeLabel: search.episodeLabel,
        isSeriesFinale
      })
    },
    [
      upsertProgress,
      search.imdbId,
      search.season,
      search.episode,
      search.title,
      search.episodeLabel,
      mediaType,
      tmdbId,
      duration,
      movieDetails.data,
      tvDetails.data,
      isSeriesFinale
    ]
  )

  // Held in a ref so the unmount write below can stay a mount-once effect and still call the
  // current version. Updated in an effect rather than during render.
  const saveProgressRef = useRef(saveProgress)
  useEffect(() => {
    saveProgressRef.current = saveProgress
  }, [saveProgress])

  // Leaving the player is a stop, whether that was Back, a new episode, or closing the window.
  useEffect(() => {
    return () => saveProgressRef.current('idle')
  }, [])

  useEffect(() => {
    if (!duration || !timePos) return
    const now = Date.now()
    if (now - lastSavedRef.current < SAVE_THROTTLE_MS) return
    lastSavedRef.current = now
    saveProgress()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timePos, duration])

  // Play and pause are the transitions Trakt scrobbles on, so they are written immediately.
  useEffect(() => {
    if (!duration) return
    lastSavedRef.current = Date.now()
    saveProgress(paused ? 'paused' : 'playing')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paused])

  const handleSetAnime4k = useCallback((v: Anime4kPreset | 'off'): void => {
    setAnime4kValue(v)
    const enabled = v !== 'off'
    writeAnime4kEnabled(enabled)
    if (enabled) writeAnime4kPreset(v)
    const preset = enabled ? v : readAnime4kPreset()
    upscalerRef.current?.setPref({ enabled, preset })
  }, [])

  const handleSetSpeed = useCallback((speed: number): void => {
    setPlaybackSpeed(speed)
    const video = videoRef.current
    if (video) video.playbackRate = speed
  }, [])

  const handleReload = useCallback((): void => {
    if (selected) void startStream(selected, videoRef.current?.currentTime ?? 0)
  }, [selected, startStream])

  const noStreams = web.done && !web.error && streams.length === 0
  const listFailed = web.error

  // Teardown clears the started guard too: the start here is synchronous, so
  // a dev-mode double effect run would otherwise destroy the player and then
  // refuse to start it again.
  useEffect(
    () => () => {
      destroyHls()
      startedRef.current = false
    },
    [destroyHls]
  )

  // Video element state mirroring.
  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    const onPlay = (): void => setPaused(false)
    const onPause = (): void => setPaused(true)
    const onTime = (): void => setTimePos(video.currentTime)
    const onDuration = (): void => {
      setDuration(Number.isFinite(video.duration) ? video.duration : 0)
    }
    const onProgress = (): void => {
      const ranges: Array<{ start: number; end: number }> = []
      for (let i = 0; i < video.buffered.length; i++) {
        ranges.push({ start: video.buffered.start(i), end: video.buffered.end(i) })
      }
      setBuffered(ranges)
    }
    const onEnterPip = (): void => setPipActive(true)
    const onLeavePip = (): void => setPipActive(false)
    video.addEventListener('enterpictureinpicture', onEnterPip)
    video.addEventListener('leavepictureinpicture', onLeavePip)
    video.addEventListener('play', onPlay)
    video.addEventListener('pause', onPause)
    video.addEventListener('timeupdate', onTime)
    video.addEventListener('durationchange', onDuration)
    video.addEventListener('progress', onProgress)
    return () => {
      video.removeEventListener('enterpictureinpicture', onEnterPip)
      video.removeEventListener('leavepictureinpicture', onLeavePip)
      video.removeEventListener('play', onPlay)
      video.removeEventListener('pause', onPause)
      video.removeEventListener('timeupdate', onTime)
      video.removeEventListener('durationchange', onDuration)
      video.removeEventListener('progress', onProgress)
    }
  }, [])
  useEffect(() => {
    const video = videoRef.current
    if (video) {
      video.volume = volume
      video.muted = muted
    }
  }, [volume, muted])

  const togglePause = useCallback((): void => {
    const video = videoRef.current
    if (!video) return
    if (video.paused) void video.play().catch(() => undefined)
    else video.pause()
  }, [])

  const seekTo = useCallback((sec: number): void => {
    const video = videoRef.current
    if (!video) return
    const d = Number.isFinite(video.duration) ? video.duration : 0
    video.currentTime = Math.max(0, d > 0 ? Math.min(d, sec) : sec)
    setTimePos(video.currentTime)
  }, [])

  const handleVolume = useCallback((v: number): void => {
    setVolume(v)
    setMuted(v === 0)
    localStorage.setItem(VOLUME_KEY, String(v))
  }, [])

  // Fullscreen tracks the OS window, same as the VOD player.
  const [isFullscreen, setIsFullscreen] = useState(false)
  useEffect(() => {
    void window.api.window.isFullScreen().then(setIsFullscreen)
    return window.api.window.onFullScreenChange(setIsFullscreen)
  }, [])
  const toggleFullscreen = useCallback((): void => {
    void window.api.window.setFullScreen(!isFullscreen)
  }, [isFullscreen])

  // Chrome auto-hide.
  const [chromeVisible, setChromeVisible] = useState(true)
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const scheduleHide = useCallback((): void => {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
    hideTimerRef.current = setTimeout(() => {
      if (!menuOpenRef.current) setChromeVisible(false)
    }, CHROME_HIDE_MS)
  }, [])
  const poke = useCallback((): void => {
    setChromeVisible(true)
    scheduleHide()
  }, [scheduleHide])
  useEffect(() => {
    scheduleHide()
    return () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
    }
  }, [scheduleHide])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === ' ') {
        e.preventDefault()
        togglePause()
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        seekTo((videoRef.current?.currentTime ?? 0) + SEEK_STEP_SEC)
        poke()
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        seekTo((videoRef.current?.currentTime ?? 0) - SEEK_STEP_SEC)
        poke()
      } else if (e.key === 'f' || e.key === 'F') toggleFullscreen()
      else if (e.key === 'm' || e.key === 'M') setMuted((m) => !m)
      else if (e.key === 'Escape' && !isFullscreen) goBack()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [togglePause, seekTo, poke, toggleFullscreen, isFullscreen, goBack])

  const playing = phase === 'playing' && !paused
  useKeepAwake(playing)
  useDiscordPresence({
    title: search.title,
    poster: search.poster,
    season: search.season,
    episode: search.episode,
    epTitle: search.episodeLabel?.split(' · ')[1] ?? null,
    currentTime: timePos,
    duration,
    playing
  })

  const showChrome = chromeVisible || phase !== 'playing'
  const subtitle = [
    search.episodeLabel,
    selected ? `${selected.server} · ${selected.quality}` : null
  ]
    .filter(Boolean)
    .join('  ·  ')
  const remaining = Math.max(0, duration - timePos)

  return (
    <ContextMenu.Root open={ctxMenuOpen} onOpenChange={setCtxMenuOpen}>
      <ContextMenu.Trigger
        render={
          <div
            className={cn(
              'fixed inset-0 z-50 flex flex-col bg-black',
              !showChrome && 'cursor-none'
            )}
          />
        }
        onMouseMove={poke}
        onClick={poke}
      >
        <div className="app-drag pointer-events-auto absolute inset-x-0 top-0 z-40 h-12" />
        {/* The element keeps playing and keeps the audio; while Anime4K is running the canvas over
          it is what you actually watch. Hidden rather than unmounted, since it is still the
          source of every frame. */}
        <video
          ref={videoRef}
          className={cn('absolute inset-0 h-full w-full object-contain', upscaling && 'invisible')}
          onClick={(e) => {
            e.stopPropagation()
            togglePause()
            poke()
          }}
        />
        <canvas
          ref={upscaleCanvasRef}
          aria-hidden
          className={cn(
            'pointer-events-none absolute inset-0 h-full w-full object-contain',
            !upscaling && 'invisible'
          )}
        />

        <SubtitleOverlay
          getCurrentTime={() => videoRef.current?.currentTime ?? 0}
          selected={selectedSub}
          style={subStyle}
          bottomGap={showChrome ? 10 : 0}
          offsetSec={subOffsetSec}
        />

        {phase === 'loading' && !noStreams && !listFailed ? (
          <LoadingOverlay poster={search.poster} />
        ) : null}
        {phase === 'error' || noStreams || listFailed ? (
          <ErrorOverlay
            streams={streams}
            selectedId={selectedId}
            listFailed={listFailed}
            onPick={switchTo}
            onBack={goBack}
          />
        ) : null}

        <div
          className={cn(
            'pointer-events-none absolute inset-0 z-30 transition-opacity duration-200',
            showChrome ? 'opacity-100' : 'opacity-0 [&_*]:!pointer-events-none'
          )}
        >
          <div
            className="pointer-events-none absolute inset-x-0 top-0 h-[140px]"
            style={{
              backgroundImage:
                'linear-gradient(180deg, oklab(0% 0 0 / 70%) 0%, oklab(0% 0 0 / 0%) 100%)'
            }}
          />
          <div className="pointer-events-auto absolute inset-x-8 top-12 flex items-center gap-[18px]">
            <button
              type="button"
              onClick={goBack}
              aria-label="Back"
              className="flex size-11 shrink-0 items-center justify-center rounded-full text-white outline-none"
            >
              <BackArrowIcon />
            </button>
            <div className="flex min-w-0 flex-col gap-[3px]">
              <h1 className="truncate text-[18px] leading-[22px] font-bold tracking-[-0.01em] text-white">
                {search.title}
              </h1>
              {subtitle ? (
                <span className="truncate text-[11px] leading-[14px] font-medium tracking-[0.12em] text-white/55 uppercase">
                  {subtitle}
                </span>
              ) : null}
            </div>
          </div>

          <div
            className="pointer-events-none absolute inset-x-0 bottom-0 h-[200px]"
            style={{
              backgroundImage:
                'linear-gradient(0deg, oklab(0% 0 0 / 85%) 0%, oklab(0% 0 0 / 0%) 100%)'
            }}
          />
          <div className="pointer-events-auto absolute inset-x-8 bottom-4 flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <span className="w-14 shrink-0 text-right text-[12px] leading-4 font-medium text-white/80 tabular-nums">
                {formatTime(timePos)}
              </span>
              <ProgressBar
                value={timePos}
                duration={duration}
                buffered={buffered}
                onSeek={seekTo}
              />
              <span className="w-14 shrink-0 text-[12px] leading-4 font-medium text-white/80 tabular-nums">
                -{formatTime(remaining)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={togglePause}
                aria-label={paused ? 'Play' : 'Pause'}
                className="flex size-12 items-center justify-center text-white outline-none"
              >
                <span className="t-icon-swap" data-state={paused ? 'a' : 'b'}>
                  <span className="t-icon inline-flex" data-icon="a" aria-hidden={!paused}>
                    <BigPlayIcon />
                  </span>
                  <span className="t-icon inline-flex" data-icon="b" aria-hidden={paused}>
                    <BigPauseIcon />
                  </span>
                </span>
              </button>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 pr-1.5">
                  <IconButton
                    aria-label={muted || volume === 0 ? 'Unmute' : 'Mute'}
                    onClick={() => setMuted((m) => !m)}
                  >
                    {muted || volume === 0 ? (
                      <VolumeMuteIcon />
                    ) : volume < 0.5 ? (
                      <VolumeHalfIcon />
                    ) : (
                      <VolumeFullIcon />
                    )}
                  </IconButton>
                  <VolumeSlider value={muted ? 0 : volume} onChange={handleVolume} />
                </div>
                {search.imdbId || streamTracks.length > 0 ? (
                  <SubtitleMenu
                    embedded={streamTracks}
                    selected={selectedSub}
                    onSelect={pickSub}
                    style={subStyle}
                    onStyleChange={setSubStyle}
                    imdbId={search.imdbId ?? ''}
                    mediaType={mediaType}
                    season={search.season}
                    episode={search.episode}
                    hashSettled
                    onOpenChange={(open) => {
                      menuOpenRef.current = open
                      if (!open) poke()
                    }}
                    offsetSec={subOffsetSec}
                    onOffsetChange={setSubOffsetSec}
                  />
                ) : null}
                <IconButton
                  aria-label={pipActive ? 'Exit picture in picture' : 'Picture in picture'}
                  onClick={() => void togglePip()}
                >
                  <PipIcon />
                </IconButton>
                <StreamSwitcher
                  streams={streams}
                  selectedId={selectedId}
                  open={switcherOpen}
                  onOpenChange={(open) => {
                    setSwitcherOpen(open)
                    menuOpenRef.current = open
                    if (!open) poke()
                  }}
                  onPick={(s) => {
                    setSwitcherOpen(false)
                    menuOpenRef.current = false
                    switchTo(s)
                  }}
                />
                <IconButton
                  aria-label={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
                  onClick={toggleFullscreen}
                >
                  {isFullscreen ? <ExitFullscreenIcon /> : <FullscreenIcon />}
                </IconButton>
              </div>
            </div>
          </div>
        </div>
      </ContextMenu.Trigger>
      <PlayerContextMenuPopup
        playbackSpeed={playbackSpeed}
        onSetSpeed={handleSetSpeed}
        anime4kValue={anime4kValue}
        anime4kStatus={anime4kStatus}
        onSetAnime4k={handleSetAnime4k}
        onReload={handleReload}
      />
    </ContextMenu.Root>
  )
}

function ProgressBar({
  value,
  duration,
  buffered,
  onSeek
}: {
  value: number
  duration: number
  buffered: Array<{ start: number; end: number }>
  onSeek: (sec: number) => void
}): React.JSX.Element {
  const trackRef = useRef<HTMLDivElement | null>(null)
  const [dragging, setDragging] = useState(false)
  const [dragPct, setDragPct] = useState(0)
  const [hoverPct, setHoverPct] = useState<number | null>(null)
  const pct = dragging ? dragPct : duration > 0 ? (value / duration) * 100 : 0
  const tipPct = dragging ? dragPct : hoverPct
  const tipVisible = tipPct !== null && duration > 0

  // Buffered ahead of the playhead, merged across adjoining ranges.
  let aheadEnd = value
  if (duration > 0) {
    let changed = true
    while (changed) {
      changed = false
      for (const r of buffered) {
        if (r.start <= aheadEnd + 0.5 && r.end > aheadEnd) {
          aheadEnd = r.end
          changed = true
        }
      }
    }
  }
  const bufferedPct = duration > 0 ? (aheadEnd / duration) * 100 : 0

  const ratioFrom = (e: React.MouseEvent | MouseEvent): number => {
    const rect = trackRef.current?.getBoundingClientRect()
    if (!rect) return 0
    return Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
  }

  const onPointerDown = (e: React.MouseEvent<HTMLDivElement>): void => {
    e.stopPropagation()
    setDragging(true)
    const r = ratioFrom(e)
    setDragPct(r * 100)
    setHoverPct(r * 100)
    document.body.style.cursor = 'grabbing'
    const onMove = (ev: MouseEvent): void => {
      const rr = ratioFrom(ev)
      setDragPct(rr * 100)
      setHoverPct(rr * 100)
    }
    const onUp = (ev: MouseEvent): void => {
      onSeek(ratioFrom(ev) * duration)
      setDragging(false)
      document.body.style.cursor = ''
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  return (
    <div
      className="group/progress relative h-3 grow"
      onMouseMove={(e) => setHoverPct(ratioFrom(e) * 100)}
      onMouseLeave={() => setHoverPct(null)}
    >
      <div
        ref={trackRef}
        onMouseDown={onPointerDown}
        className="absolute inset-0 overflow-hidden rounded-full bg-white/16"
      >
        <div
          className="pointer-events-none absolute inset-y-0 left-0 bg-white/20"
          style={{ width: `${bufferedPct}%` }}
        />
        <div
          className="pointer-events-none absolute inset-y-0 left-0 bg-white"
          style={{ width: `${pct}%` }}
        />
      </div>
      {tipVisible ? (
        <div
          className="pointer-events-none absolute -top-8 -translate-x-1/2 rounded-md bg-black/80 px-1.5 py-0.5 text-[11px] leading-[14px] font-medium text-white tabular-nums"
          style={{ left: `${tipPct}%` }}
        >
          {formatTime(((tipPct ?? 0) / 100) * duration)}
        </div>
      ) : null}
    </div>
  )
}

/** The subtitle files a row's site serves, as tracks the menu lists under the stream. */
function webTracks(stream: WebStream): EmbeddedTrack[] {
  return (stream.subtitles ?? []).map((s, i) => ({
    id: `web:${i}`,
    lang: s.lang,
    label: s.label,
    source: 'web',
    index: i,
    url: s.url
  }))
}

function LoadingOverlay({ poster }: { poster?: string }): React.JSX.Element {
  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-black">
      {poster ? (
        <img
          src={poster}
          alt=""
          className="absolute inset-0 h-full w-full object-cover opacity-25 blur-sm"
        />
      ) : null}
      <div className="relative flex flex-col items-center gap-3">
        <SpinnerIcon />
        <span className="text-[13px] leading-4 font-medium text-white/70">Finding the stream</span>
      </div>
    </div>
  )
}

function ErrorOverlay({
  streams,
  selectedId,
  listFailed,
  onPick,
  onBack
}: {
  streams: WebStream[]
  selectedId: string
  listFailed: boolean
  onPick: (s: WebStream) => void
  onBack: () => void
}): React.JSX.Element {
  const others = streams.filter((s) => s.id !== selectedId)
  const heading = listFailed
    ? "Web sources didn't answer"
    : streams.length === 0
      ? 'No web source carries this one'
      : "That source didn't play"
  const body = listFailed
    ? 'The source list could not be fetched. Go back and try again in a moment.'
    : streams.length === 0
      ? 'None of the web servers have this title right now.'
      : others.length > 0
        ? 'Pick another source to keep watching.'
        : 'No other web sources are up for this title.'
  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/90">
      <div
        className="flex w-[420px] flex-col gap-4 p-6"
        style={{ backgroundColor: '#141414', ...squircleStyle('frame-sm') }}
      >
        <div className="flex flex-col gap-1">
          <span className="text-[16px] leading-5 font-bold text-white">{heading}</span>
          <span className="text-[13px] leading-4 text-white/60">{body}</span>
        </div>
        {others.length > 0 ? (
          <div className="flex max-h-[280px] flex-col gap-0.5 overflow-y-auto">
            {others.map((s) => (
              <StreamRow key={s.id} stream={s} active={false} onClick={() => onPick(s)} />
            ))}
          </div>
        ) : null}
        <button
          type="button"
          onClick={onBack}
          className="self-start rounded-full bg-white/10 px-4 py-2 text-[13px] leading-4 font-medium text-white outline-none"
        >
          Back
        </button>
      </div>
    </div>
  )
}

function StreamSwitcher({
  streams,
  selectedId,
  open,
  onOpenChange,
  onPick
}: {
  streams: WebStream[]
  selectedId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onPick: (s: WebStream) => void
}): React.JSX.Element {
  return (
    <Popover.Root open={open} onOpenChange={onOpenChange}>
      <Popover.Trigger
        aria-label="Switch source"
        className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-transparent text-text-tertiary outline-none active:opacity-70"
      >
        <StreamsGlyph />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner side="top" sideOffset={42} align="center" className="z-[100]">
          <Popover.Popup
            className="w-[360px] overflow-hidden p-2 backdrop-blur-2xl"
            style={{ backgroundColor: '#141414EB', ...squircleStyle('frame-sm') }}
          >
            <div className="px-3 pt-2 pb-1">
              <span className="text-[11px] leading-[14px] font-bold tracking-[0.08em] text-white/50 uppercase">
                Web sources
              </span>
            </div>
            <div className="flex max-h-[360px] flex-col gap-0.5 overflow-y-auto">
              {streams.map((s) => (
                <StreamRow
                  key={s.id}
                  stream={s}
                  active={s.id === selectedId}
                  onClick={() => onPick(s)}
                />
              ))}
            </div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  )
}

function StreamRow({
  stream,
  active,
  onClick
}: {
  stream: WebStream
  active: boolean
  onClick: () => void
}): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full shrink-0 items-center gap-3 overflow-hidden rounded-lg px-3 text-left outline-none',
        active ? 'bg-white/[0.08]' : 'bg-transparent'
      )}
      style={{ height: 44 }}
    >
      <FlagTile lang={stream.lang} />
      <span
        className={cn(
          'min-w-0 flex-1 truncate text-[13px] leading-4 text-white',
          active ? 'font-bold' : 'font-medium'
        )}
      >
        {stream.server}
      </span>
      {active ? (
        <CheckIcon className="size-3.5 shrink-0 text-white" />
      ) : (
        <span className="rounded-sm bg-white/12 px-1.5 py-0.5 text-[10px] leading-3 font-bold text-white/80">
          {webQualityLabel(stream.quality)}
        </span>
      )}
    </button>
  )
}

function PipIcon(): React.JSX.Element {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden>
      <path d="M3.5 6.75C3.5 6.05 4.05 5.5 4.75 5.5H17.25C17.94 5.5 18.5 6.05 18.5 6.75V11.25C18.5 11.66 18.83 12 19.25 12C19.66 12 20 11.66 20 11.25V6.75C20 5.23 18.76 4 17.25 4H4.75C3.23 4 2 5.23 2 6.75V15.25C2 16.76 3.23 18 4.75 18H9.25C9.66 18 10 17.66 10 17.25C10 16.83 9.66 16.5 9.25 16.5H4.75C4.05 16.5 3.5 15.94 3.5 15.25V6.75Z" />
      <path d="M14.25 14C13.00 14 12 15.00 12 16.25V18.75C12 19.99 13.00 21 14.25 21H19.75C20.99 21 22 19.99 22 18.75V16.25C22 15.00 20.99 14 19.75 14H14.25Z" />
    </svg>
  )
}

function formatTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) sec = 0
  const s = Math.floor(sec)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const r = s % 60
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m)
  return `${h > 0 ? `${h}:` : ''}${mm}:${String(r).padStart(2, '0')}`
}
