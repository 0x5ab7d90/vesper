import { useMemo, useState } from 'react'
import { Dialog } from '@base-ui/react/dialog'
import { useQuery } from '@tanstack/react-query'
import { ConvexError } from 'convex/values'
import { AnimatePresence, m as motion, useReducedMotion } from 'motion/react'
import { CloseIcon } from '@renderer/components/icons'
import { DitherCorner } from '@renderer/components/brand/dither-corner'
import { Ring } from '@renderer/components/ui/spinner'
import { SkeletonSwap } from '@renderer/components/ui/skeleton-swap'
import { SimpleTooltip } from '@renderer/components/ui/simple-tooltip'
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

// Central Icons "globe" (filled) — the web counterpart of the zap.
function GlobeIcon({ className }: { className?: string }): React.JSX.Element {
  return (
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <path
        d="M2.01172 11.4999H7.50425C7.55471 8.88748 7.99882 6.51304 8.70676 4.74318C9.08264 3.8035 9.54271 3.0095 10.0792 2.44224C10.1872 2.32799 10.2998 2.2216 10.4166 2.12452C5.80637 2.85765 2.24603 6.74151 2.01172 11.4999Z"
        fill="currentColor"
      />
      <path
        d="M2.01172 12.4999C2.24603 17.2584 5.80637 21.1422 10.4166 21.8754C10.2998 21.7783 10.1872 21.6719 10.0792 21.5577C9.54271 20.9904 9.08264 20.1964 8.70676 19.2567C7.99882 17.4868 7.55471 15.1124 7.50425 12.4999H2.01172Z"
        fill="currentColor"
      />
      <path
        d="M13.5823 21.8754C18.1925 21.1423 21.7528 17.2584 21.9872 12.4999H16.4946C16.4441 15.1124 16 17.4868 15.2921 19.2567C14.9162 20.1964 14.4561 20.9904 13.9197 21.5577C13.8116 21.6719 13.6991 21.7783 13.5823 21.8754Z"
        fill="currentColor"
      />
      <path
        d="M21.9872 11.4999C21.7528 6.7415 18.1925 2.85764 13.5823 2.12451C13.6991 2.22159 13.8116 2.32799 13.9197 2.44224C14.4561 3.0095 14.9162 3.8035 15.2921 4.74318C16 6.51304 16.4441 8.88748 16.4946 11.4999H21.9872Z"
        fill="currentColor"
      />
      <path
        d="M13.1931 3.12935C12.7735 2.68561 12.3699 2.49995 11.9994 2.49995C11.6289 2.49995 11.2254 2.68561 10.8057 3.12935C10.3851 3.57415 9.98322 4.24461 9.63524 5.11457C8.98333 6.74434 8.55491 8.98758 8.50444 11.4999H15.4944C15.4439 8.98758 15.0155 6.74434 14.3636 5.11457C14.0156 4.24461 13.6138 3.57415 13.1931 3.12935Z"
        fill="currentColor"
      />
      <path
        d="M14.3636 18.8853C15.0155 17.2556 15.4439 15.0123 15.4944 12.4999H8.50444C8.55491 15.0123 8.98333 17.2556 9.63524 18.8853C9.98322 19.7553 10.3851 20.4257 10.8057 20.8705C11.2254 21.3143 11.6289 21.4999 11.9994 21.4999C12.3699 21.4999 12.7735 21.3143 13.1931 20.8705C13.6138 20.4257 14.0156 19.7553 14.3636 18.8853Z"
        fill="currentColor"
      />
    </svg>
  )
}
// Central Icons "bee" (filled, stroke 2, large corners) — marks a row from an anime site.
function BeeIcon({ className }: { className?: string }): React.JSX.Element {
  return (
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <path
        d="M8.1426 2.76465C7.85845 2.29107 8.01202 1.67681 8.4856 1.39266C8.95918 1.10851 9.57344 1.26208 9.85759 1.73566L11.3576 4.23566C11.4155 4.33221 11.4553 4.4346 11.4778 4.53886C11.6482 4.51336 11.8226 4.50015 12.0001 4.50015C12.1776 4.50015 12.352 4.51336 12.5224 4.53886C12.5449 4.4346 12.5847 4.33221 12.6426 4.23566L14.1426 1.73566C14.4267 1.26208 15.041 1.10851 15.5146 1.39266C15.9882 1.67681 16.1417 2.29107 15.8576 2.76465L14.3576 5.26465C14.3382 5.29704 14.3172 5.32794 14.2948 5.3573C15.0332 5.999 15.5001 6.94505 15.5001 8.00015C15.5001 8.00012 15.5001 8.00018 15.5001 8.00015C15.5001 8.97473 15.1017 9.85634 14.459 10.4909C13.9228 11.0202 13.2167 11.3777 12.4298 11.474C12.4298 11.474 12.4298 11.4741 12.4298 11.474C12.2889 11.4913 12.1455 11.5002 12 11.5002C11.8545 11.5002 11.7111 11.4913 11.5702 11.4741C11.5702 11.4741 11.5702 11.4741 11.5702 11.4741C10.7834 11.3777 10.0773 11.0202 9.54125 10.4909C9.54124 10.4909 9.54125 10.491 9.54125 10.4909C9.39039 10.342 9.25302 10.1797 9.13107 10.0055C9.13103 10.0055 9.13112 10.0055 9.13107 10.0055C8.73335 9.4376 8.50009 8.74613 8.50009 8.00015C8.50009 6.94505 8.96696 5.99899 9.70539 5.35729C9.68302 5.32793 9.66204 5.29704 9.6426 5.26465L8.1426 2.76465Z"
        fill="currentColor"
      />
      <path
        d="M6.99968 10.294C3.9338 11.0977 2.47471 13.5083 2.1 17.0032C1.98225 18.1015 2.90483 19.0293 3.99168 18.8322C7.41879 18.2107 9.09413 15.9201 9.4835 12.892C8.39243 12.3296 7.51379 11.4129 6.99968 10.294Z"
        fill="currentColor"
      />
      <path
        d="M11.38 13.4657C11.1326 14.8551 10.6334 16.1679 9.8023 17.3053C9.30503 17.9857 8.71494 18.5686 8.03835 19.051C8.25207 19.4391 8.49613 19.7972 8.768 20.1176C9.36688 20.8235 10.1262 21.3714 11 21.6139V22.0002C11 22.5525 11.4477 23.0002 12 23.0002C12.5523 23.0002 13 22.5525 13 22.0002V21.6139C13.8738 21.3714 14.6331 20.8235 15.2319 20.1176C15.5038 19.7971 15.7479 19.4391 15.9616 19.0509C15.285 18.5685 14.695 17.9857 14.1977 17.3053C13.3666 16.1679 12.8675 14.8551 12.62 13.4657C12.4165 13.4885 12.2096 13.5002 12 13.5002C11.7904 13.5002 11.5835 13.4885 11.38 13.4657Z"
        fill="currentColor"
      />
      <path
        d="M14.5167 12.892C14.906 15.9201 16.5814 18.2107 20.0085 18.8322C21.0954 19.0293 22.0167 18.1021 21.9155 17.0021C21.5803 13.3597 20.2059 11.0149 17.0146 10.2628C16.5025 11.3958 15.6178 12.3243 14.5167 12.892Z"
        fill="currentColor"
      />
    </svg>
  )
}

import { Segmented } from '@renderer/components/ui/segmented'
import { mergePickerItems, STREAM_SORTS, type StreamSort } from '@renderer/lib/stream-picker'
import { readStreamSort, writeStreamSort } from '@renderer/lib/player-prefs'
import { resolveStreamUrl, type StreamContext } from '@renderer/lib/resolve-stream'
import { squircleStyle } from '@renderer/components/ui/squircle-surface'
import { useWebStreams, webQualityLabel, type WebStream } from '@renderer/lib/web-sources'
import { FlagTile } from './flag-tile'
import { EASE_OUT, EXIT_FADE } from '@renderer/lib/motion'

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
  /** Release year — the web source API matches on title and year alongside the TMDB id. */
  year?: number
  onPicked: (args: { url: string; stream: ParsedStream }) => void
  /** A web source was chosen instead of a cached file — plays through the HLS route. */
  onPickedWeb?: (args: { stream: WebStream }) => void
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
            className="relative flex h-[560px] flex-col bg-surface-2 p-1.5 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06),0_24px_64px_rgba(0,0,0,0.5)]"
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
  const {
    title,
    mediaType,
    imdbId,
    tmdbId,
    season,
    episode,
    year,
    onPicked,
    onPickedWeb,
    onOpenChange
  } = props
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

  // Web sources key on the TMDB id; without one there is nothing to ask for.
  // The title the API matches on is the bare name, not the picker's heading.
  const webEnabled = tmdbId !== undefined && onPickedWeb !== undefined
  const web = useWebStreams(
    {
      title: title.split(' · ')[0] ?? title,
      mediaType,
      tmdbId: tmdbId ?? 0,
      imdbId,
      year,
      season,
      episode
    },
    webEnabled
  )

  // A remembered web tab means nothing on a title with no web sources.
  const effectiveSort: StreamSort = !webEnabled && sort === 'web' ? 'default' : sort

  const items = useMemo(() => {
    const s = streamsQuery.data ?? []
    // Drop 4K Dolby Vision — WebCodecs cannot decode DV (keep 4K HDR10/SDR).
    // Cap the cached list to keep it off the perf cliff.
    const cached = s.filter((x) => x.qualityTier !== '4K-DV').slice(0, 60)
    return mergePickerItems(cached, web.streams, effectiveSort)
  }, [streamsQuery.data, web.streams, effectiveSort])

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

  const handlePickWeb = (stream: WebStream): void => {
    onOpenChange(false)
    onPickedWeb?.({ stream })
  }

  // The web tab shows its skeleton only until the first server answers; every
  // other tab shows the cached list as soon as it lands and lets web rows join
  // it as they arrive.
  const webOnly = effectiveSort === 'web'
  const loading = webOnly ? !web.done && web.streams.length === 0 : streamsQuery.isLoading
  const failed = webOnly ? web.error : streamsQuery.isError && items.length === 0
  const failedText = webOnly
    ? 'Web sources are not answering. Try again in a moment.'
    : 'Failed to load streams.'
  const emptyText = webOnly ? 'No web source carries this one.' : 'No streams found.'

  return (
    <div className="relative flex h-full min-h-0 flex-col">
      <div className="shrink-0 pt-1.5 pb-1.5">
        <div className="flex items-center justify-between pl-2.5 pr-1">
          <h2 className="min-w-0 truncate text-[15px] leading-4 font-medium text-text">{title}</h2>
          <Dialog.Close className="flex size-7 items-center justify-center rounded-full text-text-muted outline-none hover:bg-white/[0.08] hover:text-white">
            <CloseIcon className="size-3.5" />
          </Dialog.Close>
        </div>
      </div>
      <div
        className="flex min-h-0 flex-1 flex-col bg-surface shadow-edge-soft"
        style={squircleStyle('inset')}
      >
        {/* The sort tabs live inside the inset: its solid surface keeps them legible under
            the frame's dither, and the list reads as one panel with its controls. */}
        <Segmented<StreamSort>
          className="mx-1.5 mt-1.5 shrink-0"
          value={effectiveSort}
          onChange={handleSortChange}
          options={webEnabled ? STREAM_SORTS : STREAM_SORTS.filter((s) => s.value !== 'web')}
        />
        <SkeletonSwap
          ready={!loading}
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
            {failed ? (
              <p className="px-3 py-6 text-center text-[13px] text-text-muted">{failedText}</p>
            ) : null}
            {!loading && !failed && items.length === 0 ? (
              <p className="px-3 py-6 text-center text-[13px] text-text-muted">{emptyText}</p>
            ) : null}
            <AnimatePresence initial={false} mode="popLayout">
              {items.map((item) =>
                item.kind === 'cached' ? (
                  <Row
                    key={item.key}
                    stream={item.stream}
                    selected={item.key === selectedId}
                    busy={resolving && item.key === selectedId}
                    onClick={() => void handlePick(item.stream)}
                  />
                ) : (
                  <WebRow
                    key={item.key}
                    stream={item.stream}
                    onClick={() => handlePickWeb(item.stream)}
                  />
                )
              )}
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

const ROW_ANIM = { duration: 0.18, ease: EASE_OUT }

const ROW_CLASS =
  'flex items-center justify-between gap-2.5 rounded-[10px] py-2.5 pr-3 pl-2.5 text-left outline-none transition-colors'

const CHIP_CLASS =
  'flex h-5 w-14 shrink-0 items-center justify-center rounded-md bg-white/[0.08] text-[11px] leading-3.5 font-medium tracking-[0.02em] text-text'

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
        <span className={CHIP_CLASS}>{stream.qualityLabel}</span>
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

// Same anatomy as a cached row: the chip is the quality the server promises,
// the flag and city say whose audio and where from, and the globe replaces
// the zap because this plays from the web rather than from a cached file. A
// bee beside the globe says the row came from an anime site.
function WebRow({
  stream,
  onClick
}: {
  stream: WebStream
  onClick: () => void
}): React.JSX.Element {
  const reduced = useReducedMotion()
  return (
    <motion.button
      type="button"
      layout={reduced ? false : true}
      initial={reduced ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={EXIT_FADE}
      transition={ROW_ANIM}
      onClick={onClick}
      className={cn(ROW_CLASS, 'bg-transparent hover:bg-white/[0.04]')}
    >
      <div className="flex min-w-0 grow items-center gap-2.5 overflow-hidden">
        <span className={CHIP_CLASS}>{webQualityLabel(stream.quality)}</span>
        <FlagTile lang={stream.lang} />
        <span className="grow truncate text-[13px] leading-4 font-medium text-text">
          {stream.server}
        </span>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        {stream.anime ? (
          <SimpleTooltip content="Anime">
            <span role="img" aria-label="Anime" className="inline-flex">
              <BeeIcon className="size-3.5 text-text-tertiary" />
            </span>
          </SimpleTooltip>
        ) : null}
        <GlobeIcon className="size-3.5 text-text-tertiary" />
      </div>
    </motion.button>
  )
}
