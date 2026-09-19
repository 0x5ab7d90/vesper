import { ContextMenu } from '@base-ui/react/context-menu'
import { cn } from '@renderer/lib/cn'
import { CheckIcon } from '@renderer/components/icons'
import { PLAYBACK_SPEEDS } from '@renderer/lib/player-prefs'
import {
  ANIME4K_PRESETS,
  ANIME4K_PRESET_LABELS,
  type Anime4kPreset,
  type Anime4kStatus
} from '@renderer/lib/player/anime4k'
import { squircleStyle } from '@renderer/components/ui/squircle-surface'

interface Props {
  statsVisible: boolean
  onToggleStats: () => void
  playbackSpeed: number
  onSetSpeed: (speed: number) => void
  anime4kValue: Anime4kPreset | 'off'
  anime4kStatus: Anime4kStatus | null
  onSetAnime4k: (v: Anime4kPreset | 'off') => void
  onScreenshot: () => void
  onReload: () => void
  onShowShortcuts: () => void
}

function anime4kNote(status: Anime4kStatus | null): string | null {
  if (!status) return null
  if (status.kind === 'suspended') return 'Off for this session — playback struggled'
  if (status.kind !== 'bypassed') return null
  return status.reason === 'hdr'
    ? 'Not applied — HDR source'
    : 'Not applied — already at full resolution'
}

const popupClass =
  'min-w-[220px] origin-[var(--transform-origin)] bg-[#1a1a1aF2] p-1 text-white shadow-xl backdrop-blur-2xl outline-none transition-[scale,opacity] duration-100 ease-(--ease-out) data-[starting-style]:scale-95 data-[starting-style]:opacity-0 data-[ending-style]:scale-[0.98] data-[ending-style]:opacity-0 data-[ending-style]:duration-50'

const popupStyle = squircleStyle('frame-sm')

const itemClass =
  'flex h-8 items-center justify-between gap-3 rounded-md px-2.5 text-[12.5px] leading-4 font-medium outline-none select-none data-[highlighted]:bg-white/[0.08] data-[disabled]:text-white/30'

export function PlayerContextMenuPopup({
  statsVisible,
  onToggleStats,
  playbackSpeed,
  onSetSpeed,
  anime4kValue,
  anime4kStatus,
  onSetAnime4k,
  onScreenshot,
  onReload,
  onShowShortcuts
}: Props): React.JSX.Element {
  const anime4kBypassNote = anime4kValue !== 'off' ? anime4kNote(anime4kStatus) : null
  return (
    <ContextMenu.Portal>
      <ContextMenu.Positioner className="z-[100] outline-none">
        {/* The trigger is a non-focusable fullscreen div, so default close-focus restoration
            falls through to the first tabbable in the document — the shell's search input
            under the player, whose focus opens the search popover. Don't move focus at all. */}
        <ContextMenu.Popup className={popupClass} style={popupStyle} finalFocus={false}>
          <ContextMenu.Item className={itemClass} onClick={onToggleStats}>
            <span>Stats for nerds</span>
            {statsVisible ? <CheckIcon className="size-3.5 text-white" /> : null}
          </ContextMenu.Item>

          <ContextMenu.SubmenuRoot>
            <ContextMenu.SubmenuTrigger className={itemClass}>
              <span>Playback speed</span>
              <span className="flex items-center gap-1 text-white/55">
                <span className="tabular-nums">{playbackSpeed}×</span>
                <CaretRight />
              </span>
            </ContextMenu.SubmenuTrigger>
            <ContextMenu.Portal>
              <ContextMenu.Positioner
                className="z-[120] outline-none"
                sideOffset={8}
                alignOffset={-6}
              >
                <ContextMenu.Popup className={popupClass} style={popupStyle}>
                  {PLAYBACK_SPEEDS.map((s) => (
                    <ContextMenu.Item key={s} className={itemClass} onClick={() => onSetSpeed(s)}>
                      <span className="tabular-nums">{s === 1 ? 'Normal (1×)' : `${s}×`}</span>
                      {s === playbackSpeed ? <CheckIcon className="size-3.5 text-white" /> : null}
                    </ContextMenu.Item>
                  ))}
                </ContextMenu.Popup>
              </ContextMenu.Positioner>
            </ContextMenu.Portal>
          </ContextMenu.SubmenuRoot>

          <ContextMenu.SubmenuRoot>
            <ContextMenu.SubmenuTrigger className={itemClass}>
              <span>Anime4K</span>
              <span className="flex items-center gap-1 text-white/55">
                <span>{anime4kValue === 'off' ? 'Off' : ANIME4K_PRESET_LABELS[anime4kValue]}</span>
                <CaretRight />
              </span>
            </ContextMenu.SubmenuTrigger>
            <ContextMenu.Portal>
              <ContextMenu.Positioner
                className="z-[120] outline-none"
                sideOffset={8}
                alignOffset={-6}
              >
                <ContextMenu.Popup className={popupClass} style={popupStyle}>
                  <ContextMenu.Item className={itemClass} onClick={() => onSetAnime4k('off')}>
                    <span>Off</span>
                    {anime4kValue === 'off' ? <CheckIcon className="size-3.5 text-white" /> : null}
                  </ContextMenu.Item>
                  {ANIME4K_PRESETS.map((p) => (
                    <ContextMenu.Item key={p} className={itemClass} onClick={() => onSetAnime4k(p)}>
                      <span>{ANIME4K_PRESET_LABELS[p]}</span>
                      {p === anime4kValue ? <CheckIcon className="size-3.5 text-white" /> : null}
                    </ContextMenu.Item>
                  ))}
                  {anime4kBypassNote ? (
                    <>
                      <Separator />
                      <div className="px-2.5 py-1.5 text-[11px] leading-4 font-medium text-white/45">
                        {anime4kBypassNote}
                      </div>
                    </>
                  ) : null}
                </ContextMenu.Popup>
              </ContextMenu.Positioner>
            </ContextMenu.Portal>
          </ContextMenu.SubmenuRoot>

          <Separator />

          <ContextMenu.Item className={itemClass} onClick={onScreenshot}>
            <span>Copy frame to clipboard</span>
          </ContextMenu.Item>
          <ContextMenu.Item className={itemClass} onClick={onReload}>
            <span>Reload stream</span>
          </ContextMenu.Item>

          <Separator />

          <ContextMenu.Item className={itemClass} onClick={onShowShortcuts}>
            <span>Keyboard shortcuts</span>
          </ContextMenu.Item>
        </ContextMenu.Popup>
      </ContextMenu.Positioner>
    </ContextMenu.Portal>
  )
}

function Separator(): React.JSX.Element {
  return <ContextMenu.Separator className={cn('mx-1 my-1 h-px bg-white/10')} />
}

function CaretRight(): React.JSX.Element {
  return (
    <svg
      viewBox="0 0 24 24"
      width="12"
      height="12"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <path
        d="M9 4L15.58 10.58C16.36 11.36 16.36 12.63 15.58 13.41L9 20"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
