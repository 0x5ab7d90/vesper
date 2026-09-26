import { useRef, useState } from 'react'
import { AnimatePresence, m as motion, useReducedMotion } from 'motion/react'
import { cn } from '@renderer/lib/cn'
import { EXIT_FADE } from '@renderer/lib/motion'
import { Ring } from '@renderer/components/ui/spinner'
import { SkeletonSwap } from '@renderer/components/ui/skeleton-swap'
import { FlagTile } from '@renderer/components/player/flag-tile'
import { GlobeIcon, PickerFrame, SkeletonRow } from '@renderer/components/player/stream-picker'
import { CHIP_CLASS, ROW_ANIM, ROW_CLASS } from '@renderer/components/player/picker-rows'
import {
  fightStreamLang,
  streamKey,
  type FightMatch,
  type FightStream
} from '@renderer/lib/fights/api'
import { useFightStreams } from '@renderer/lib/fights/use-fight-streams'

// The fight's streams in the picker titles use, without the sort tabs: one
// list, ranked the way the player ranks them, from streamed.st and the other
// fight sites alike. A pick is resolved here, so a stream that isn't on the
// air says so in place and the viewer picks another without leaving.

export function FightStreamPicker({
  match,
  open,
  onOpenChange,
  onPicked
}: {
  match: FightMatch | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onPicked: (args: { stream: FightStream; url: string }) => void
}): React.JSX.Element {
  return (
    <PickerFrame open={open && !!match} onOpenChange={onOpenChange} title={match?.title ?? ''}>
      {match ? <PickerBody match={match} onOpenChange={onOpenChange} onPicked={onPicked} /> : null}
    </PickerFrame>
  )
}

function PickerBody({
  match,
  onOpenChange,
  onPicked
}: {
  match: FightMatch
  onOpenChange: (open: boolean) => void
  onPicked: (args: { stream: FightStream; url: string }) => void
}): React.JSX.Element {
  const { ranked, settled } = useFightStreams(match)

  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [resolving, setResolving] = useState(false)
  const [pickError, setPickError] = useState<string | null>(null)
  const pickRef = useRef(0)

  // Read once when the picker opens: whether the fight has started yet.
  const [openedAt] = useState(() => Date.now())
  const early = match.date > openedAt
  const startTime = new Date(match.date).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit'
  })

  const handlePick = async (stream: FightStream): Promise<void> => {
    // Only the latest pick may hand over; an earlier one still resolving is dropped.
    const pick = ++pickRef.current
    setSelectedKey(streamKey(stream))
    setResolving(true)
    setPickError(null)
    try {
      const url = await window.api.embed.resolveStream(stream.embedUrl, {
        referer: stream.referer
      })
      if (pick !== pickRef.current) return
      onOpenChange(false)
      onPicked({ stream, url })
    } catch {
      if (pick !== pickRef.current) return
      setPickError(
        early
          ? `That stream isn't on yet. The fight starts at ${startTime}; try another or come back closer to then.`
          : 'That stream is not answering. Try another one.'
      )
    } finally {
      if (pick === pickRef.current) setResolving(false)
    }
  }

  // Rows land as each source answers; the skeleton holds until the first row
  // does, or until every source has answered with none.
  const loading = ranked.length === 0 && !settled

  return (
    <SkeletonSwap
      ready={!loading}
      reserve="auto"
      label="Streams"
      className="scroll-hide min-h-0 flex-1 overflow-y-auto overscroll-contain px-1.5 py-1.5"
      skeleton={
        <div className="flex flex-col gap-0.5">
          {Array.from({ length: 12 }).map((_, i) => (
            <SkeletonRow key={i} />
          ))}
        </div>
      }
    >
      <div className="flex flex-col gap-0.5">
        {pickError ? (
          <div
            role="status"
            className="mx-0.5 mb-1 rounded-[10px] bg-white/[0.05] px-3 py-2 text-[12px] leading-4 text-text"
          >
            {pickError}
          </div>
        ) : early && ranked.length > 0 ? (
          <div
            role="status"
            className="mx-0.5 mb-1 rounded-[10px] bg-white/[0.05] px-3 py-2 text-[12px] leading-4 text-text"
          >
            Starts at {startTime}. Some streams go up early.
          </div>
        ) : null}
        {!loading && ranked.length === 0 ? (
          <p className="px-3 py-6 text-center text-[13px] text-text-muted">
            {early
              ? `No streams for this fight yet. It starts at ${startTime}.`
              : 'No streams for this fight right now.'}
          </p>
        ) : null}
        <AnimatePresence initial={false} mode="popLayout">
          {ranked.map((stream) => {
            const key = streamKey(stream)
            return (
              <FightRow
                key={key}
                stream={stream}
                selected={key === selectedKey}
                busy={resolving && key === selectedKey}
                onClick={() => void handlePick(stream)}
              />
            )
          })}
        </AnimatePresence>
      </div>
    </SkeletonSwap>
  )
}

// A web row's anatomy: quality chip, flag, the stream's own name; the site it
// comes from (and its audience, where the site counts one) sits by the globe.
function FightRow({
  stream,
  selected,
  busy,
  onClick
}: {
  stream: FightStream
  selected: boolean
  busy: boolean
  onClick: () => void
}): React.JSX.Element {
  const reduced = useReducedMotion()
  const lang = fightStreamLang(stream)
  const detail = [
    stream.viewers ? `${stream.viewers.toLocaleString()} watching` : null,
    stream.site
  ]
    .filter(Boolean)
    .join(' · ')
  return (
    <motion.button
      type="button"
      layout={reduced ? false : true}
      initial={reduced ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={EXIT_FADE}
      transition={ROW_ANIM}
      onClick={onClick}
      disabled={busy}
      className={cn(
        ROW_CLASS,
        selected ? 'bg-white/[0.08]' : 'bg-transparent hover:bg-white/[0.04]'
      )}
    >
      <div className="flex min-w-0 grow items-center gap-2.5 overflow-hidden">
        <span className={CHIP_CLASS}>{stream.hd ? 'HD' : 'SD'}</span>
        {lang ? <FlagTile lang={lang} /> : null}
        <span className="grow truncate text-[13px] leading-4 font-medium text-text">
          {stream.language}
        </span>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        {detail ? (
          <span className="text-[11px] leading-3.5 text-text-tertiary tabular-nums">{detail}</span>
        ) : null}
        {busy ? <Ring className="size-3" /> : <GlobeIcon className="size-3.5 text-text-tertiary" />}
      </div>
    </motion.button>
  )
}
