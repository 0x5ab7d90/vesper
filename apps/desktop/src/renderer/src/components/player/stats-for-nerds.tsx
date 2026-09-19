import { useCallback, useEffect, useState } from 'react'
import { AnimatePresence, m as motion } from 'motion/react'
import type { PlayerStats } from '@renderer/lib/player/types'
import { anime4kStatusLabel } from '@renderer/lib/player/anime4k'
import { squircleStyle } from '@renderer/components/ui/squircle-surface'
import { EASE_OUT, EXIT_FADE } from '@renderer/lib/motion'

interface Props {
  visible: boolean
  stats: PlayerStats | null
  streamUrl: string
  filename?: string
  onClose: () => void
}

// HEVC Main10 level 5.0 — representative 4K HDR config for a HW-decode capability probe.
const HEVC_4K_CONTENT_TYPE = 'video/mp4; codecs="hvc1.2.4.L150.B0"'

async function probeHevc4kDecode(): Promise<string> {
  const mc = navigator.mediaCapabilities
  if (!mc?.decodingInfo) return 'unknown'
  try {
    const info = await mc.decodingInfo({
      type: 'file',
      video: {
        contentType: HEVC_4K_CONTENT_TYPE,
        width: 3840,
        height: 2160,
        bitrate: 30_000_000,
        framerate: 24
      }
    })
    if (!info.supported) return 'unsupported'
    return info.powerEfficient ? 'HW-capable' : 'SW only'
  } catch {
    return 'probe failed'
  }
}

function fmtBitrate(bps: number | null): string {
  if (bps == null || !isFinite(bps) || bps <= 0) return '—'
  const mbps = bps / 1_000_000
  return mbps >= 1 ? `${mbps.toFixed(1)} Mbps` : `${Math.round(bps / 1000)} kbps`
}

function fmtThroughput(bps: number): string {
  if (!isFinite(bps) || bps <= 0) return '—'
  const mBs = bps / 8 / 1_000_000
  return mBs >= 1 ? `${mBs.toFixed(1)} MB/s` : `${Math.round(bps / 8 / 1000)} KB/s`
}

function fmtBytes(b: number): string {
  if (b <= 0) return '0 MB'
  const mb = b / 1_000_000
  return mb >= 1000 ? `${(mb / 1000).toFixed(2)} GB` : `${mb.toFixed(1)} MB`
}

function fmtClock(sec: number): string {
  const t = !isFinite(sec) || sec < 0 ? 0 : sec
  const s = Math.floor(t % 60)
  const m = Math.floor(t / 60) % 60
  const h = Math.floor(t / 3600)
  const pad = (n: number): string => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`
}

function fmtDropped(dropped: number, displayed: number): string {
  const total = dropped + displayed
  const pct = total > 0 ? (dropped / total) * 100 : 0
  return `${dropped} / ${total} (${pct.toFixed(2)}%)`
}

function fmtChannels(n: number | null): string {
  if (n == null) return '—'
  if (n === 1) return 'mono'
  if (n === 2) return 'stereo'
  if (n === 6) return '5.1'
  if (n === 8) return '7.1'
  return `${n}ch`
}

function fmtSampleRate(hz: number | null): string {
  if (hz == null || hz <= 0) return ''
  const khz = hz / 1000
  return Number.isInteger(khz) ? `${khz} kHz` : `${khz.toFixed(1)} kHz`
}

function fmtMs(ms: number | null): string {
  if (ms == null || !isFinite(ms) || ms < 0) return '—'
  return ms >= 1000 ? `${(ms / 1000).toFixed(2)} s` : `${Math.round(ms)} ms`
}

function ext(filename?: string): string {
  return (filename ?? 'direct').split('.').pop() ?? '?'
}

export function StatsForNerds({
  visible,
  stats,
  streamUrl,
  filename,
  onClose
}: Props): React.JSX.Element {
  const [decodeCap, setDecodeCap] = useState('probing…')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!visible) return
    void probeHevc4kDecode().then(setDecodeCap)
  }, [visible])

  const onCopy = useCallback((): void => {
    const record = {
      capturedAt: new Date().toISOString(),
      platform: navigator.platform,
      userAgent: navigator.userAgent,
      filename: filename ?? null,
      container: ext(filename),
      streamUrl,
      decodeCapabilityHevc4k: decodeCap,
      ...stats
    }
    console.log('[benchmark]', record)
    ;(window as unknown as { __vesperBench?: unknown }).__vesperBench = record
    void navigator.clipboard?.writeText(JSON.stringify(record, null, 2))
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1200)
  }, [filename, streamUrl, decodeCap, stats])

  const s = stats
  const audioMeta = s
    ? [fmtChannels(s.audioChannels), fmtSampleRate(s.audioSampleRate)].filter(Boolean).join(' · ')
    : '—'
  const color = s ? `${s.colorTransfer} / ${s.colorPrimaries}${s.sourceIsHdr ? ' · HDR' : ''}` : '—'

  return (
    <AnimatePresence>
      {visible && s ? (
        <motion.div
          key="stats"
          className="pointer-events-auto absolute top-20 right-6 z-40 max-w-[440px] min-w-[300px] bg-black/72 px-3 py-2.5 font-mono text-[11px] leading-[16px] text-white/95 backdrop-blur-md"
          style={squircleStyle('inset-sm')}
          initial={{ opacity: 0, x: 4 }}
          animate={{ opacity: 1, x: 0 }}
          exit={EXIT_FADE}
          transition={{ duration: 0.16, ease: EASE_OUT }}
        >
          <div className="mb-1.5 flex items-center justify-between gap-3">
            <span className="text-[10px] font-bold tracking-[0.08em] text-white/55 uppercase">
              Stats for nerds
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onCopy}
                className="text-[10px] tracking-[0.06em] text-white/55 uppercase outline-none hover:text-white"
              >
                {copied ? 'Copied' : 'Copy JSON'}
              </button>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close stats"
                className="text-white/55 outline-none hover:text-white"
              >
                ×
              </button>
            </div>
          </div>

          <Section title="Video" icon={<VideoIcon />} />
          <Row label="Resolution" value={s.resolution} />
          <Row
            label="Render"
            value={s.renderResolution === s.resolution ? '1:1' : s.renderResolution}
          />
          <Row label="Codec" value={s.videoCodec} />
          <Row label="Color" value={color} />
          <Row label="Bitrate" value={fmtBitrate(s.videoBitrate)} />
          <Row label="FPS" value={String(s.fps)} />
          <Row label="Dropped" value={fmtDropped(s.droppedFrames, s.displayedFrames)} />
          <Row label="Anime4K" value={anime4kStatusLabel(s.anime4k)} />

          <Section title="Audio" icon={<AudioIcon />} />
          <Row
            label="Codec"
            value={s.audioCodec ? `${s.audioCodec}${s.audioLang ? ` · ${s.audioLang}` : ''}` : '—'}
          />
          <Row label="Channels" value={audioMeta || '—'} />
          <Row label="Bitrate" value={fmtBitrate(s.audioBitrate)} />

          <Section title="Decode" icon={<DecodeIcon />} />
          <Row label="Path" value={`WebCodecs (${ext(filename)})`} />
          <Row label="HEVC-4K" value={decodeCap} />

          <Section title="Network" icon={<NetworkIcon />} />
          <Row label="Throughput" value={fmtThroughput(s.throughputBps)} />
          <Row label="Downloaded" value={fmtBytes(s.bytesDownloaded)} />

          <Section title="Session" icon={<SessionIcon />} />
          <Row label="Time" value={`${fmtClock(s.positionSec)} / ${fmtClock(s.durationSec)}`} />
          <Row label="First frame" value={fmtMs(s.timeToFirstFrameMs)} />
          <Row label="Rebuffers" value={String(s.rebuffers)} />
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}

function Section({ title, icon }: { title: string; icon: React.ReactNode }): React.JSX.Element {
  return (
    <div className="mt-2 mb-0.5 flex items-center gap-1.5 text-[9px] font-bold tracking-[0.1em] text-white/40 uppercase">
      <span className="[&>svg]:size-3">{icon}</span>
      {title}
    </div>
  )
}

function VideoIcon(): React.JSX.Element {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M14.75 4.5C16.2688 4.5 17.5 5.73122 17.5 7.25V16.75C17.5 18.2688 16.2688 19.5 14.75 19.5H4.75C3.23122 19.5 2 18.2688 2 16.75V7.25C2 5.73122 3.23122 4.5 4.75 4.5H14.75Z"
        fill="currentColor"
      />
      <path
        d="M20.4434 7.21484C21.4284 6.82118 22.4998 7.54658 22.5 8.60742V15.3926C22.4998 16.4534 21.4284 17.1788 20.4434 16.7852L18.5 16.0078V7.99219L20.4434 7.21484Z"
        fill="currentColor"
      />
    </svg>
  )
}

function AudioIcon(): React.JSX.Element {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <rect x="3.5" y="9" width="2" height="6" rx="1" />
      <rect x="7.5" y="6" width="2" height="12" rx="1" />
      <rect x="11.5" y="3" width="2" height="18" rx="1" />
      <rect x="15.5" y="6" width="2" height="12" rx="1" />
      <rect x="19" y="9" width="2" height="6" rx="1" />
    </svg>
  )
}

function DecodeIcon(): React.JSX.Element {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M3.75 15C4.16421 15 4.5 15.3358 4.5 15.75V18.25C4.5 18.9404 5.05964 19.5 5.75 19.5H8.25C8.66421 19.5 9 19.8358 9 20.25C9 20.6642 8.66421 21 8.25 21H5.75C4.23122 21 3 19.7688 3 18.25V15.75C3 15.3358 3.33579 15 3.75 15Z"
        fill="currentColor"
      />
      <path
        d="M13.25 13.5C13.6642 13.5 14 13.8358 14 14.25C14 14.6642 13.6642 15 13.25 15H8.75C8.33579 15 8 14.6642 8 14.25C8 13.8358 8.33579 13.5 8.75 13.5H13.25Z"
        fill="currentColor"
      />
      <path
        d="M15.25 9C15.6642 9 16 9.33579 16 9.75C16 10.1642 15.6642 10.5 15.25 10.5H8.75C8.33579 10.5 8 10.1642 8 9.75C8 9.33579 8.33579 9 8.75 9H15.25Z"
        fill="currentColor"
      />
      <path
        d="M8.25 3C8.66421 3 9 3.33579 9 3.75C9 4.16421 8.66421 4.5 8.25 4.5H5.75C5.05964 4.5 4.5 5.05964 4.5 5.75V8.25C4.5 8.66421 4.16421 9 3.75 9C3.33579 9 3 8.66421 3 8.25V5.75C3 4.23122 4.23122 3 5.75 3H8.25Z"
        fill="currentColor"
      />
      <path
        d="M18.25 3C19.7688 3 21 4.23122 21 5.75V8.25C21 8.66421 20.6642 9 20.25 9C19.8358 9 19.5 8.66421 19.5 8.25V5.75C19.5 5.05964 18.9404 4.5 18.25 4.5H15.75C15.3358 4.5 15 4.16421 15 3.75C15 3.33579 15.3358 3 15.75 3H18.25Z"
        fill="currentColor"
      />
      <path
        d="M19.2405 16.1852L18.5436 14.3733C18.4571 14.1484 18.241 14 18 14C17.759 14 17.5429 14.1484 17.4564 14.3733L16.7595 16.1852C16.658 16.4493 16.4493 16.658 16.1852 16.7595L14.3733 17.4564C14.1484 17.5429 14 17.759 14 18C14 18.241 14.1484 18.4571 14.3733 18.5436L16.1852 19.2405C16.4493 19.342 16.658 19.5507 16.7595 19.8148L17.4564 21.6267C17.5429 21.8516 17.759 22 18 22C18.241 22 18.4571 21.8516 18.5436 21.6267L19.2405 19.8148C19.342 19.5507 19.5507 19.342 19.8148 19.2405L21.6267 18.5436C21.8516 18.4571 22 18.241 22 18C22 17.759 21.8516 17.5429 21.6267 17.4564L19.8148 16.7595C19.5507 16.658 19.342 16.4493 19.2405 16.1852Z"
        fill="currentColor"
      />
    </svg>
  )
}

function NetworkIcon(): React.JSX.Element {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9.25" stroke="currentColor" strokeWidth="1.5" />
      <ellipse cx="12" cy="12" rx="3.5" ry="9.25" stroke="currentColor" strokeWidth="1.5" />
      <path d="M3.5 9.25H20.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M3.5 14.75H20.5" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  )
}

function SessionIcon(): React.JSX.Element {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 2C12.4142 2 12.75 2.33579 12.75 2.75C12.75 3.16421 12.4142 3.5 12 3.5C7.30558 3.5 3.5 7.30558 3.5 12C3.5 16.6944 7.30558 20.5 12 20.5C16.6944 20.5 20.5 16.6944 20.5 12C20.5 11.5858 20.8358 11.25 21.25 11.25C21.6642 11.25 22 11.5858 22 12C22 17.5228 17.5228 22 12 22C6.47715 22 2 17.5228 2 12C2 6.47715 6.47715 2 12 2Z"
        fill="currentColor"
      />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M12 5C15.866 5 19 8.13401 19 12C19 15.866 15.866 19 12 19C8.13401 19 5 15.866 5 12C5 8.13401 8.13401 5 12 5ZM12 7.5C11.5858 7.5 11.25 7.83579 11.25 8.25V12C11.25 12.4142 11.5858 12.75 12 12.75H14.75C15.1642 12.75 15.5 12.4142 15.5 12C15.5 11.5858 15.1642 11.25 14.75 11.25H12.75V8.25C12.75 7.83579 12.4142 7.5 12 7.5Z"
        fill="currentColor"
      />
      <path
        d="M20.1709 7.6748C20.6045 7.49556 21.1017 7.70222 21.2812 8.13574C21.4605 8.56929 21.2547 9.06645 20.8213 9.24609C20.3876 9.42573 19.8896 9.21979 19.71 8.78613C19.5303 8.35243 19.7372 7.85445 20.1709 7.6748Z"
        fill="currentColor"
      />
      <path
        d="M17.8896 4.85742C18.2215 4.52561 18.7598 4.52587 19.0918 4.85742C19.4237 5.18937 19.4237 5.72762 19.0918 6.05957C18.7599 6.39152 18.2216 6.39152 17.8896 6.05957C17.5581 5.72759 17.5578 5.18924 17.8896 4.85742Z"
        fill="currentColor"
      />
      <path
        d="M14.7041 3.12891C14.8837 2.6952 15.3817 2.4893 15.8154 2.66895C16.2489 2.84864 16.4548 3.34573 16.2754 3.7793C16.0958 4.21291 15.5987 4.41869 15.165 4.23926C14.7314 4.05963 14.5246 3.56258 14.7041 3.12891Z"
        fill="currentColor"
      />
    </svg>
  )
}

function Row({ label, value }: { label: string; value: string }): React.JSX.Element {
  return (
    <div className="flex gap-3">
      <span className="w-[100px] shrink-0 text-white/50">{label}</span>
      <span className="tabular-nums break-all">{value}</span>
    </div>
  )
}
