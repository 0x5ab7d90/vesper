import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
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
  fetchAllFightStreams,
  fightMatchesQuery,
  fightPosterUrl,
  liveMatchesQuery,
  rankStreams,
  streamKey,
  type FightStream
} from '@renderer/lib/fights/api'
import { useLiveDiscordPresence } from '@renderer/hooks/use-discord-presence'
import { useKeepAwake } from '@renderer/hooks/use-keep-awake'

// Live fights play through hls.js + <video>, not the custom engine (ADR-0016):
// the engine has no manifest layer and its finite-duration chrome (seek bar,
// progress saving) has no meaning here. Quality is locked to the top variant —
// a struggling stream is escaped via the switcher, never by silent downgrade.

type SearchParams = {
  title: string
  poster?: string
}

export const Route = createFileRoute('/_authenticated/watch-fight/$id')({
  validateSearch: (search): SearchParams => {
    const s = search as Record<string, unknown>
    return {
      title: String(s.title ?? ''),
      poster: s.poster ? String(s.poster) : undefined
    }
  },
  component: WatchFightPage
})

const CHROME_HIDE_MS = 2500
const VOLUME_KEY = 'vesper.player.volume'
const MAX_AUTO_ATTEMPTS = 3

type Phase = 'loading' | 'playing' | 'error'

function WatchFightPage(): React.JSX.Element {
  const search = Route.useSearch()
  const params = Route.useParams()
  const navigate = useNavigate()
  const goBack = useCallback((): void => {
    void navigate({ to: '/' })
  }, [navigate])

  const matches = useQuery(fightMatchesQuery())
  const liveMatches = useQuery(liveMatchesQuery())
  // Deep links can point at any live event, not just listed fights — fall
  // back to the all-sports live list when the fight list doesn't know the id.
  const match = useMemo(
    () =>
      (matches.data ?? []).find((m) => m.id === params.id) ??
      (liveMatches.data ?? []).find((m) => m.id === params.id) ??
      null,
    [matches.data, liveMatches.data, params.id]
  )
  const streamsQuery = useQuery({
    queryKey: ['fights', 'all-streams', params.id],
    queryFn: () => fetchAllFightStreams(match!),
    enabled: !!match,
    staleTime: 60_000,
    refetchInterval: 120_000
  })
  const ranked = useMemo(() => rankStreams(streamsQuery.data ?? []), [streamsQuery.data])

  const videoRef = useRef<HTMLVideoElement | null>(null)
  const hlsRef = useRef<Hls | null>(null)
  const attemptRef = useRef(0)
  const menuOpenRef = useRef(false)
  const recoveredRef = useRef(false)

  const [phase, setPhase] = useState<Phase>('loading')
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [switcherOpen, setSwitcherOpen] = useState(false)
  const [paused, setPaused] = useState(false)
  const [muted, setMuted] = useState(false)
  const [volume, setVolume] = useState(() => {
    const v = Number(localStorage.getItem(VOLUME_KEY))
    return Number.isFinite(v) && v > 0 && v <= 1 ? v : 1
  })

  const selected = useMemo(
    () => ranked.find((s) => streamKey(s) === selectedKey) ?? null,
    [ranked, selectedKey]
  )

  const destroyHls = useCallback((): void => {
    hlsRef.current?.destroy()
    hlsRef.current = null
  }, [])

  // Auto-failover walks the ranking by calling back into startStream; the ref
  // breaks the self-reference.
  const startStreamRef = useRef<
    ((s: FightStream, autoIndex: number | null) => Promise<void>) | null
  >(null)

  const startStream = useCallback(
    async (stream: FightStream, autoIndex: number | null): Promise<void> => {
      const attempt = ++attemptRef.current
      recoveredRef.current = false
      destroyHls()
      setPhase('loading')
      setSelectedKey(streamKey(stream))

      const failOver = (): void => {
        if (attempt !== attemptRef.current) return
        destroyHls()
        // The first auto-pick walks down the ranking on its own; once the
        // viewer is involved, death surfaces the switcher instead.
        if (autoIndex !== null && autoIndex + 1 < Math.min(ranked.length, MAX_AUTO_ATTEMPTS)) {
          void startStreamRef.current?.(ranked[autoIndex + 1], autoIndex + 1)
          return
        }
        // The error overlay carries its own stream list — the popover
        // switcher closes so only one picker is on screen.
        setPhase('error')
        setSwitcherOpen(false)
        menuOpenRef.current = false
      }

      let playlistUrl: string
      try {
        playlistUrl = await window.api.embed.resolveStream(stream.embedUrl)
      } catch {
        failOver()
        return
      }
      if (attempt !== attemptRef.current) return
      const video = videoRef.current
      if (!video) return

      const hls = new Hls({ enableWorker: true })
      hlsRef.current = hls
      hls.on(Hls.Events.MANIFEST_PARSED, (_e, data) => {
        let top = 0
        for (let i = 0; i < data.levels.length; i++) {
          if ((data.levels[i].bitrate ?? 0) > (data.levels[top].bitrate ?? 0)) top = i
        }
        hls.currentLevel = top
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
        failOver()
      })
      hls.loadSource(playlistUrl)
      hls.attachMedia(video)
    },
    [destroyHls, ranked]
  )

  useEffect(() => {
    startStreamRef.current = startStream
  }, [startStream])

  // Auto-pick the best stream once the list arrives.
  const autoStartedRef = useRef(false)
  useEffect(() => {
    if (autoStartedRef.current || ranked.length === 0) return
    autoStartedRef.current = true
    void startStream(ranked[0], 0)
  }, [ranked, startStream])

  // Every source came back empty — derived, so no state juggling.
  const noStreams = streamsQuery.isSuccess && ranked.length === 0

  useEffect(() => destroyHls, [destroyHls])

  // Video element state mirroring.
  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    const onPlay = (): void => setPaused(false)
    const onPause = (): void => setPaused(true)
    video.addEventListener('play', onPlay)
    video.addEventListener('pause', onPause)
    return () => {
      video.removeEventListener('play', onPlay)
      video.removeEventListener('pause', onPause)
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

  const seekToLive = useCallback((): void => {
    const video = videoRef.current
    const hls = hlsRef.current
    if (!video || !hls) return
    const edge = hls.liveSyncPosition
    if (edge !== null && Number.isFinite(edge)) video.currentTime = edge
    void video.play().catch(() => undefined)
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
      } else if (e.key === 'f' || e.key === 'F') toggleFullscreen()
      else if (e.key === 'm' || e.key === 'M') setMuted((m) => !m)
      else if (e.key === 'Escape' && !isFullscreen) goBack()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [togglePause, toggleFullscreen, isFullscreen, goBack])

  // Deep links carry no search params — the match itself is the reliable
  // source for title and artwork.
  const title = search.title || (match?.title ?? '')
  const poster = search.poster ?? (match ? fightPosterUrl(match) : undefined)

  useKeepAwake(phase === 'playing' && !paused)
  useLiveDiscordPresence({
    title,
    poster,
    status: phase === 'playing' ? (paused ? 'paused' : 'live') : 'idle'
  })

  const showChrome = chromeVisible || phase !== 'playing'

  return (
    <div
      className={cn('fixed inset-0 z-50 flex flex-col bg-black', !showChrome && 'cursor-none')}
      onMouseMove={poke}
      onClick={poke}
    >
      <div className="app-drag pointer-events-auto absolute inset-x-0 top-0 z-40 h-12" />
      <video ref={videoRef} className="absolute inset-0 h-full w-full object-contain" />

      {phase === 'loading' && !noStreams ? <LoadingOverlay poster={poster} /> : null}
      {phase === 'error' || noStreams ? (
        <ErrorOverlay
          streams={ranked}
          selectedKey={selectedKey}
          onPick={(s) => void startStream(s, null)}
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
          <div className="flex flex-col gap-[3px]">
            <h1 className="text-[18px] leading-[22px] font-bold tracking-[-0.01em] text-white">
              {title}
            </h1>
            {selected ? (
              <span className="text-[11px] leading-[14px] font-medium tracking-[0.12em] text-white/55 uppercase">
                {selected.language}
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
        <div className="pointer-events-auto absolute inset-x-8 bottom-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
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
            <button
              type="button"
              onClick={seekToLive}
              aria-label="Jump to the live edge"
              className="flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-[11px] leading-[14px] font-bold tracking-[0.08em] text-white uppercase outline-none"
            >
              <span aria-hidden className="size-1.5 rounded-full bg-[#f43]" />
              Live
            </button>
          </div>
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
            <StreamSwitcher
              streams={ranked}
              selectedKey={selectedKey}
              open={switcherOpen}
              onOpenChange={(open) => {
                setSwitcherOpen(open)
                menuOpenRef.current = open
                if (!open) poke()
              }}
              onPick={(s) => {
                setSwitcherOpen(false)
                menuOpenRef.current = false
                void startStream(s, null)
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
  )
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
  selectedKey,
  onPick,
  onBack
}: {
  streams: FightStream[]
  selectedKey: string | null
  onPick: (s: FightStream) => void
  onBack: () => void
}): React.JSX.Element {
  const others = streams.filter((s) => streamKey(s) !== selectedKey)
  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/90">
      <div
        className="flex w-[420px] flex-col gap-4 p-6"
        style={{ backgroundColor: '#141414', ...squircleStyle('frame-sm') }}
      >
        <div className="flex flex-col gap-1">
          <span className="text-[16px] leading-5 font-bold text-white">
            {streams.length === 0 ? 'No streams yet' : 'The stream ended or died'}
          </span>
          <span className="text-[13px] leading-4 text-white/60">
            {streams.length === 0
              ? 'No source is carrying this fight right now. Try again closer to the start.'
              : others.length > 0
                ? 'Pick another stream to keep watching.'
                : 'No other streams are up for this fight.'}
          </span>
        </div>
        {others.length > 0 ? (
          <div className="flex max-h-[280px] flex-col gap-0.5 overflow-y-auto">
            {others.map((s) => (
              <StreamRow key={streamKey(s)} stream={s} active={false} onClick={() => onPick(s)} />
            ))}
          </div>
        ) : null}
        <button
          type="button"
          onClick={onBack}
          className="self-start rounded-full bg-white/10 px-4 py-2 text-[13px] leading-4 font-medium text-white outline-none"
        >
          Back to home
        </button>
      </div>
    </div>
  )
}

function StreamSwitcher({
  streams,
  selectedKey,
  open,
  onOpenChange,
  onPick
}: {
  streams: FightStream[]
  selectedKey: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onPick: (s: FightStream) => void
}): React.JSX.Element {
  return (
    <Popover.Root open={open} onOpenChange={onOpenChange}>
      <Popover.Trigger
        aria-label="Switch stream"
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
                Streams
              </span>
            </div>
            <div className="flex max-h-[360px] flex-col gap-0.5 overflow-y-auto">
              {streams.map((s) => (
                <StreamRow
                  key={streamKey(s)}
                  stream={s}
                  active={streamKey(s) === selectedKey}
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
  stream: FightStream
  active: boolean
  onClick: () => void
}): React.JSX.Element {
  const viewers =
    stream.viewers !== undefined ? `${stream.viewers.toLocaleString()} watching` : null
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
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span
          className={cn(
            'truncate text-[13px] leading-4 text-white',
            active ? 'font-bold' : 'font-medium'
          )}
        >
          {stream.language}
        </span>
        {viewers ? (
          <span className="truncate text-[10px] leading-3 font-medium text-white/50">
            {viewers}
          </span>
        ) : null}
      </div>
      {active ? (
        <CheckIcon className="size-3.5 shrink-0 text-white" />
      ) : stream.hd ? (
        <span className="rounded-sm bg-white/12 px-1.5 py-0.5 text-[10px] leading-3 font-bold text-white/80">
          HD
        </span>
      ) : null}
    </button>
  )
}
