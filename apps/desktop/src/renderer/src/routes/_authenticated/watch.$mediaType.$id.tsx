import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useMutation } from 'convex/react'
import { useQuery } from '@tanstack/react-query'
import { AnimatePresence, m as motion } from 'motion/react'
import { ContextMenu } from '@base-ui/react/context-menu'
import { fetchSubtitles } from '@renderer/lib/opensubs'
import { computeOsdbHash } from '@renderer/lib/osdb-hash'
import { cn } from '@renderer/lib/cn'
import { BufferOverlay } from '@renderer/components/player/buffer-overlay'
import { SubtitleMenu } from '@renderer/components/player/subtitle-menu'
import { SubtitleOverlay, type SelectedSub } from '@renderer/components/player/subtitle-overlay'
import { SubtitleOffsetHud } from '@renderer/components/player/subtitle-offset-hud'
import { PlayerContextMenuPopup } from '@renderer/components/player/player-context-menu'
import { StatsForNerds } from '@renderer/components/player/stats-for-nerds'
import { PlayerToast } from '@renderer/components/player/player-toast'
import { KeyboardShortcutsModal } from '@renderer/components/player/keyboard-shortcuts-modal'
import { SkipSegmentButton } from '@renderer/components/player/skip-segment-button'
import { PipPlaceholder } from '@renderer/components/player/pip-placeholder'
import {
  readPlaybackSpeed,
  writePlaybackSpeed,
  readSkipButtonsEnabled,
  readPipMinimizeEnabled,
  readAnime4kEnabled,
  writeAnime4kEnabled,
  readAnime4kPreset,
  writeAnime4kPreset
} from '@renderer/lib/player-prefs'
import { ANIME4K_PRESET_LABELS, type Anime4kPreset } from '@renderer/lib/player/anime4k'
import { isDetectedAnime } from '@renderer/lib/anime'
import {
  nextEpisodeCursor,
  previousEpisodeCursor,
  resolveEpisodeWatch,
  type EpisodeCursor
} from '@renderer/lib/play-episode'
import { segmentsQuery, type IntroDbSegment } from '@renderer/lib/introdb'
import {
  clampOffset,
  readOffset,
  writeOffset,
  type OffsetScope
} from '@renderer/lib/subtitle-offset'
import {
  fanartMovieQuery,
  fanartTvQuery,
  pickMovieHeroLogo,
  pickTvHeroLogo
} from '@renderer/lib/external-queries'
import type { FanartImage } from '@renderer/lib/fanart'
import { movieDetailsQuery, tvDetailsQuery, tvSeasonQuery } from '@renderer/lib/tmdb-queries'
import { useMediaSession } from '@renderer/lib/use-media-session'
import { tmdbImage } from '@renderer/lib/tmdb'
import type { TmdbSeasonSummary } from '@renderer/lib/tmdb'
import type { EmbeddedTrack } from '@renderer/lib/use-subtitle-tracks'
import type { AudioTrack } from '@renderer/lib/use-audio-tracks'
import { usePlayerEngine } from '@renderer/hooks/use-player-engine'
import { usePictureInPicture } from '@renderer/hooks/use-picture-in-picture'
import { AudioMenu } from '@renderer/components/player/audio-menu'
import { ExternalPlayerMenu } from '@renderer/components/player/external-player-menu'
import {
  normalizeLangCode,
  readAutoShow,
  readLastLang,
  readSubtitleStyle,
  writeSubtitleStyle,
  type SubtitleStyle
} from '@renderer/lib/subtitle-prefs'
import { readAudioPreferredLang, writeAudioLastLang } from '@renderer/lib/audio-prefs'
import { useDiscordPresence } from '@renderer/hooks/use-discord-presence'
import { useKeepAwake } from '@renderer/hooks/use-keep-awake'
import { api } from '@convex/_generated/api'

type SearchParams = {
  url: string
  title: string
  episodeLabel?: string
  imdbId: string
  mediaType: 'movie' | 'tv'
  season?: number
  episode?: number
  resumeSec?: number
  filename?: string
  bingeGroup?: string
}

export const Route = createFileRoute('/_authenticated/watch/$mediaType/$id')({
  validateSearch: (search): SearchParams => {
    const s = search as Record<string, unknown>
    return {
      url: String(s.url ?? ''),
      title: String(s.title ?? ''),
      episodeLabel: s.episodeLabel ? String(s.episodeLabel) : undefined,
      imdbId: String(s.imdbId ?? ''),
      mediaType: (s.mediaType === 'tv' ? 'tv' : 'movie') as 'movie' | 'tv',
      season: typeof s.season === 'number' ? s.season : undefined,
      episode: typeof s.episode === 'number' ? s.episode : undefined,
      resumeSec: typeof s.resumeSec === 'number' ? s.resumeSec : undefined,
      filename: s.filename ? String(s.filename) : undefined,
      bingeGroup: s.bingeGroup ? String(s.bingeGroup) : undefined
    }
  },
  component: WatchPage
})

const SAVE_THROTTLE_MS = 15000
const CHROME_HIDE_MS = 2500
const VOLUME_KEY = 'vesper.player.volume'

function WatchPage(): React.JSX.Element {
  const search = Route.useSearch()
  const params = Route.useParams()
  const navigate = useNavigate()
  const goBack = useCallback((): void => {
    void navigate({
      to: search.mediaType === 'movie' ? '/movie/$id' : '/tv/$id',
      params: { id: params.id }
    })
  }, [navigate, search.mediaType, params.id])
  const upsertProgress = useMutation(api.playback.upsert)
  const tmdbId = Number(params.id)

  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [muted, setMuted] = useState(false)
  const lastSavedRef = useRef(0)
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const menuOpenRef = useRef(0)

  const [chromeVisible, setChromeVisible] = useState(true)
  const [menuOpenCount, setMenuOpenCount] = useState(0)

  const handleMenuOpenChange = (open: boolean): void => {
    setMenuOpenCount((c) => {
      const next = Math.max(0, c + (open ? 1 : -1))
      menuOpenRef.current = next
      return next
    })
    if (!open && hideTimerRef.current) {
      clearTimeout(hideTimerRef.current)
      hideTimerRef.current = setTimeout(() => {
        if (menuOpenRef.current === 0) setChromeVisible(false)
      }, CHROME_HIDE_MS)
    }
  }
  const [volume, setVolume] = useState(() => {
    const v = parseFloat(localStorage.getItem(VOLUME_KEY) ?? '1')
    return Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 1
  })
  const [subSelection, setSubSelection] = useState<{ key: string; sub: SelectedSub }>({
    key: '',
    sub: null
  })
  const [subStyle, setSubStyle] = useState<SubtitleStyle>(() => readSubtitleStyle())
  const [subOffsetSec, setSubOffsetSec] = useState(0)
  const [hudVisible, setHudVisible] = useState(false)
  const hudTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const offsetWriteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [statsVisible, setStatsVisible] = useState(false)
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(() => readPlaybackSpeed())
  const [anime4kEnabled, setAnime4kEnabled] = useState(() => readAnime4kEnabled())
  const [anime4kPreset, setAnime4kPreset] = useState<Anime4kPreset>(() => readAnime4kPreset())
  // Explicit in-player Anime4K choice, keyed to the title so it clears on navigation to another
  // show without a reset effect — episodes of the same show keep it.
  const [anime4kChoice, setAnime4kChoice] = useState<{ key: number; on: boolean } | null>(null)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const [toastMessage, setToastMessage] = useState<string | null>(null)
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [reloadNonce, setReloadNonce] = useState(0)
  // Keyed to the stream it was captured on: a resume point from a reload must not follow the
  // viewer into the next episode when navigation swaps the url underneath.
  const reloadResumeRef = useRef<{ url: string; sec: number } | null>(null)
  // Where embedded subtitle loading should (re)start reading — updated on every seek.
  const [subReload, setSubReload] = useState<{ key: string; sec: number } | null>(null)
  const [screenshotting, setScreenshotting] = useState(false)
  const [ctxMenuOpen, setCtxMenuOpen] = useState(false)
  const [skipButtonsEnabled] = useState(() => readSkipButtonsEnabled())

  const episodeKey = `${search.imdbId}:${search.season}:${search.episode}`
  const playUrl = search.url

  // The player stays mounted across an episode change, so both of these are scoped to the episode
  // they were chosen for rather than cleared afterwards — last episode's subtitle has no business
  // carrying over into the next one, and neither does its read position.
  const selectedSub = subSelection.key === episodeKey ? subSelection.sub : null
  const setSelectedSub = useCallback(
    (sub: SelectedSub): void => setSubSelection({ key: episodeKey, sub }),
    [episodeKey]
  )
  const subReloadSec = subReload?.key === episodeKey ? subReload.sec : (search.resumeSec ?? 0)
  const setSubReloadSec = useCallback(
    (sec: number): void => setSubReload({ key: episodeKey, sec }),
    [episodeKey]
  )

  const engine = usePlayerEngine({
    url: playUrl,
    canvasRef,
    startSec:
      reloadResumeRef.current?.url === search.url
        ? reloadResumeRef.current.sec
        : (search.resumeSec ?? 0),
    reloadNonce
  })
  const { timePos, duration, paused, buffering } = engine
  const bufferedRanges = engine.buffered
  // Once a frame has rendered, buffering (seek/rebuffer) keeps the frozen frame visible with just
  // the logo overlay; only the cold start before the first frame shows the backdrop.
  const hasFrame = (engine.stats?.displayedFrames ?? 0) > 0

  const embeddedTracks = useMemo<EmbeddedTrack[]>(
    () =>
      engine.subtitleTracks.map((t, i) => ({
        id: t.id,
        lang: t.lang ?? 'und',
        label: t.label ?? t.lang ?? `Track ${i + 1}`,
        source: 'video' as const,
        index: i
      })),
    [engine.subtitleTracks]
  )

  const [selectedAudioId, setSelectedAudioId] = useState<string | null>(null)
  const audio = useMemo(() => {
    const tracks: AudioTrack[] = engine.audioTracks.map((t, i) => ({
      id: t.id,
      lang: t.lang ?? 'und',
      label: t.label ?? t.lang ?? `Audio ${i + 1}`,
      channels: t.channels ? `${t.channels}` : undefined,
      codec: t.codec,
      isDefault: !!t.isDefault,
      decodable: t.decodable,
      source: 'video' as const,
      index: i
    }))
    const selectedIndex = Math.max(
      0,
      tracks.findIndex((t) => t.id === selectedAudioId)
    )
    return {
      tracks,
      selectedIndex,
      setSelected: (id: string): void => {
        setSelectedAudioId(id)
        engine.selectAudio(id)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine.audioTracks, engine.selectAudio, selectedAudioId])

  // Also keyed to the url: every new stream builds a fresh controller that starts at full volume,
  // so an episode change would blast the next episode at 100% while the slider still shows what
  // the viewer set.
  useEffect(() => {
    engine.setVolume(volume)
    engine.setMuted(muted)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [volume, muted, reloadNonce, playUrl])
  const subAutoAppliedRef = useRef(false)
  const audioAutoAppliedRef = useRef(false)

  // Whether tracks have been auto-picked is decided once per stream; a new episode gets to decide
  // again, or a binge keeps the first episode's audio track and never auto-shows subtitles again.
  useEffect(() => {
    subAutoAppliedRef.current = false
    audioAutoAppliedRef.current = false
  }, [episodeKey])

  useEffect(() => {
    if (subAutoAppliedRef.current) return
    if (!readAutoShow()) return
    if (embeddedTracks.length === 0) return
    const pref = normalizeLangCode(readLastLang())
    if (!pref) return
    const match = embeddedTracks.find((t) => normalizeLangCode(t.lang) === pref)
    if (match) {
      setSelectedSub({ source: 'embedded', track: match })
      subAutoAppliedRef.current = true
    }
  }, [embeddedTracks])

  // OpenSubtitles file hash for this exact release, so the addon returns subtitles that already line
  // up. Two tiny range reads off the same CDN url the player streams. Settles to data or null; the
  // subtitle queries wait for it to settle, then fetch once (with the hash, or imdb-only if null).
  const osdbQuery = useQuery({
    queryKey: ['osdb', search.url],
    queryFn: () => computeOsdbHash(search.url),
    enabled: !!search.url,
    staleTime: Infinity,
    gcTime: 30 * 60_000,
    retry: false
  })
  const hashSettled = !search.url || osdbQuery.isFetched
  const videoHash = osdbQuery.data?.hash
  const videoSize = osdbQuery.data?.size

  const onlineFallbackQuery = useQuery({
    queryKey: [
      'opensubs',
      search.imdbId,
      search.mediaType,
      search.season,
      search.episode,
      videoHash ?? null,
      videoSize ?? null
    ],
    queryFn: () =>
      fetchSubtitles({
        type: search.mediaType === 'tv' ? 'series' : 'movie',
        imdbId: search.imdbId,
        season: search.season,
        episode: search.episode,
        videoHash,
        videoSize
      }),
    enabled:
      hashSettled &&
      readAutoShow() &&
      !subAutoAppliedRef.current &&
      embeddedTracks.length === 0 &&
      !!readLastLang() &&
      !!search.imdbId
  })

  useEffect(() => {
    if (subAutoAppliedRef.current) return
    if (!readAutoShow()) return
    if (embeddedTracks.length !== 0) return
    const pref = normalizeLangCode(readLastLang())
    if (!pref) return
    const subs = onlineFallbackQuery.data
    if (!subs || subs.length === 0) return
    const match = subs.find((s) => normalizeLangCode(s.lang) === pref)
    if (match) {
      setSelectedSub({ source: 'online', url: match.url, lang: match.lang })
      subAutoAppliedRef.current = true
    }
  }, [onlineFallbackQuery.data, embeddedTracks.length])

  useEffect(() => {
    if (audioAutoAppliedRef.current) return
    if (audio.tracks.length <= 1) return
    const pref = normalizeLangCode(readAudioPreferredLang())
    if (!pref) return
    // Language preference must never override decodability: the English track on a remux is
    // often TrueHD or DTS-HD, which WebCodecs cannot decode, and switching to it is silence.
    const match = audio.tracks.find((t) => t.decodable && normalizeLangCode(t.lang) === pref)
    if (match) {
      audio.setSelected(match.id)
      audioAutoAppliedRef.current = true
    }
  }, [audio])

  useEffect(() => {
    writeSubtitleStyle(subStyle)
  }, [subStyle])

  const offsetScope: OffsetScope = useMemo(
    () => ({
      imdbId: search.imdbId,
      season: search.season,
      episode: search.episode,
      selected: selectedSub
    }),
    [search.imdbId, search.season, search.episode, selectedSub]
  )

  useEffect(() => {
    if (offsetWriteTimerRef.current) {
      clearTimeout(offsetWriteTimerRef.current)
      offsetWriteTimerRef.current = null
    }
    setSubOffsetSec(readOffset(offsetScope))
  }, [offsetScope])

  useEffect(() => {
    if (selectedSub?.source !== 'online') return
    if (offsetWriteTimerRef.current) clearTimeout(offsetWriteTimerRef.current)
    offsetWriteTimerRef.current = setTimeout(() => {
      writeOffset(offsetScope, subOffsetSec)
    }, 400)
    return () => {
      if (offsetWriteTimerRef.current) {
        clearTimeout(offsetWriteTimerRef.current)
        offsetWriteTimerRef.current = null
      }
    }
  }, [subOffsetSec, offsetScope, selectedSub])

  const flashOffsetHud = (): void => {
    setHudVisible(true)
    if (hudTimerRef.current) clearTimeout(hudTimerRef.current)
    hudTimerRef.current = setTimeout(() => setHudVisible(false), 1200)
  }

  const nudgeOffset = (delta: number): void => {
    setSubOffsetSec((cur) => clampOffset(cur + delta))
    flashOffsetHud()
  }

  const handleOffsetChange = (sec: number): void => {
    setSubOffsetSec(clampOffset(sec))
  }

  useEffect(() => {
    return () => {
      if (hudTimerRef.current) clearTimeout(hudTimerRef.current)
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    }
  }, [])

  useEffect(() => {
    if (screenshotting) {
      document.body.classList.add('is-screenshotting')
      return () => document.body.classList.remove('is-screenshotting')
    }
    return
  }, [screenshotting])

  const flashToast = useCallback((msg: string): void => {
    setToastMessage(msg)
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    toastTimerRef.current = setTimeout(() => setToastMessage(null), 1400)
  }, [])

  const handleToggleStats = useCallback((): void => {
    setStatsVisible((v) => !v)
  }, [])

  const handleSetSpeed = useCallback((s: number): void => {
    setPlaybackSpeed(s)
    writePlaybackSpeed(s)
    engine.setRate(s)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleSetAnime4k = useCallback(
    (v: Anime4kPreset | 'off'): void => {
      if (v === 'off') {
        // One flag: Off in the player turns the feature off globally, not just here.
        setAnime4kChoice({ key: tmdbId, on: false })
        setAnime4kEnabled(false)
        writeAnime4kEnabled(false)
      } else {
        // Enabling anywhere (anime or not) sets the remembered global toggle and applies now;
        // auto-apply on future titles still only fires on detected anime.
        setAnime4kChoice({ key: tmdbId, on: true })
        setAnime4kEnabled(true)
        writeAnime4kEnabled(true)
        setAnime4kPreset(v)
        writeAnime4kPreset(v)
      }
    },
    [tmdbId]
  )

  const handleScreenshot = useCallback(async (): Promise<void> => {
    const c = canvasRef.current
    if (!c || !c.width || !c.height) {
      flashToast('No frame available')
      return
    }
    setCtxMenuOpen(false)
    setScreenshotting(true)
    try {
      await new Promise<void>((resolve) => setTimeout(resolve, 220))
      const r = c.getBoundingClientRect()
      await window.api.screenshot.captureToClipboard({
        x: r.x,
        y: r.y,
        width: r.width,
        height: r.height
      })
      flashToast('Frame copied to clipboard')
    } catch (e) {
      console.warn('[screenshot] failed', e)
      flashToast('Screenshot failed')
    } finally {
      setScreenshotting(false)
    }
  }, [flashToast])

  const handleReloadStream = useCallback((): void => {
    reloadResumeRef.current = { url: search.url, sec: engine.timePos || 0 }
    setReloadNonce((n) => n + 1)
    flashToast('Reloading stream…')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flashToast, engine.timePos])

  const handleShowShortcuts = useCallback((): void => {
    setShortcutsOpen(true)
  }, [])

  const isTv = search.mediaType === 'tv'
  const segmentsResult = useQuery(
    segmentsQuery({
      imdbId: isTv && skipButtonsEnabled ? search.imdbId : undefined,
      season: search.season,
      episode: search.episode
    })
  )
  const segments = segmentsResult.data

  const handleSeekTo = useCallback(
    (sec: number): void => {
      const target = Math.max(0, sec)
      engine.seek(target)
      setSubReloadSec(target)
    },
    [engine]
  )

  const activeSegment = useMemo((): {
    kind: 'intro' | 'recap'
    end: number
  } | null => {
    if (!skipButtonsEnabled || !segments) return null
    if (segments.recap && timePos >= segments.recap.start_sec && timePos < segments.recap.end_sec) {
      return { kind: 'recap', end: segments.recap.end_sec }
    }
    if (segments.intro && timePos >= segments.intro.start_sec && timePos < segments.intro.end_sec) {
      return { kind: 'intro', end: segments.intro.end_sec }
    }
    return null
  }, [skipButtonsEnabled, segments, timePos])

  const movieDetails = useQuery({
    ...movieDetailsQuery(tmdbId),
    enabled: search.mediaType === 'movie'
  })
  const tvDetails = useQuery({
    ...tvDetailsQuery(tmdbId),
    enabled: search.mediaType === 'tv'
  })
  const movieFanart = useQuery({
    ...fanartMovieQuery(search.imdbId),
    enabled: search.mediaType === 'movie'
  })
  const tvdbId = tvDetails.data?.external_ids?.tvdb_id ?? undefined
  const tvFanart = useQuery({
    ...fanartTvQuery(tvdbId),
    enabled: search.mediaType === 'tv' && tvdbId !== undefined
  })

  const detectedAnime = isDetectedAnime(
    search.mediaType === 'movie' ? movieDetails.data : tvDetails.data
  )
  const anime4kOn =
    anime4kChoice?.key === tmdbId ? anime4kChoice.on : anime4kEnabled && detectedAnime

  // Auto-apply is gated on Detected anime; an explicit in-player choice overrides for this title.
  useEffect(() => {
    if (!engine.loadedUrl) return
    engine.controllerRef.current?.setAnime4k({ enabled: anime4kOn, preset: anime4kPreset })
  }, [engine.loadedUrl, anime4kOn, anime4kPreset, engine.controllerRef])

  // Step-downs are session-only and always announced — the saved preset is never rewritten.
  useEffect(() => {
    const c = engine.controllerRef.current
    if (!engine.loadedUrl || !c) return
    return c.on('anime4k', ({ droppedTo }) => {
      if (droppedTo === 'off') flashToast('Anime4K turned off — playback was struggling')
      else if (droppedTo) flashToast(`Anime4K stepped down to ${ANIME4K_PRESET_LABELS[droppedTo]}`)
    })
  }, [engine.loadedUrl, engine.controllerRef, flashToast])

  const backdropUrl = useMemo(() => {
    const path =
      search.mediaType === 'movie'
        ? movieDetails.data?.backdrop_path
        : tvDetails.data?.backdrop_path
    return tmdbImage(path, 'original') ?? undefined
  }, [movieDetails.data, tvDetails.data, search.mediaType])

  const logoUrl = useMemo(() => {
    if (search.mediaType === 'movie') {
      return movieDetails.data
        ? pickMovieHeroLogo(movieDetails.data, movieFanart.data ?? null)
        : undefined
    }
    return tvDetails.data ? pickTvHeroLogo(tvDetails.data, tvFanart.data ?? null) : undefined
  }, [movieDetails.data, tvDetails.data, movieFanart.data, tvFanart.data, search.mediaType])

  const rpcImageUrl = useMemo(() => {
    const pickRandomEn = (arr: FanartImage[] | undefined): string | undefined => {
      if (!arr?.length) return undefined
      const en = arr.filter((i) => i.lang === 'en')
      const pool = en.length > 0 ? en : arr
      return pool[Math.floor(Math.random() * pool.length)]?.url
    }
    if (search.mediaType === 'movie') {
      const disc = pickRandomEn(movieFanart.data?.moviedisc)
      if (disc) return disc
      const poster = pickRandomEn(movieFanart.data?.movieposter)
      if (poster) return poster
      return tmdbImage(movieDetails.data?.poster_path, 'w500') ?? undefined
    }
    const poster = pickRandomEn(tvFanart.data?.tvposter)
    if (poster) return poster
    return tmdbImage(tvDetails.data?.poster_path, 'w500') ?? undefined
  }, [search.mediaType, movieFanart.data, tvFanart.data, movieDetails.data, tvDetails.data])

  // Playback engine (rqbit + mediabunny + WebCodecs + WebGPU) lives in usePlayerEngine.

  const posterPath = useMemo(
    () =>
      search.mediaType === 'movie'
        ? (movieDetails.data?.poster_path ?? undefined)
        : (tvDetails.data?.poster_path ?? undefined),
    [movieDetails.data, tvDetails.data, search.mediaType]
  )
  const backdropPath = useMemo(
    () =>
      search.mediaType === 'movie'
        ? (movieDetails.data?.backdrop_path ?? undefined)
        : (tvDetails.data?.backdrop_path ?? undefined),
    [movieDetails.data, tvDetails.data, search.mediaType]
  )

  // The finale is the last episode of the highest numbered season, specials aside. Only the
  // player has the show's shape, so it rides along with progress and lets the server promote a
  // finished episode into a finished series.
  const isSeriesFinale = useMemo(() => {
    if (search.mediaType !== 'tv') return false
    const numbered = (tvDetails.data?.seasons ?? []).filter(
      (s) => s.season_number > 0 && s.episode_count > 0
    )
    const last = numbered.reduce<TmdbSeasonSummary | null>(
      (best, s) => (!best || s.season_number > best.season_number ? s : best),
      null
    )
    if (!last) return false
    return search.season === last.season_number && search.episode === last.episode_count
  }, [search.mediaType, search.season, search.episode, tvDetails.data])

  const saveProgress = (overrideState?: 'playing' | 'paused' | 'idle'): void => {
    if (!duration) return
    const pos = engine.controllerRef.current?.currentTime ?? timePos
    void upsertProgress({
      imdbId: search.imdbId,
      mediaType: search.mediaType,
      season: search.season,
      episode: search.episode,
      positionSec: Math.floor(pos),
      durationSec: Math.floor(duration),
      state: overrideState ?? (paused ? 'paused' : 'playing'),
      title: search.title,
      tmdbId,
      posterPath,
      backdropPath,
      streamUrl: search.url,
      episodeLabel: search.episodeLabel,
      isSeriesFinale
    })
  }

  const saveProgressRef = useRef(saveProgress)
  saveProgressRef.current = saveProgress

  useEffect(() => {
    return () => {
      saveProgressRef.current('idle')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!duration || !timePos) return
    const now = Date.now()
    if (now - lastSavedRef.current < SAVE_THROTTLE_MS) return
    lastSavedRef.current = now
    saveProgress()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timePos, duration])

  useEffect(() => {
    if (!duration) return
    lastSavedRef.current = Date.now()
    saveProgress(paused ? 'paused' : 'playing')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paused])

  // Handing off to an external player pauses the internal engine, but the user is still watching —
  // keep presence in "playing" with a position that advances in wall-clock time from the handoff
  // point. We can't see the external player's real state, so this assumes continuous playback and
  // stops once the runtime would have elapsed. Resuming internal playback drops the simulation.
  const [externalHandoff, setExternalHandoff] = useState<{ atMs: number; posSec: number } | null>(
    null
  )
  const [externalNowMs, setExternalNowMs] = useState(0)

  useEffect(() => {
    if (!paused) setExternalHandoff(null)
  }, [paused])

  useEffect(() => {
    if (!externalHandoff) return
    const tick = (): void => {
      const posSec = externalHandoff.posSec + (Date.now() - externalHandoff.atMs) / 1000
      if (duration > 0 && posSec >= duration) {
        setExternalHandoff(null)
        return
      }
      setExternalNowMs(Date.now())
    }
    const t = setInterval(tick, 5000)
    return () => clearInterval(t)
  }, [externalHandoff, duration])

  const externalPosSec = externalHandoff
    ? externalHandoff.posSec + Math.max(0, externalNowMs - externalHandoff.atMs) / 1000
    : null

  useKeepAwake(!paused)
  useDiscordPresence({
    title: search.title,
    poster: rpcImageUrl,
    season: search.mediaType === 'tv' ? (search.season ?? null) : null,
    episode: search.mediaType === 'tv' ? (search.episode ?? null) : null,
    epTitle:
      search.mediaType === 'tv' && search.episodeLabel
        ? search.episodeLabel.replace(/^S\d+E\d+\s*[·\-–—]\s*/i, '')
        : null,
    currentTime: externalPosSec ?? timePos,
    duration,
    playing: externalHandoff ? true : !paused
  })

  // chrome auto-hide
  useEffect(() => {
    const onMove = (): void => {
      setChromeVisible(true)
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
      hideTimerRef.current = setTimeout(() => {
        if (menuOpenRef.current === 0) setChromeVisible(false)
      }, CHROME_HIDE_MS)
    }
    onMove()
    window.addEventListener('mousemove', onMove)
    return () => {
      window.removeEventListener('mousemove', onMove)
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
    }
  }, [])

  useEffect(() => {
    if (menuOpenCount > 0) {
      setChromeVisible(true)
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current)
        hideTimerRef.current = null
      }
    }
  }, [menuOpenCount])

  // keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      const c = engine.controllerRef.current
      if (!c) return
      const key = e.key
      const cur = c.currentTime
      const dur = c.duration || 0
      if (key === ' ') {
        e.preventDefault()
        engine.togglePause()
      } else if (key === 'ArrowLeft') {
        seekTo(cur - 10)
      } else if (key === 'ArrowRight') {
        seekTo(cur + 10)
      } else if (key === 'j' || key === 'J') {
        seekTo(cur - 30)
      } else if (key === 'l' || key === 'L') {
        seekTo(cur + 30)
      } else if (key === 'f' || key === 'F') {
        toggleFullscreen()
      } else if (key === 'm' || key === 'M') {
        setMuted((m) => !m)
      } else if (key === 'Escape') {
        // Leave fullscreen first; only exit the player when already windowed.
        void window.api.window.isFullScreen().then((fs) => {
          if (fs) void window.api.window.setFullScreen(false)
          else goBack()
        })
      } else if (/^[0-9]$/.test(key)) {
        const n = Number(key)
        if (dur > 0) seekTo((n / 10) * dur)
      } else if (key === 'z' || key === 'Z' || key === 'x' || key === 'X') {
        if (e.metaKey || e.ctrlKey || e.altKey) return
        if (selectedSub?.source !== 'online' && selectedSub?.source !== 'local') return
        const dir = key === 'x' || key === 'X' ? 1 : -1
        const mag = e.shiftKey ? 0.5 : 0.1
        e.preventDefault()
        nudgeOffset(dir * mag)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate, selectedSub])

  const handleVolumeChange = (v: number): void => {
    setVolume(v)
    if (v > 0) setMuted(false)
    engine.setVolume(v)
    localStorage.setItem(VOLUME_KEY, String(v))
  }

  const toggleMute = (): void => setMuted((m) => !m)

  const togglePause = (): void => {
    engine.togglePause()
  }

  const seekTo = (sec: number): void => {
    const dur = engine.controllerRef.current?.duration || 0
    const target = Math.max(0, Math.min(dur || sec, sec))
    engine.seek(target)
    // Re-point embedded subtitle loading at the new spot (cues read forward from here).
    setSubReloadSec(target)
  }

  // Window fullscreen via the main process — the HTML fullscreen API is unreliable in a
  // frameless window and would fall out of sync with F11 (which toggles window fullscreen).
  const toggleFullscreen = useCallback((): void => {
    void window.api.window.isFullScreen().then((fs) => window.api.window.setFullScreen(!fs))
  }, [])

  // Whether the window was already fullscreen when the player opened, so leaving the player can
  // put the window back the way the user had it rather than stranding the whole app fullscreen.
  const enteredFullscreenRef = useRef<boolean | null>(null)

  useEffect(() => {
    let cancelled = false
    void window.api.window.isFullScreen().then((fs) => {
      if (cancelled) return
      if (enteredFullscreenRef.current === null) enteredFullscreenRef.current = fs
      setIsFullscreen(fs)
    })
    const off = window.api.window.onFullScreenChange(setIsFullscreen)
    return () => {
      cancelled = true
      off()
      // Only undo fullscreen the player itself introduced. Someone who was already fullscreen
      // before pressing play stays that way, and someone who dropped out of fullscreen while
      // watching is not forced back into it.
      if (enteredFullscreenRef.current !== false) return
      void window.api.window.isFullScreen().then((fs) => {
        if (fs) void window.api.window.setFullScreen(false)
      })
    }
  }, [])

  // The player draws to a canvas (no <video> element), so PiP runs off a mirrored capture stream.
  const pip = usePictureInPicture({
    canvasRef,
    paused,
    hasFrame,
    play: engine.play,
    pause: engine.pause,
    repaint: engine.repaint,
    onUnavailable: flashToast
  })

  const seasonForPrevNext =
    search.mediaType === 'tv' && search.season != null ? search.season : null
  const seasonQuery = useQuery({
    ...tvSeasonQuery(Number(params.id), seasonForPrevNext ?? 0),
    enabled: seasonForPrevNext != null && !Number.isNaN(Number(params.id))
  })
  const episodeRecord = useMemo(() => {
    if (search.mediaType !== 'tv' || search.episode == null) return null
    const eps = seasonQuery.data?.episodes ?? []
    return eps.find((e) => e.episode_number === search.episode) ?? null
  }, [seasonQuery.data, search.mediaType, search.episode])

  const seasons = useMemo(
    () => (tvDetails.data?.seasons ?? []).filter((s) => s.season_number >= 1),
    [tvDetails.data]
  )
  const episodesInSeason = seasonQuery.data?.episodes?.length ?? 0
  const currentCursor: EpisodeCursor | null =
    search.mediaType === 'tv' && search.season != null && search.episode != null
      ? { season: search.season, episode: search.episode }
      : null

  const nextCursor = useMemo(
    () =>
      currentCursor
        ? nextEpisodeCursor({ current: currentCursor, episodesInSeason, seasons })
        : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [currentCursor?.season, currentCursor?.episode, episodesInSeason, seasons]
  )
  const prevCursor = useMemo(
    () => (currentCursor ? previousEpisodeCursor({ current: currentCursor, seasons }) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [currentCursor?.season, currentCursor?.episode, seasons]
  )

  // Same query key as seasonQuery whenever the next episode is in this season, so the common case
  // costs nothing extra and a season rollover is the only fetch.
  const nextSeasonQuery = useQuery({
    ...tvSeasonQuery(tmdbId, nextCursor?.season ?? 0),
    enabled: nextCursor != null && Number.isFinite(tmdbId)
  })
  const nextEpisodeRecord = useMemo(() => {
    if (!nextCursor) return null
    const eps = nextSeasonQuery.data?.episodes ?? []
    return eps.find((e) => e.episode_number === nextCursor.episode) ?? null
  }, [nextCursor, nextSeasonQuery.data])

  const launchingRef = useRef(false)

  // Every way into another episode resolves a stream and lands in the player. Sending the viewer
  // back to the show page instead — which is what the next button used to do — reads as a dead
  // button: the page highlights the episode and nothing plays.
  const playEpisode = useCallback(
    async (cursor: EpisodeCursor, opts: { name?: string | null }): Promise<void> => {
      if (launchingRef.current) return
      launchingRef.current = true
      const resolveArgs = {
        tvTmdbId: tmdbId,
        imdbId: search.imdbId,
        showTitle: search.title,
        season: cursor.season,
        episode: cursor.episode,
        episodeName: opts.name,
        bingeGroup: search.bingeGroup
      }
      try {
        const nextSearch = await resolveEpisodeWatch(resolveArgs)
        void navigate({
          to: '/watch/$mediaType/$id',
          params: { mediaType: 'tv', id: String(params.id) },
          search: nextSearch
        })
      } catch (e) {
        console.error('[episode] failed to start', e)
        flashToast('Could not start that episode')
      } finally {
        launchingRef.current = false
      }
    },
    [tmdbId, search.imdbId, search.title, search.bingeGroup, params.id, navigate, flashToast]
  )

  const prevEpisodeName =
    prevCursor && prevCursor.season === search.season
      ? (seasonQuery.data?.episodes.find((e) => e.episode_number === prevCursor.episode)?.name ??
        null)
      : null

  const onPreviousEpisode = prevCursor
    ? () => void playEpisode(prevCursor, { name: prevEpisodeName })
    : null
  const onNextEpisode = nextCursor
    ? () => void playEpisode(nextCursor, { name: nextEpisodeRecord?.name })
    : null

  // ── Window during picture-in-picture ────────────────────────────────────────────────────────
  const [pipMinimizePref] = useState(() => readPipMinimizeEnabled())
  const minimizedForPipRef = useRef(false)

  const minimizeForPip = useCallback((): void => {
    minimizedForPipRef.current = true
    void window.api.window.minimize()
  }, [])

  useEffect(() => {
    if (pip.active) {
      if (pipMinimizePref) minimizeForPip()
      return
    }
    // Coming back from picture-in-picture puts the window back as it was — minimize/restore keeps
    // the bounds the viewer left it at, so nothing is resized or repositioned behind their back.
    if (minimizedForPipRef.current) {
      minimizedForPipRef.current = false
      void window.api.window.restore()
    }
  }, [pip.active, pipMinimizePref, minimizeForPip])

  // Leaving the player while the window is still tucked away would strand it in the taskbar.
  useEffect(() => {
    return () => {
      if (minimizedForPipRef.current) {
        minimizedForPipRef.current = false
        void window.api.window.restore()
      }
    }
  }, [])

  const mediaSessionTitle = useMemo(() => {
    if (search.mediaType === 'movie') return search.title
    const ss = String(search.season ?? 0).padStart(2, '0')
    const ee = String(search.episode ?? 0).padStart(2, '0')
    const epName = episodeRecord?.name ? ` ${episodeRecord.name}` : ''
    return `${search.title} — S${ss}E${ee}${epName}`
  }, [search.mediaType, search.title, search.season, search.episode, episodeRecord])

  const mediaSessionArtwork = useMemo(() => tmdbImage(posterPath, 'w500') ?? null, [posterPath])

  useMediaSession({
    title: mediaSessionTitle,
    artwork: mediaSessionArtwork,
    playing: !paused,
    currentTime: timePos,
    duration,
    playbackRate: playbackSpeed,
    togglePlay: togglePause,
    seek: seekTo,
    seekBy: (delta) => {
      seekTo((engine.controllerRef.current?.currentTime || 0) + delta)
    },
    onPreviousTrack: onPreviousEpisode,
    onNextTrack: onNextEpisode
  })

  return (
    <ContextMenu.Root open={ctxMenuOpen} onOpenChange={setCtxMenuOpen}>
      <ContextMenu.Trigger
        render={
          <div
            className={cn(
              'fixed inset-0 z-50 flex flex-col bg-black',
              !(chromeVisible || buffering) && 'cursor-none'
            )}
          />
        }
      >
        <div className="app-drag pointer-events-auto absolute inset-x-0 top-0 z-40 h-12" />
        <canvas ref={canvasRef} className="absolute inset-0 h-full w-full object-contain" />
        <PipPlaceholder
          visible={pip.active}
          onExit={() => void pip.toggle()}
          onMinimize={minimizeForPip}
        />
        <BufferOverlay
          backdropUrl={backdropUrl}
          logoUrl={logoUrl}
          visible={buffering}
          mode={hasFrame ? 'rebuffer' : 'initial'}
        />
        <SubtitleOverlay
          getCurrentTime={() => engine.controllerRef.current?.currentTime ?? 0}
          selected={selectedSub}
          style={subStyle}
          bottomGap={chromeVisible ? 10 : 0}
          offsetSec={subOffsetSec}
          getEmbeddedCues={engine.getSubtitleCueStream}
          embeddedLoadFromSec={subReloadSec}
        />
        <SubtitleOffsetHud visible={hudVisible} offsetSec={subOffsetSec} />
        <StatsForNerds
          visible={statsVisible}
          stats={engine.stats}
          streamUrl={search.url}
          filename={search.filename}
          onClose={() => setStatsVisible(false)}
        />
        <PlayerToast message={toastMessage} />
        <SkipSegmentButton
          visible={!!activeSegment}
          label={activeSegment?.kind === 'recap' ? 'Skip recap' : 'Skip intro'}
          onSkip={() => activeSegment && handleSeekTo(activeSegment.end)}
        />
        <ChromeOverlay visible={chromeVisible || buffering}>
          <TopBar title={search.title} episodeLabel={search.episodeLabel} onBack={goBack} />
          <BottomBar
            paused={paused}
            timePos={timePos}
            duration={duration}
            volume={volume}
            muted={muted}
            buffered={bufferedRanges}
            introSegment={segments?.intro ?? null}
            recapSegment={segments?.recap ?? null}
            outroSegment={segments?.outro ?? null}
            onTogglePause={togglePause}
            onSeek={seekTo}
            onVolumeChange={handleVolumeChange}
            onToggleMute={toggleMute}
            onTogglePip={() => void pip.toggle()}
            pipActive={pip.active}
            isFullscreen={isFullscreen}
            onToggleFullscreen={toggleFullscreen}
            subtitleSlot={
              <SubtitleMenu
                embedded={embeddedTracks}
                selected={selectedSub}
                onSelect={setSelectedSub}
                style={subStyle}
                onStyleChange={setSubStyle}
                imdbId={search.imdbId}
                mediaType={search.mediaType}
                season={search.season}
                episode={search.episode}
                videoHash={videoHash}
                videoSize={videoSize}
                hashSettled={hashSettled}
                onOpenChange={handleMenuOpenChange}
                offsetSec={subOffsetSec}
                onOffsetChange={handleOffsetChange}
              />
            }
            audioSlot={
              audio.tracks.length > 1 ? (
                <AudioMenu
                  tracks={audio.tracks}
                  selectedIndex={audio.selectedIndex}
                  onSelect={(id) => {
                    audio.setSelected(id)
                    const t = audio.tracks.find((x) => x.id === id)
                    if (t) writeAudioLastLang(t.lang)
                  }}
                  onOpenChange={handleMenuOpenChange}
                />
              ) : null
            }
            externalPlayerSlot={
              <ExternalPlayerMenu
                streamUrl={search.url}
                getPosition={() => engine.controllerRef.current?.currentTime ?? 0}
                onBeforeLaunch={() => {
                  setExternalHandoff({
                    atMs: Date.now(),
                    posSec: engine.controllerRef.current?.currentTime ?? 0
                  })
                  if (!paused) togglePause()
                }}
                onOpenChange={handleMenuOpenChange}
              />
            }
          />
        </ChromeOverlay>
      </ContextMenu.Trigger>
      <PlayerContextMenuPopup
        statsVisible={statsVisible}
        onToggleStats={handleToggleStats}
        playbackSpeed={playbackSpeed}
        onSetSpeed={handleSetSpeed}
        anime4kValue={anime4kOn ? anime4kPreset : 'off'}
        anime4kStatus={engine.stats?.anime4k ?? null}
        onSetAnime4k={handleSetAnime4k}
        onScreenshot={() => void handleScreenshot()}
        onReload={handleReloadStream}
        onShowShortcuts={handleShowShortcuts}
      />
      <KeyboardShortcutsModal open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
    </ContextMenu.Root>
  )
}

function ChromeOverlay({
  visible,
  children
}: {
  visible: boolean
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <div
      className={cn(
        'pointer-events-none absolute inset-0 z-30 transition-opacity duration-200',
        visible ? 'opacity-100' : 'opacity-0 [&_*]:!pointer-events-none'
      )}
    >
      {children}
    </div>
  )
}

function TopBar({
  title,
  episodeLabel,
  onBack
}: {
  title: string
  episodeLabel?: string
  onBack: () => void
}): React.JSX.Element {
  return (
    <>
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
          onClick={onBack}
          aria-label="Back"
          className="flex size-11 shrink-0 items-center justify-center rounded-full outline-none"
        >
          <BackArrowIcon />
        </button>
        <div className="flex flex-col gap-[3px]">
          <h1 className="text-[18px] leading-[22px] font-bold tracking-[-0.01em] text-white">
            {title}
          </h1>
          {episodeLabel ? (
            <span className="text-[11px] leading-[14px] font-medium tracking-[0.12em] text-white/55 uppercase">
              {episodeLabel}
            </span>
          ) : null}
        </div>
      </div>
    </>
  )
}

function BottomBar({
  paused,
  timePos,
  duration,
  volume,
  muted,
  buffered,
  introSegment,
  recapSegment,
  outroSegment,
  onTogglePause,
  onSeek,
  onVolumeChange,
  onToggleMute,
  onTogglePip,
  pipActive,
  isFullscreen,
  onToggleFullscreen,
  subtitleSlot,
  audioSlot,
  externalPlayerSlot
}: {
  paused: boolean
  timePos: number
  duration: number
  volume: number
  muted: boolean
  buffered: Array<{ start: number; end: number }>
  introSegment?: IntroDbSegment | null
  recapSegment?: IntroDbSegment | null
  outroSegment?: IntroDbSegment | null
  onTogglePause: () => void
  onSeek: (sec: number) => void
  onVolumeChange: (v: number) => void
  onToggleMute: () => void
  onTogglePip: () => void
  pipActive: boolean
  isFullscreen: boolean
  onToggleFullscreen: () => void
  subtitleSlot?: React.ReactNode
  audioSlot?: React.ReactNode
  externalPlayerSlot?: React.ReactNode
}): React.JSX.Element {
  const remaining = Math.max(0, (duration || 0) - timePos)
  return (
    <>
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 h-[260px]"
        style={{
          backgroundImage: 'linear-gradient(0deg, oklab(0% 0 0 / 85%) 0%, oklab(0% 0 0 / 0%) 100%)'
        }}
      />
      <div className="pointer-events-auto absolute inset-x-8 bottom-4 flex flex-col items-center gap-2">
        <div className="flex w-full items-center gap-[18px]">
          <span className="w-[60px] shrink-0 text-[14px] leading-[18px] font-bold text-white tabular-nums">
            {formatTime(timePos)}
          </span>
          <ProgressBar
            value={timePos}
            duration={duration}
            buffered={buffered}
            introSegment={introSegment ?? null}
            recapSegment={recapSegment ?? null}
            outroSegment={outroSegment ?? null}
            onSeek={onSeek}
          />
          <span className="w-[60px] shrink-0 text-right text-[14px] leading-[18px] font-medium text-white tabular-nums">
            -{formatTime(remaining)}
          </span>
        </div>
        <div className="flex w-full items-center justify-between">
          <button
            type="button"
            onClick={onTogglePause}
            aria-label={paused ? 'Play' : 'Pause'}
            className="flex size-12 items-center justify-center outline-none"
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
                onClick={onToggleMute}
              >
                {muted || volume === 0 ? (
                  <VolumeMuteIcon />
                ) : volume < 0.5 ? (
                  <VolumeHalfIcon />
                ) : (
                  <VolumeFullIcon />
                )}
              </IconButton>
              <VolumeSlider value={volume} onChange={onVolumeChange} />
            </div>
            {subtitleSlot ?? (
              <IconButton aria-label="Subtitles">
                <CcIcon />
              </IconButton>
            )}
            {audioSlot}
            <IconButton
              aria-label={pipActive ? 'Exit picture in picture' : 'Picture in picture'}
              onClick={onTogglePip}
            >
              <PipIcon />
            </IconButton>
            {externalPlayerSlot}
            <IconButton
              aria-label={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
              onClick={onToggleFullscreen}
            >
              {isFullscreen ? <ExitFullscreenIcon /> : <FullscreenIcon />}
            </IconButton>
          </div>
        </div>
      </div>
    </>
  )
}

function IconButton({
  children,
  onClick,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement>): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex size-10 items-center justify-center text-white outline-none"
      {...rest}
    >
      {children}
    </button>
  )
}

function ProgressBar({
  value,
  duration,
  buffered,
  introSegment,
  recapSegment,
  outroSegment,
  onSeek
}: {
  value: number
  duration: number
  buffered: Array<{ start: number; end: number }>
  introSegment?: IntroDbSegment | null
  recapSegment?: IntroDbSegment | null
  outroSegment?: IntroDbSegment | null
  onSeek: (sec: number) => void
}): React.JSX.Element {
  const trackRef = useRef<HTMLDivElement | null>(null)
  const [dragging, setDragging] = useState(false)
  const [dragPct, setDragPct] = useState(0)
  const [hoverPct, setHoverPct] = useState<number | null>(null)
  const pct = dragging ? dragPct : duration > 0 ? (value / duration) * 100 : 0
  const tipPct = dragging ? dragPct : hoverPct
  const tipVisible = tipPct !== null && duration > 0

  const updateFromEvent = (e: React.MouseEvent | MouseEvent): number => {
    const rect = trackRef.current?.getBoundingClientRect()
    if (!rect) return 0
    return Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
  }

  const onPointerDown = (e: React.MouseEvent<HTMLDivElement>): void => {
    setDragging(true)
    const r = updateFromEvent(e)
    setDragPct(r * 100)
    document.body.style.cursor = 'grabbing'
    setHoverPct(r * 100)
    const onMove = (ev: MouseEvent): void => {
      const rr = updateFromEvent(ev)
      setDragPct(rr * 100)
      setHoverPct(rr * 100)
    }
    const onUp = (ev: MouseEvent): void => {
      const rr = updateFromEvent(ev)
      onSeek(rr * duration)
      setDragging(false)
      document.body.style.cursor = ''
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  const onTrackMouseMove = (e: React.MouseEvent<HTMLDivElement>): void => {
    setHoverPct(updateFromEvent(e) * 100)
  }
  const onTrackMouseLeave = (): void => {
    setHoverPct(null)
  }

  return (
    <div
      className="group/progress relative h-3 grow"
      onMouseMove={onTrackMouseMove}
      onMouseLeave={onTrackMouseLeave}
    >
      <div
        ref={trackRef}
        onMouseDown={onPointerDown}
        className="absolute inset-0 overflow-hidden rounded-full bg-white/16"
      >
        {duration > 0 && introSegment ? (
          <SegmentTint
            color="#B7E7C9"
            startSec={introSegment.start_sec}
            endSec={introSegment.end_sec}
            duration={duration}
          />
        ) : null}
        {duration > 0 && recapSegment ? (
          <SegmentTint
            color="#C9C2E7"
            startSec={recapSegment.start_sec}
            endSec={recapSegment.end_sec}
            duration={duration}
          />
        ) : null}
        {duration > 0 && outroSegment ? (
          <SegmentTint
            color="#F2C6A0"
            startSec={outroSegment.start_sec}
            endSec={outroSegment.end_sec}
            duration={duration}
          />
        ) : null}
        {(() => {
          if (duration <= 0 || buffered.length === 0) return null
          let aheadEnd = value
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
          const widthPct = (aheadEnd / duration) * 100
          return (
            <div
              className="pointer-events-none absolute inset-y-0 left-0 bg-white/[0.38]"
              style={{ width: `${widthPct}%` }}
            />
          )
        })()}
        <div
          className="pointer-events-none absolute inset-y-0 left-0 bg-white"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div
        onMouseDown={onPointerDown}
        className={cn(
          'absolute -top-2 h-7 w-6 -translate-x-1/2',
          dragging ? 'cursor-grabbing' : 'cursor-grab'
        )}
        style={{ left: `${pct}%` }}
      >
        <div className="pointer-events-none absolute top-1/2 left-1/2 h-5 w-2 -translate-x-1/2 -translate-y-1/2 rounded-[3px] bg-white" />
      </div>
      <AnimatePresence>
        {tipVisible ? (
          <motion.div
            key="tip"
            className="pointer-events-none absolute bottom-full mb-3 flex -translate-x-1/2 flex-col items-center gap-1 rounded-md bg-black/80 p-1 backdrop-blur-sm"
            style={{
              left: `clamp(20px, ${tipPct}%, calc(100% - 20px))`
            }}
            initial={{ opacity: 0, y: 2 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 2 }}
            transition={{ duration: 0.1, ease: [0.23, 1, 0.32, 1] }}
          >
            <span className="px-1 text-[11px] leading-4 font-medium tabular-nums text-white">
              {formatScrubTime((tipPct! / 100) * duration, duration)}
            </span>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  )
}

function SegmentTint({
  color,
  startSec,
  endSec,
  duration
}: {
  color: string
  startSec: number
  endSec: number
  duration: number
}): React.JSX.Element | null {
  if (duration <= 0 || endSec <= startSec) return null
  const left = Math.max(0, Math.min(100, (startSec / duration) * 100))
  const width = Math.max(0, Math.min(100 - left, ((endSec - startSec) / duration) * 100))
  if (width <= 0) return null
  return (
    <div
      className="pointer-events-none absolute inset-y-0"
      style={{ left: `${left}%`, width: `${width}%`, backgroundColor: color, opacity: 0.55 }}
    />
  )
}

function formatScrubTime(sec: number, durationSec: number): string {
  const s = Math.max(0, Math.floor(sec))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const ss = s % 60
  if (durationSec >= 3600) {
    return `${h}:${m.toString().padStart(2, '0')}:${ss.toString().padStart(2, '0')}`
  }
  return `${m}:${ss.toString().padStart(2, '0')}`
}

function VolumeSlider({
  value,
  onChange
}: {
  value: number
  onChange: (v: number) => void
}): React.JSX.Element {
  const trackRef = useRef<HTMLDivElement | null>(null)
  const [dragging, setDragging] = useState(false)
  const pct = value * 100

  const update = (e: React.MouseEvent | MouseEvent): void => {
    const rect = trackRef.current?.getBoundingClientRect()
    if (!rect) return
    const v = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    onChange(v)
  }

  const onDown = (e: React.MouseEvent<HTMLDivElement>): void => {
    setDragging(true)
    update(e)
    document.body.style.cursor = 'grabbing'
    const onMove = (ev: MouseEvent): void => update(ev)
    const onUp = (): void => {
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
      ref={trackRef}
      onMouseDown={onDown}
      className="relative h-1.5 w-[100px] shrink-0 rounded-full bg-white/18"
    >
      <div
        className="pointer-events-none absolute inset-y-0 left-0 rounded-full bg-white"
        style={{ width: `${pct}%` }}
      />
      <div
        className={cn(
          'absolute -top-[10px] h-7 w-6 -translate-x-1/2',
          dragging ? 'cursor-grabbing' : 'cursor-grab'
        )}
        style={{ left: `${pct}%` }}
      >
        <div className="pointer-events-none absolute top-1/2 left-1/2 h-5 w-2 -translate-x-1/2 -translate-y-1/2 rounded-[3px] bg-white" />
      </div>
    </div>
  )
}

function BackArrowIcon(): React.JSX.Element {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" aria-hidden>
      <path
        d="M10 5.75L3.75 12L10 18.25"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M4.5 12H20.25"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function BigPlayIcon(): React.JSX.Element {
  return (
    <svg viewBox="0 0 24 24" width="28" height="28" fill="currentColor" aria-hidden>
      <path d="M9.24 2.36C7.41 1.18 5 2.49 5 4.67V19.32C5 21.50 7.41 22.81 9.24 21.63L20.56 14.30C22.23 13.22 22.23 10.77 20.56 9.69L9.24 2.36Z" />
    </svg>
  )
}

function BigPauseIcon(): React.JSX.Element {
  return (
    <svg viewBox="0 0 24 24" width="28" height="28" fill="currentColor" aria-hidden>
      <path d="M6.75 3C5.23 3 4 4.23 4 5.75V18.25C4 19.76 5.23 21 6.75 21H7.25C8.76 21 10 19.76 10 18.25V5.75C10 4.23 8.76 3 7.25 3H6.75Z" />
      <path d="M16.75 3C15.23 3 14 4.23 14 5.75V18.25C14 19.76 15.23 21 16.75 21H17.25C18.76 21 20 19.76 20 18.25V5.75C20 4.23 18.76 3 17.25 3H16.75Z" />
    </svg>
  )
}

function VolumeFullIcon(): React.JSX.Element {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" aria-hidden>
      <path
        d="M13 4.22609C13 3.20722 11.8465 2.61634 11.0196 3.21167L6.08529 6.76439C5.87255 6.91756 5.61705 6.99998 5.35491 6.99998H3.75C2.23122 6.99998 1 8.23119 1 9.74998V14.25C1 15.7688 2.23122 17 3.75 17H5.35491C5.61705 17 5.87255 17.0824 6.08529 17.2356L11.0196 20.7883C11.8465 21.3836 13 20.7927 13 19.7739V4.22609Z"
        fill="currentColor"
      />
      <path
        d="M18.7175 4.22162C19.0104 3.92873 19.4852 3.92873 19.7781 4.22162C21.7679 6.21141 23 8.96244 23 11.9998C23 15.0372 21.7679 17.7882 19.7781 19.778C19.4852 20.0709 19.0104 20.0709 18.7175 19.778C18.4246 19.4851 18.4246 19.0102 18.7175 18.7173C20.4375 16.9973 21.5 14.6234 21.5 11.9998C21.5 9.37624 20.4375 7.00227 18.7175 5.28228C18.4246 4.98939 18.4246 4.51452 18.7175 4.22162Z"
        fill="currentColor"
      />
      <path
        d="M16.4194 7.581C16.1265 7.28811 15.6516 7.28811 15.3587 7.581C15.0658 7.87389 15.0658 8.34876 15.3587 8.64166C16.2191 9.50206 16.75 10.6885 16.75 12.0004C16.75 13.3123 16.2191 14.4988 15.3587 15.3592C15.0658 15.6521 15.0658 16.1269 15.3587 16.4198C15.6516 16.7127 16.1265 16.7127 16.4194 16.4198C17.5496 15.2896 18.25 13.7261 18.25 12.0004C18.25 10.2747 17.5496 8.7112 16.4194 7.581Z"
        fill="currentColor"
      />
    </svg>
  )
}

function VolumeHalfIcon(): React.JSX.Element {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" aria-hidden>
      <path
        d="M11.0196 3.21167C11.8465 2.61634 13 3.20722 13 4.22609V19.7739C13 20.7927 11.8465 21.3836 11.0196 20.7883L6.08529 17.2356C5.87255 17.0824 5.61705 17 5.35491 17H3.75C2.23122 17 1 15.7688 1 14.25V9.74998C1 8.23119 2.23122 6.99998 3.75 6.99998H5.35491C5.61705 6.99998 5.87255 6.91756 6.08529 6.76439L11.0196 3.21167Z"
        fill="currentColor"
      />
      <path
        d="M16.4194 7.581C16.1265 7.28811 15.6517 7.28811 15.3588 7.581C15.0659 7.87389 15.0659 8.34876 15.3588 8.64166C16.2192 9.50206 16.75 10.6885 16.75 12.0004C16.75 13.3123 16.2192 14.4988 15.3588 15.3592C15.0659 15.6521 15.0659 16.1269 15.3588 16.4198C15.6517 16.7127 16.1265 16.7127 16.4194 16.4198C17.5496 15.2896 18.25 13.7261 18.25 12.0004C18.25 10.2747 17.5496 8.7112 16.4194 7.581Z"
        fill="currentColor"
      />
    </svg>
  )
}

function VolumeMuteIcon(): React.JSX.Element {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" aria-hidden>
      <path
        d="M17 5.93934V4.22585C17 3.20697 15.8465 2.6161 15.0196 3.21143L10.0853 6.76415C9.87255 6.91732 9.61705 6.99973 9.35491 6.99973H7.75C6.23122 6.99973 5 8.23095 5 9.74973V14.2497C5 15.25 5.53405 16.1255 6.33257 16.6068L3.21967 19.7197C2.92678 20.0126 2.92678 20.4874 3.21967 20.7803C3.51256 21.0732 3.98744 21.0732 4.28033 20.7803L20.7803 4.28033C21.0732 3.98744 21.0732 3.51256 20.7803 3.21967C20.4874 2.92678 20.0126 2.92678 19.7197 3.21967L17 5.93934Z"
        fill="currentColor"
      />
      <path
        d="M10.0853 17.2353C10.0578 17.2155 10.0295 17.1969 10.0007 17.1794L17 10.1801V19.7736C17 20.7925 15.8465 21.3834 15.0196 20.788L10.0853 17.2353Z"
        fill="currentColor"
      />
    </svg>
  )
}

function CcIcon(): React.JSX.Element {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden>
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M5.75 3C4.23 3 3 4.23 3 5.75V18.25C3 19.76 4.23 21 5.75 21H18.25C19.76 21 21 19.76 21 18.25V5.75C21 4.23 19.76 3 18.25 3H5.75ZM10.29 10.59C9.61 10.08 8.63 10.13 8.01 10.76C7.32 11.44 7.32 12.55 8.01 13.23C8.63 13.86 9.61 13.91 10.29 13.40C10.63 13.15 11.10 13.21 11.34 13.54C11.59 13.88 11.53 14.35 11.20 14.59C9.92 15.55 8.11 15.45 6.95 14.29C5.68 13.02 5.68 10.97 6.95 9.70C8.11 8.54 9.92 8.44 11.20 9.40C11.53 9.64 11.59 10.11 11.34 10.45C11.10 10.78 10.63 10.84 10.29 10.59ZM14.51 10.76C15.13 10.13 16.11 10.08 16.79 10.59C17.13 10.84 17.60 10.78 17.84 10.45C18.09 10.11 18.03 9.64 17.70 9.40C16.42 8.44 14.61 8.54 13.45 9.70C12.18 10.97 12.18 13.02 13.45 14.29C14.61 15.45 16.42 15.55 17.70 14.59C18.03 14.35 18.09 13.88 17.84 13.54C17.60 13.21 17.13 13.15 16.79 13.40C16.11 13.91 15.13 13.86 14.51 13.23C13.82 12.55 13.82 11.44 14.51 10.76Z"
      />
    </svg>
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

function FullscreenIcon(): React.JSX.Element {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden>
      <path d="M2 17.25V14.75C2 14.33 2.33 14 2.75 14C3.16 14 3.5 14.33 3.5 14.75V17.25C3.5 17.94 4.05 18.5 4.75 18.5H7.25C7.66 18.5 8 18.83 8 19.25C8 19.66 7.66 20 7.25 20H4.75C3.23 20 2 18.76 2 17.25ZM20.5 17.25V14.75C20.5 14.33 20.83 14 21.25 14C21.66 14 22 14.33 22 14.75V17.25C22 18.76 20.76 20 19.25 20H16.75C16.33 20 16 19.66 16 19.25C16 18.83 16.33 18.5 16.75 18.5H19.25C19.94 18.5 20.5 17.94 20.5 17.25ZM2 9.25V6.75C2 5.23 3.23 4 4.75 4H7.25C7.66 4 8 4.33 8 4.75C8 5.16 7.66 5.5 7.25 5.5H4.75C4.05 5.5 3.5 6.05 3.5 6.75V9.25C3.5 9.66 3.16 10 2.75 10C2.33 10 2 9.66 2 9.25ZM20.5 9.25V6.75C20.5 6.05 19.94 5.5 19.25 5.5H16.75C16.33 5.5 16 5.16 16 4.75C16 4.33 16.33 4 16.75 4H19.25C20.76 4 22 5.23 22 6.75V9.25C22 9.66 21.66 10 21.25 10C20.83 10 20.5 9.66 20.5 9.25Z" />
    </svg>
  )
}

function ExitFullscreenIcon(): React.JSX.Element {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden>
      <path d="M8 2.75V5.25C8 6.76 6.76 8 5.25 8H2.75C2.33 8 2 7.66 2 7.25C2 6.83 2.33 6.5 2.75 6.5H5.25C5.94 6.5 6.5 5.94 6.5 5.25V2.75C6.5 2.33 6.83 2 7.25 2C7.66 2 8 2.33 8 2.75ZM16 2.75V5.25C16 6.76 17.23 8 18.75 8H21.25C21.66 8 22 7.66 22 7.25C22 6.83 21.66 6.5 21.25 6.5H18.75C18.05 6.5 17.5 5.94 17.5 5.25V2.75C17.5 2.33 17.16 2 16.75 2C16.33 2 16 2.33 16 2.75ZM8 21.25V18.75C8 17.23 6.76 16 5.25 16H2.75C2.33 16 2 16.33 2 16.75C2 17.16 2.33 17.5 2.75 17.5H5.25C5.94 17.5 6.5 18.05 6.5 18.75V21.25C6.5 21.66 6.83 22 7.25 22C7.66 22 8 21.66 8 21.25ZM16 21.25V18.75C16 17.23 17.23 16 18.75 16H21.25C21.66 16 22 16.33 22 16.75C22 17.16 21.66 17.5 21.25 17.5H18.75C18.05 17.5 17.5 18.05 17.5 18.75V21.25C17.5 21.66 17.16 22 16.75 22C16.33 22 16 21.66 16 21.25Z" />
    </svg>
  )
}

function formatTime(sec: number): string {
  if (!sec || isNaN(sec) || !isFinite(sec)) return '0:00'
  const total = Math.floor(sec)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}
