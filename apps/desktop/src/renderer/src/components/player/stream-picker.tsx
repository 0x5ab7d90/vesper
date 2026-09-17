import { useMemo, useState } from 'react'
import { Dialog } from '@base-ui/react/dialog'
import { useQuery } from '@tanstack/react-query'
import { ConvexError } from 'convex/values'
import { AnimatePresence, m as motion, useReducedMotion } from 'motion/react'
import { CloseIcon } from '@renderer/components/icons'
import { DitherCorner } from '@renderer/components/brand/dither-corner'
import { Ring } from '@renderer/components/ui/spinner'
import { SkeletonSwap } from '@renderer/components/ui/skeleton-swap'
import { cn } from '@renderer/lib/cn'
import { fetchMovieStreams, fetchSeriesStreams, type ParsedStream } from '@renderer/lib/streams'

function ZapIcon({ className }: { className?: string }): React.JSX.Element {
  return (
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <path
        d="M13.9992 2.35561C13.9992 1.12899 12.4165 0.636187 11.7202 1.64595L3.17236 14.0403C2.60048 14.8695 3.19407 15.9999 4.20137 15.9999H9.99917V21.6442C9.99917 22.8708 11.5818 23.3637 12.2782 22.3539L20.826 9.95958C21.3979 9.13036 20.8043 7.99992 19.797 7.99992H13.9992V2.35561Z"
        fill="currentColor"
      />
    </svg>
  )
}
import { Segmented } from '@renderer/components/ui/segmented'
import { sortStreams, STREAM_SORTS, type StreamSort } from '@renderer/lib/stream-picker'
import { readStreamSort, writeStreamSort } from '@renderer/lib/player-prefs'
import { resolveStreamUrl, type StreamContext } from '@renderer/lib/resolve-stream'
import { squircleStyle } from '@renderer/components/ui/squircle-surface'

const POP = { type: 'spring', stiffness: 400, damping: 26 } as const

interface StreamPickerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  mediaType: 'movie' | 'tv'
  imdbId: string
  tmdbId?: number
  season?: number
  episode?: number
  onPicked: (args: { url: string; stream: ParsedStream }) => void
}

export function StreamPicker(props: StreamPickerProps): React.JSX.Element {
  return (
    <Dialog.Root open={props.open} onOpenChange={props.onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" />
        <Dialog.Popup
          aria-label="Select source"
          className="fixed top-1/2 left-1/2 z-50 w-[440px] -translate-x-1/2 -translate-y-1/2 outline-none"
        >
          {/* Squircle frame holding a recessed inset — the surface anatomy shared with the
              feedback modal. The list scrolls inside the inset; the frame never grows. */}
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={POP}
            className="relative flex h-[560px] flex-col border border-white/[0.06] bg-surface-2 p-1.5 shadow-[0_24px_64px_rgba(0,0,0,0.5)]"
            style={squircleStyle('frame')}
          >
            <DitherCorner />
            {props.open ? <PickerBody {...props} /> : null}
          </motion.div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

function PickerBody(props: StreamPickerProps): React.JSX.Element {
  const { title, mediaType, imdbId, tmdbId, season, episode, onPicked, onOpenChange } = props
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [resolving, setResolving] = useState(false)
  const [pickError, setPickError] = useState<string | null>(null)
  const [sort, setSort] = useState<StreamSort>(() => readStreamSort())

  const handleSortChange = (next: StreamSort): void => {
    setSort(next)
    writeStreamSort(next)
  }

  const streamsQuery = useQuery({
    queryKey: ['streams', mediaType, imdbId, season, episode],
    queryFn: () =>
      mediaType === 'movie'
        ? fetchMovieStreams(imdbId)
        : fetchSeriesStreams(imdbId, season ?? 1, episode ?? 1, tmdbId),
    staleTime: 30 * 60_000,
    retry: 1
  })

  const sorted = useMemo(() => {
    const s = streamsQuery.data ?? []
    // Drop 4K Dolby Vision — WebCodecs cannot decode DV (keep 4K HDR10/SDR).
    // Cap the list to keep it off the perf cliff.
    return sortStreams(
      s.filter((x) => x.qualityTier !== '4K-DV'),
      sort
    ).slice(0, 60)
  }, [streamsQuery.data, sort])

  const context = useMemo<StreamContext>(
    () => ({ mediaType, imdbId, season, episode, tmdbId }),
    [mediaType, imdbId, season, episode, tmdbId]
  )

  const handlePick = async (stream: ParsedStream): Promise<void> => {
    setSelectedId(stream.playbackHash)
    setResolving(true)
    setPickError(null)
    try {
      const url = await resolveStreamUrl({ stream, context })
      onOpenChange(false)
      onPicked({ url, stream })
    } catch (e) {
      console.error('[picker] pick failed', e)
      // The action sends anything actionable as a ConvexError; everything else is a bug
      // on our side and the viewer only needs to know the pick did not take.
      setPickError(
        e instanceof ConvexError && typeof e.data === 'string'
          ? e.data
          : 'Could not start that stream. Try another one.'
      )
    } finally {
      setResolving(false)
    }
  }

  return (
    <div className="relative flex h-full min-h-0 flex-col">
      <div className="shrink-0 pt-1.5 pb-1.5">
        <div className="flex items-center justify-between pl-2.5 pr-1">
          <h2 className="min-w-0 truncate text-[15px] leading-4 font-medium tracking-[-0.01em] text-text">
            {title}
          </h2>
          <Dialog.Close className="flex size-7 items-center justify-center rounded-full text-text-muted outline-none transition-colors duration-150 ease-out hover:bg-white/[0.08] hover:text-white">
            <CloseIcon className="size-3.5" />
          </Dialog.Close>
        </div>
      </div>
      <div
        className="flex min-h-0 flex-1 flex-col border border-white/[0.05] bg-surface"
        style={squircleStyle('inset')}
      >
        {/* The sort tabs live inside the inset: its solid surface keeps them legible under
            the frame's dither, and the list reads as one panel with its controls. */}
        <Segmented<StreamSort>
          className="mx-1.5 mt-1.5 shrink-0"
          value={sort}
          onChange={handleSortChange}
          options={STREAM_SORTS}
        />
        <SkeletonSwap
          ready={!streamsQuery.isLoading}
          reserve="auto"
          label="Sources"
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
            {/* A pick that did not take is a standing condition until the next one, so it
                sits above the list rather than passing by as a toast. */}
            {pickError ? (
              <div
                role="status"
                className="mx-0.5 mb-1 rounded-[10px] bg-white/[0.05] px-3 py-2 text-[12px] leading-4 text-text"
              >
                {pickError}
              </div>
            ) : null}
            {streamsQuery.isError ? (
              <p className="px-3 py-6 text-center text-[13px] text-text-muted">
                Failed to load streams.
              </p>
            ) : null}
            {!streamsQuery.isLoading && !streamsQuery.isError && sorted.length === 0 ? (
              <p className="px-3 py-6 text-center text-[13px] text-text-muted">No streams found.</p>
            ) : null}
            <AnimatePresence initial={false} mode="popLayout">
              {sorted.map((s) => (
                <Row
                  key={s.playbackHash}
                  stream={s}
                  selected={s.playbackHash === selectedId}
                  busy={resolving && s.playbackHash === selectedId}
                  onClick={() => void handlePick(s)}
                />
              ))}
            </AnimatePresence>
          </div>
        </SkeletonSwap>
      </div>
    </div>
  )
}

function SkeletonRow(): React.JSX.Element {
  return (
    <div className="flex items-center justify-between gap-2.5 rounded-[10px] py-2.5 pr-3 pl-2.5">
      <div className="flex min-w-0 grow items-center gap-2.5">
        <span className="h-5 w-14 shrink-0 animate-pulse rounded-md bg-white/[0.06]" />
        <span className="h-4 grow animate-pulse rounded bg-white/[0.06]" />
      </div>
      <span className="h-3 w-8 shrink-0 animate-pulse rounded bg-white/[0.06]" />
    </div>
  )
}

const ROW_ANIM = {
  duration: 0.18,
  ease: [0.23, 1, 0.32, 1] as [number, number, number, number]
}

function Row({
  stream,
  selected,
  busy,
  onClick
}: {
  stream: ParsedStream
  selected: boolean
  busy: boolean
  onClick: () => void
}): React.JSX.Element {
  const reduced = useReducedMotion()
  return (
    <motion.button
      type="button"
      layout={reduced ? false : true}
      initial={reduced ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={ROW_ANIM}
      onClick={onClick}
      disabled={busy}
      className={cn(
        'flex items-center justify-between gap-2.5 rounded-[10px] py-2.5 pr-3 pl-2.5 text-left outline-none transition-colors',
        selected ? 'bg-white/[0.08]' : 'bg-transparent hover:bg-white/[0.04]'
      )}
    >
      <div className="flex min-w-0 grow items-center gap-2.5 overflow-hidden">
        <span className="flex h-5 w-14 shrink-0 items-center justify-center rounded-md bg-white/[0.08] text-[11px] leading-3.5 font-medium tracking-[0.02em] text-text">
          {stream.qualityLabel}
        </span>
        <span className="grow truncate text-left text-[13px] leading-4 font-medium text-text">
          {stream.titleLine || stream.filename || 'Untitled'}
        </span>
      </div>
      {busy ? (
        <span className="shrink-0">
          <Ring className="size-3" />
        </span>
      ) : (
        <ZapIcon className="size-3.5 shrink-0 text-text-tertiary" />
      )}
    </motion.button>
  )
}
