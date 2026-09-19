import { useEffect, useMemo, useState } from 'react'
import { Popover } from '@base-ui/react/popover'
import { useQuery } from '@tanstack/react-query'
import { AnimatePresence, m as motion } from 'motion/react'
import { cn } from '@renderer/lib/cn'
import { squircleStyle } from '@renderer/components/ui/squircle-surface'
import { Ring } from '@renderer/components/ui/spinner'
import { DialSlider } from '@renderer/components/ui/dial-slider'
import { CloseIcon, CheckIcon, PlusIcon } from '@renderer/components/icons'
import { fetchSubtitles, type Subtitle } from '@renderer/lib/opensubs'
import { decodeSubtitleBytes, parseSubtitle } from '@renderer/lib/subtitles'
import {
  DEFAULT_STYLE,
  EDGE_TYPE_LABELS,
  FONT_FAMILY_LABELS,
  FONT_SIZE_MAX,
  FONT_SIZE_MIN,
  PALETTE_COLORS,
  POSITION_MAX,
  POSITION_MIN,
  PRESETS,
  type SubEdgeType,
  type SubFontFamily,
  type SubtitleStyle
} from '@renderer/lib/subtitle-prefs'
import {
  OFFSET_MAX,
  OFFSET_MIN,
  OFFSET_STEP,
  clampOffset,
  formatOffset
} from '@renderer/lib/subtitle-offset'
import { langLabel } from '@renderer/lib/lang'
import { FlagTile } from './flag-tile'
import type { EmbeddedTrack } from '@renderer/lib/use-subtitle-tracks'
import type { SelectedSub } from './subtitle-overlay'
import { EASE_IN, EASE_OUT } from '@renderer/lib/motion'

type Tab = 'embedded' | 'online' | 'local' | 'style' | 'sync'

interface Props {
  embedded: EmbeddedTrack[]
  selected: SelectedSub
  onSelect: (sub: SelectedSub) => void
  style: SubtitleStyle
  onStyleChange: (s: SubtitleStyle) => void
  imdbId: string
  mediaType: 'movie' | 'tv'
  season?: number
  episode?: number
  videoHash?: string
  videoSize?: number
  hashSettled: boolean
  onOpenChange?: (open: boolean) => void
  offsetSec: number
  onOffsetChange: (sec: number) => void
}

export function SubtitleMenu({
  embedded,
  selected,
  onSelect,
  style,
  onStyleChange,
  imdbId,
  mediaType,
  season,
  episode,
  videoHash,
  videoSize,
  hashSettled,
  onOpenChange,
  offsetSec,
  onOffsetChange
}: Props): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const initialTab: Tab = embedded.length > 0 ? 'embedded' : 'online'
  const [tab, setTab] = useState<Tab>(initialTab)

  useEffect(() => {
    if (open) setTab(embedded.length > 0 ? 'embedded' : 'online')
  }, [open, embedded.length])

  const handleOpenChange = (next: boolean): void => {
    setOpen(next)
    onOpenChange?.(next)
  }

  return (
    <Popover.Root open={open} onOpenChange={handleOpenChange}>
      <Popover.Trigger
        aria-label="Subtitles"
        className={cn(
          'inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-transparent text-text-tertiary outline-none active:opacity-70'
        )}
      >
        <CcGlyph />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner side="top" sideOffset={42} align="center" className="z-[100]">
          <Popover.Popup
            className={cn('w-[360px] overflow-hidden p-2 backdrop-blur-2xl')}
            style={{ backgroundColor: '#141414EB', ...squircleStyle('frame-sm') }}
          >
            <Tabs value={tab} onChange={setTab} />
            <div className="h-[440px] overflow-hidden">
              {tab === 'embedded' ? (
                <EmbeddedTab tracks={embedded} selected={selected} onSelect={onSelect} />
              ) : null}
              {tab === 'online' ? (
                <OnlineTab
                  imdbId={imdbId}
                  mediaType={mediaType}
                  season={season}
                  episode={episode}
                  videoHash={videoHash}
                  videoSize={videoSize}
                  hashSettled={hashSettled}
                  selected={selected}
                  onSelect={onSelect}
                />
              ) : null}
              {tab === 'local' ? <LocalTab selected={selected} onSelect={onSelect} /> : null}
              {tab === 'style' ? <StyleTab style={style} onChange={onStyleChange} /> : null}
              {tab === 'sync' ? (
                <SyncTab
                  offsetSec={offsetSec}
                  onChange={onOffsetChange}
                  enabled={selected?.source === 'online' || selected?.source === 'local'}
                />
              ) : null}
            </div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  )
}

const TABS: { key: Tab; label: string }[] = [
  { key: 'embedded', label: 'Native' },
  { key: 'online', label: 'Online' },
  { key: 'local', label: 'Local' },
  { key: 'style', label: 'Style' },
  { key: 'sync', label: 'Sync' }
]

function Tabs({ value, onChange }: { value: Tab; onChange: (t: Tab) => void }): React.JSX.Element {
  const index = Math.max(
    0,
    TABS.findIndex((t) => t.key === value)
  )
  return (
    <div className="relative mb-2 flex h-9 items-center rounded-[10px] bg-white/[0.06] p-0.5">
      <span
        aria-hidden
        className="absolute top-0.5 bottom-0.5 left-0.5 rounded-[8px] bg-white transition-transform duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]"
        style={{
          width: `calc((100% - 4px) / ${TABS.length})`,
          transform: `translateX(${index * 100}%)`
        }}
      />
      {TABS.map((t) => {
        const active = t.key === value
        return (
          <button
            key={t.key}
            type="button"
            onClick={() => onChange(t.key)}
            className={cn(
              'relative z-10 flex h-8 min-w-0 flex-1 items-center justify-center rounded-[8px] px-1.5 text-[12px] font-semibold whitespace-nowrap outline-none transition-colors duration-200',
              active ? 'text-black' : 'text-text-tertiary'
            )}
          >
            {t.label}
          </button>
        )
      })}
    </div>
  )
}

function OffRow({ onClick, active }: { onClick: () => void; active: boolean }): React.JSX.Element {
  return (
    <Row onClick={onClick} active={active}>
      <Tile>
        <CloseIcon className="size-2.5 text-text-tertiary" />
      </Tile>
      <span
        className={cn(
          'flex-1 text-[13px] leading-4 text-white',
          active ? 'font-bold' : 'font-medium'
        )}
      >
        Off
      </span>
      {active ? <CheckIcon className="size-3.5 text-white" /> : null}
    </Row>
  )
}

function Row({
  onClick,
  active,
  children
}: {
  onClick: () => void
  active: boolean
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full shrink-0 items-center gap-3 overflow-hidden rounded-lg px-3 text-left outline-none',
        active ? 'bg-white/[0.08]' : 'bg-transparent'
      )}
      style={{ height: 40 }}
    >
      {children}
    </button>
  )
}

function Tile({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <div className="flex h-4 w-[22px] shrink-0 items-center justify-center rounded-[2px] bg-white/[0.08]">
      {children}
    </div>
  )
}

function EmbeddedTab({
  tracks,
  selected,
  onSelect
}: {
  tracks: EmbeddedTrack[]
  selected: SelectedSub
  onSelect: (sub: SelectedSub) => void
}): React.JSX.Element {
  const isOff = selected === null
  return (
    <div className="flex h-full flex-col gap-0.5 overflow-y-auto">
      <OffRow onClick={() => onSelect(null)} active={isOff} />
      {tracks.map((t) => {
        const active =
          selected?.source === 'embedded' &&
          selected.track.source === t.source &&
          selected.track.index === t.index
        const name = langLabel(t.lang)
        const sublabel = trackSublabel(t.label, name)
        return (
          <Row
            key={t.id}
            active={active}
            onClick={() => onSelect({ source: 'embedded', track: t })}
          >
            <FlagTile lang={t.lang} />
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span
                className={cn(
                  'truncate text-[13px] leading-4 text-white',
                  active ? 'font-bold' : 'font-medium'
                )}
              >
                {name || t.label}
              </span>
              {sublabel ? (
                <span className="truncate text-[10px] leading-3 font-medium text-white/50">
                  {sublabel}
                </span>
              ) : null}
            </div>
            {active ? <CheckIcon className="size-3.5 text-white" /> : null}
          </Row>
        )
      })}
      {tracks.length === 0 ? (
        <p className="px-3 py-6 text-center text-[12px] text-text-muted">
          No subtitle tracks in this stream.
        </p>
      ) : null}
    </div>
  )
}

function OnlineTab({
  imdbId,
  mediaType,
  season,
  episode,
  videoHash,
  videoSize,
  hashSettled,
  selected,
  onSelect
}: {
  imdbId: string
  mediaType: 'movie' | 'tv'
  season?: number
  episode?: number
  videoHash?: string
  videoSize?: number
  hashSettled: boolean
  selected: SelectedSub
  onSelect: (sub: SelectedSub) => void
}): React.JSX.Element {
  const { data, isLoading, isError } = useQuery({
    queryKey: [
      'opensubs',
      imdbId,
      mediaType,
      season,
      episode,
      videoHash ?? null,
      videoSize ?? null
    ],
    queryFn: () =>
      fetchSubtitles({
        type: mediaType === 'tv' ? 'series' : 'movie',
        imdbId,
        season,
        episode,
        videoHash,
        videoSize
      }),
    enabled: hashSettled
  })

  const grouped = useMemo(() => groupByLang(data ?? []), [data])
  const isOff = selected === null

  return (
    <div className="flex h-full flex-col gap-0.5 overflow-y-auto">
      <OffRow onClick={() => onSelect(null)} active={isOff} />
      {isLoading || !hashSettled ? (
        <div className="flex items-center justify-center py-6 text-text-muted">
          <Ring className="size-4" />
        </div>
      ) : null}
      {isError ? (
        <p className="px-3 py-6 text-center text-[12px] text-text-muted">Failed to load.</p>
      ) : null}
      {hashSettled && !isLoading && !isError && grouped.length === 0 ? (
        <p className="px-3 py-6 text-center text-[12px] text-text-muted">No subtitles found.</p>
      ) : null}
      {grouped.map((g) => {
        const active = selected?.source === 'online' && selected.lang === g.lang
        return (
          <Row
            key={g.lang}
            active={active}
            onClick={() => onSelect({ source: 'online', url: g.url, lang: g.lang })}
          >
            <FlagTile lang={g.lang} />
            <span
              className={cn(
                'flex-1 truncate text-[13px] leading-4 text-white',
                active ? 'font-bold' : 'font-medium'
              )}
            >
              {langLabel(g.lang)}
            </span>
            {active ? <CheckIcon className="size-3.5 text-white" /> : null}
          </Row>
        )
      })}
    </div>
  )
}

function LocalTab({
  selected,
  onSelect
}: {
  selected: SelectedSub
  onSelect: (sub: SelectedSub) => void
}): React.JSX.Element {
  const [busy, setBusy] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const apply = (name: string, bytes: Uint8Array): void => {
    const cues = parseSubtitle(decodeSubtitleBytes(bytes))
    if (cues.length === 0) {
      setError("Couldn't read any subtitles from that file.")
      return
    }
    setError(null)
    onSelect({ source: 'local', name, cues })
  }

  const pick = async (): Promise<void> => {
    if (busy) return
    setBusy(true)
    try {
      const res = await window.api.subtitles.pickFile()
      if (res) apply(res.name, res.bytes)
    } finally {
      setBusy(false)
    }
  }

  const onDrop = async (e: React.DragEvent): Promise<void> => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (!file) return
    setBusy(true)
    try {
      apply(file.name, new Uint8Array(await file.arrayBuffer()))
    } finally {
      setBusy(false)
    }
  }

  if (selected?.source === 'local') {
    return (
      <div className="flex h-full flex-col gap-0.5">
        <OffRow onClick={() => onSelect(null)} active={false} />
        <Row onClick={() => {}} active>
          <div className="flex h-4 w-[22px] shrink-0 items-center justify-center rounded-[2px] bg-white/[0.14]">
            <FileTextIcon className="size-3 text-white/80" />
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="truncate text-[13px] leading-4 font-bold text-white">
              {selected.name}
            </span>
            <span className="truncate text-[10px] leading-3 font-medium text-white/50">
              From your computer
            </span>
          </div>
          <CheckIcon className="size-3.5 text-white" />
        </Row>
        <button
          type="button"
          onClick={() => void pick()}
          className="flex h-10 w-full shrink-0 items-center gap-3 rounded-lg bg-transparent px-3 text-left outline-none"
        >
          <div className="flex h-4 w-[22px] shrink-0 items-center justify-center rounded-[2px] bg-white/[0.08]">
            {busy ? (
              <Ring className="size-3" />
            ) : (
              <PlusIcon className="size-2.5 text-text-tertiary" />
            )}
          </div>
          <span className="flex-1 text-[13px] leading-4 font-medium text-text-tertiary">
            Choose a different file…
          </span>
        </button>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <button
        type="button"
        onClick={() => void pick()}
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => void onDrop(e)}
        className={cn(
          'flex flex-1 flex-col items-center justify-center gap-[18px] rounded-xl border border-dashed px-7 text-center outline-none transition-colors duration-150 ease-[cubic-bezier(0.22,1,0.36,1)]',
          dragging ? 'border-white/25 bg-white/[0.04]' : 'border-white/[0.14] bg-white/[0.02]'
        )}
      >
        <div className="flex size-14 items-center justify-center rounded-[14px] bg-white/[0.06] text-white/70">
          <FileBendIcon className="size-[26px]" />
        </div>
        <div className="flex flex-col items-center gap-1.5">
          <span className="text-[15px] font-semibold text-white">Add a subtitle file</span>
          <span className="max-w-[220px] text-[12.5px] leading-[18px] font-medium text-text-muted">
            Drag a file here, or browse your computer to load it onto this episode.
          </span>
        </div>
        <div className="flex items-center justify-center gap-2.5 rounded-[9px] bg-accent px-5 py-2.5">
          {busy ? (
            <Ring className="size-4 text-black" />
          ) : (
            <UploadIcon className="size-[15px] text-black" />
          )}
          <span className="text-[13.5px] font-semibold text-black">Choose file</span>
        </div>
        {error ? (
          <span className="text-[11.5px] font-medium text-red-400">{error}</span>
        ) : (
          <div className="flex items-center gap-1.5">
            {['SRT', 'VTT', 'ASS'].map((f) => (
              <span
                key={f}
                className="rounded-[5px] bg-white/[0.06] px-2 py-1 text-[10.5px] font-semibold tracking-[0.04em] text-text-muted"
              >
                {f}
              </span>
            ))}
          </div>
        )}
      </button>
    </div>
  )
}

function StyleTab({
  style,
  onChange
}: {
  style: SubtitleStyle
  onChange: (s: SubtitleStyle) => void
}): React.JSX.Element {
  const fontFamilies: SubFontFamily[] = ['sans', 'serif', 'mono', 'casual', 'smallCaps']
  const edgeTypes: SubEdgeType[] = ['none', 'dropShadow', 'raised', 'depressed', 'uniform']

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <SectionLabel>PRESETS</SectionLabel>
      <div className="mx-2 flex flex-wrap gap-1">
        {PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => onChange({ ...p.style })}
            className="whitespace-nowrap rounded-md bg-white/[0.06] px-3 py-1.5 text-[11px] font-medium text-white outline-none hover:bg-white/[0.10]"
          >
            {p.label}
          </button>
        ))}
      </div>

      <SectionLabel>FONT</SectionLabel>
      <Segmented<SubFontFamily>
        value={style.fontFamily}
        onChange={(v) => onChange({ ...style, fontFamily: v })}
        options={fontFamilies.map((f) => ({ value: f, label: FONT_FAMILY_LABELS[f] }))}
      />

      <SectionLabel>SIZE — {style.fontSize}%</SectionLabel>
      <div className="mx-1.5 mt-1.5">
        <DialSlider
          label="Subtitle size"
          value={style.fontSize}
          min={FONT_SIZE_MIN}
          max={FONT_SIZE_MAX}
          step={5}
          onChange={(v) => onChange({ ...style, fontSize: Math.round(v) })}
        />
      </div>

      <SectionLabel>TEXT COLOR</SectionLabel>
      <ColorChips value={style.fontColor} onChange={(c) => onChange({ ...style, fontColor: c })} />

      <SectionLabel>TEXT OPACITY — {style.fontOpacity}%</SectionLabel>
      <div className="mx-1.5 mt-1.5">
        <DialSlider
          label="Text opacity"
          value={style.fontOpacity}
          min={0}
          max={100}
          step={5}
          onChange={(v) => onChange({ ...style, fontOpacity: Math.round(v) })}
        />
      </div>

      <SectionLabel>BACKGROUND COLOR</SectionLabel>
      <ColorChips value={style.bgColor} onChange={(c) => onChange({ ...style, bgColor: c })} />

      <SectionLabel>BACKGROUND OPACITY — {style.bgOpacity}%</SectionLabel>
      <div className="mx-1.5 mt-1.5">
        <DialSlider
          label="Background opacity"
          value={style.bgOpacity}
          min={0}
          max={100}
          step={5}
          onChange={(v) => onChange({ ...style, bgOpacity: Math.round(v) })}
        />
      </div>

      <SectionLabel>WINDOW COLOR</SectionLabel>
      <ColorChips
        value={style.windowColor}
        onChange={(c) => onChange({ ...style, windowColor: c })}
      />

      <SectionLabel>WINDOW OPACITY — {style.windowOpacity}%</SectionLabel>
      <div className="mx-1.5 mt-1.5">
        <DialSlider
          label="Window opacity"
          value={style.windowOpacity}
          min={0}
          max={100}
          step={5}
          onChange={(v) => onChange({ ...style, windowOpacity: Math.round(v) })}
        />
      </div>

      <SectionLabel>EDGE STYLE</SectionLabel>
      <Segmented<SubEdgeType>
        value={style.edgeType}
        onChange={(v) => onChange({ ...style, edgeType: v })}
        options={edgeTypes.map((e) => ({ value: e, label: EDGE_TYPE_LABELS[e] }))}
      />

      <SectionLabel>EDGE COLOR</SectionLabel>
      <ColorChips value={style.edgeColor} onChange={(c) => onChange({ ...style, edgeColor: c })} />

      <SectionLabel>POSITION — {style.position}%</SectionLabel>
      <div className="mx-1.5 mt-1.5 mb-1.5">
        <DialSlider
          label="Subtitle position"
          value={style.position}
          min={POSITION_MIN}
          max={POSITION_MAX}
          step={1}
          onChange={(v) => onChange({ ...style, position: Math.round(v) })}
        />
      </div>

      <div className="mx-2 mt-1 mb-2">
        <button
          type="button"
          onClick={() => onChange({ ...DEFAULT_STYLE })}
          className="w-full rounded-md bg-white/[0.04] py-2 text-[11px] font-medium text-text-tertiary outline-none hover:bg-white/[0.08] hover:text-white"
        >
          Reset to defaults
        </button>
      </div>
    </div>
  )
}

function SyncTab({
  offsetSec,
  onChange,
  enabled
}: {
  offsetSec: number
  onChange: (sec: number) => void
  enabled: boolean
}): React.JSX.Element {
  if (!enabled) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-6 text-center">
        <p className="text-[13px] leading-5 font-medium text-white/85">Subtitle sync unavailable</p>
        <p className="mt-1 text-[12px] leading-4 text-white/45">
          Pick an online or local subtitle to adjust timing.
        </p>
      </div>
    )
  }

  const bump = (delta: number): void => onChange(clampOffset(offsetSec + delta))

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="flex flex-col items-center pt-6 pb-1">
        <span className="text-[34px] leading-[40px] font-bold tracking-[-0.02em] tabular-nums text-white">
          {formatOffset(offsetSec)}
        </span>
        <span className="mt-1 text-[11px] leading-[14px] font-medium tracking-[0.08em] text-white/45 uppercase">
          Delay
        </span>
      </div>

      <div className="mx-2 mt-3 flex items-center justify-center gap-1.5">
        <NudgeButton onClick={() => bump(-0.5)} label="−0.5s" />
        <NudgeButton onClick={() => bump(-0.1)} label="−0.1s" />
        <NudgeButton onClick={() => bump(0.1)} label="+0.1s" />
        <NudgeButton onClick={() => bump(0.5)} label="+0.5s" />
      </div>

      <SectionLabel>FINE ADJUST</SectionLabel>
      <div className="mx-1.5 mt-1.5">
        <DialSlider
          label="Subtitle delay"
          value={offsetSec}
          min={OFFSET_MIN}
          max={OFFSET_MAX}
          step={OFFSET_STEP}
          onChange={(v) => onChange(clampOffset(v))}
        />
      </div>

      <SectionLabel>SHORTCUTS</SectionLabel>
      <div className="mx-3 flex flex-col gap-1.5 pb-1">
        <ShortcutRow keys={['Z']} label="−0.1s" />
        <ShortcutRow keys={['X']} label="+0.1s" />
        <ShortcutRow keys={['⇧', 'Z']} label="−0.5s" />
        <ShortcutRow keys={['⇧', 'X']} label="+0.5s" />
      </div>

      <div className="mx-2 mt-3 mb-2">
        <button
          type="button"
          onClick={() => onChange(0)}
          className="w-full rounded-md bg-white/[0.04] py-2 text-[11px] font-medium text-text-tertiary outline-none hover:bg-white/[0.08] hover:text-white"
        >
          Reset
        </button>
      </div>
    </div>
  )
}

function NudgeButton({
  onClick,
  label
}: {
  onClick: () => void
  label: string
}): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-md bg-white/[0.06] px-3 py-2 text-[12px] leading-4 font-semibold tabular-nums text-white outline-none transition-[transform,background-color] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] hover:bg-white/[0.10] active:scale-[0.97]"
    >
      {label}
    </button>
  )
}

function ShortcutRow({ keys, label }: { keys: string[]; label: string }): React.JSX.Element {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[12px] leading-4 font-medium text-white/55">{label}</span>
      <div className="flex items-center gap-1">
        {keys.map((k, i) => (
          <span
            key={i}
            className="flex h-5 min-w-[20px] items-center justify-center rounded-[5px] bg-white/[0.08] px-1 text-[10px] leading-3 font-semibold text-white/85"
          >
            {k}
          </span>
        ))}
      </div>
    </div>
  )
}

function ColorChips({
  value,
  onChange
}: {
  value: string
  onChange: (color: string) => void
}): React.JSX.Element {
  return (
    <div className="mx-2 flex gap-2.5">
      {PALETTE_COLORS.map((c) => {
        const active = c.value.toUpperCase() === value.toUpperCase()
        return (
          <button
            key={c.value}
            type="button"
            onClick={() => onChange(c.value)}
            aria-label={c.name}
            title={c.name}
            className="relative flex size-6 shrink-0 items-center justify-center rounded-full outline-none transition-[filter] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)]"
            style={{ backgroundColor: c.value, filter: active ? 'brightness(0.82)' : undefined }}
          >
            <AnimatePresence initial={false}>
              {active ? (
                <motion.svg
                  key="check"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="white"
                  strokeWidth={3}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="size-3.5"
                  style={{ mixBlendMode: 'difference' }}
                  initial={{ opacity: 0, scale: 0.94 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, transition: { duration: 0.07, ease: EASE_IN } }}
                  transition={{ duration: 0.14, ease: EASE_OUT }}
                >
                  <path d="M5 13l4 4L19 7" />
                </motion.svg>
              ) : null}
            </AnimatePresence>
          </button>
        )
      })}
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <div className="px-3 pt-5 pb-1.5 first:pt-2">
      <span className="text-[11px] leading-[14px] font-bold tracking-[0.08em] text-white/50 uppercase">
        {children}
      </span>
    </div>
  )
}

function Segmented<T extends string>({
  value,
  onChange,
  options
}: {
  value: T
  onChange: (v: T) => void
  options: { value: T; label: string }[]
}): React.JSX.Element {
  const wraps = options.some((o) => o.label.includes(' ') || o.label.length > 8)
  if (wraps) {
    return (
      <div className="mx-2 flex flex-wrap gap-1">
        {options.map((o) => {
          const active = o.value === value
          return (
            <button
              key={o.value}
              type="button"
              onClick={() => onChange(o.value)}
              className={cn(
                'whitespace-nowrap rounded-md px-3 py-1.5 text-[11px] leading-4 outline-none',
                active
                  ? 'bg-white/[0.12] font-bold text-white'
                  : 'bg-white/[0.04] font-medium text-text-tertiary hover:bg-white/[0.08]'
              )}
            >
              {o.label}
            </button>
          )
        })}
      </div>
    )
  }
  return (
    <div className="mx-2 flex gap-0.5 rounded-lg bg-white/[0.04] p-[3px]">
      {options.map((o) => {
        const active = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className={cn(
              'grow basis-0 whitespace-nowrap rounded-md px-2 py-1.5 text-center text-[11px] leading-4 outline-none',
              active ? 'bg-white/[0.12] font-bold text-white' : 'font-medium text-text-tertiary'
            )}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

function groupByLang(subs: Subtitle[]): Array<{ lang: string; url: string; count: number }> {
  const map = new Map<string, { lang: string; url: string; count: number }>()
  for (const s of subs) {
    const lang = (s.lang || 'unknown').toLowerCase()
    const cur = map.get(lang)
    if (cur) cur.count += 1
    else map.set(lang, { lang, url: s.url, count: 1 })
  }
  return Array.from(map.values()).toSorted((a, b) => b.count - a.count)
}

function trackSublabel(rawLabel: string, langName: string): string {
  const trimmed = rawLabel.trim()
  if (!trimmed) return ''
  if (trimmed.toLowerCase() === langName.toLowerCase()) return ''
  if (/^track\s+\d+$/i.test(trimmed)) return ''
  return trimmed
}

function FileBendIcon({ className }: { className?: string }): React.JSX.Element {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path
        d="M11.9216 2.75H6.75C5.64543 2.75 4.75 3.64543 4.75 4.75V19.25C4.75 20.3546 5.64543 21.25 6.75 21.25H17.25C18.3546 21.25 19.25 20.3546 19.25 19.25V10.0784C19.25 9.54799 19.0393 9.03929 18.6642 8.66421L13.3358 3.33579C12.9607 2.96071 12.452 2.75 11.9216 2.75Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M12.75 3.25V7.25C12.75 8.35457 13.6454 9.25 14.75 9.25H18.75"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function UploadIcon({ className }: { className?: string }): React.JSX.Element {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path
        d="M12 3.75V15M12 3.75L16.5 8.25M12 3.75L7.5 8.25M20.25 14.75V18.25C20.25 19.3546 19.3546 20.25 18.25 20.25H5.75C4.64543 20.25 3.75 19.3546 3.75 18.25V14.75"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function FileTextIcon({ className }: { className?: string }): React.JSX.Element {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path
        d="M11.9216 2.75H6.75C5.64543 2.75 4.75 3.64543 4.75 4.75V19.25C4.75 20.3546 5.64543 21.25 6.75 21.25H17.25C18.3546 21.25 19.25 20.3546 19.25 19.25V10.0784C19.25 9.54799 19.0393 9.03929 18.6642 8.66421L13.3358 3.33579C12.9607 2.96071 12.452 2.75 11.9216 2.75Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path
        d="M12.75 3.25V7.25C12.75 8.35457 13.6454 9.25 14.75 9.25H18.75"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path d="M8.75 13.25H12.25" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M8.75 17.25H15.25" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

function CcGlyph(): React.JSX.Element {
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
