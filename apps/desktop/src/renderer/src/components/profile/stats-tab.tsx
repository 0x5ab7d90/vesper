import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { toBlob } from 'html-to-image'
import { Bar } from '@renderer/components/dither-kit/bar'
import { Pie } from '@renderer/components/dither-kit/pie'
import { PieChart } from '@renderer/components/dither-kit/pie-chart'
import { PALETTE, rgb, type DitherColor } from '@renderer/components/dither-kit/palette'
import { BarChart } from '@renderer/components/dither-kit/bar-chart'
import { XAxis } from '@renderer/components/dither-kit/x-axis'
import { ChartTooltip } from '@renderer/components/profile/chart-tooltip'
import { TasteRadar } from '@renderer/components/profile/taste-radar'
import { Skeleton } from '@renderer/components/ui/skeleton'
import { squircleStyle } from '@renderer/components/ui/squircle-surface'
import { CameraSparkleIcon, CheckmarkIcon } from '@renderer/components/icons'
import { Ring } from '@renderer/components/ui/spinner'
import { cn } from '@renderer/lib/cn'
import { tmdbImage } from '@renderer/lib/tmdb'
import { api } from '@convex/_generated/api'
import type { Doc } from '@convex/_generated/dataModel'

// One series, one hue: every chart here is a magnitude read, so the mascot violet carries
// all of them and text stays in the text tokens (dataviz: colour follows the job, not rank).
const SERIES = { count: { label: 'Titles', color: 'violet' as const } }

// Chart labels in the app's sans at a readable size, overriding the kit's mono default so the
// screen and the exported image agree on the same font.
const CHART_TEXT = '[&_svg_text]:font-sans [&_svg_text]:text-[11px] [&_svg_text]:font-medium'

const LANGUAGE_NAMES = new Intl.DisplayNames(['en'], { type: 'language' })

function languageName(code: string): string {
  try {
    return LANGUAGE_NAMES.of(code) ?? code.toUpperCase()
  } catch {
    return code.toUpperCase()
  }
}

function compact(n: number): string {
  if (n >= 10_000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}K`
  return n.toLocaleString()
}

function hoursDetail(hours: number): string {
  if (hours >= 48) return `about ${Math.round(hours / 24)} days`
  return 'so far'
}

type Stats = NonNullable<
  NonNullable<ReturnType<typeof useQuery<typeof api.stats.forUsername>>>['stats']
>

/**
 * The Stats tab is one poster-like card built to be screenshotted: who, one hero number,
 * genres as shader bars, a dithered year, and a strip of facts, signed with the handle. A
 * "Copy image" button renders exactly that card to the clipboard.
 */
export function StatsTab({ profile }: { profile: Doc<'profiles'> }): React.JSX.Element {
  const username = profile.username
  const data = useQuery(api.stats.forUsername, { username })
  const refresh = useMutation(api.stats.requestRefresh)

  useEffect(() => {
    void refresh({ username }).catch(() => undefined)
  }, [refresh, username])

  if (data === undefined) return <StatsSkeleton />
  if (data === null) return <Note>Stats are private.</Note>
  if (!data.stats) {
    if (data.watchedCount === 0) return <Note>Nothing watched yet.</Note>
    return <StatsSkeleton label="Crunching the numbers" />
  }

  return <ShareCard profile={profile} stats={data.stats} />
}

function ShareCard({
  profile,
  stats
}: {
  profile: Doc<'profiles'>
  stats: Stats
}): React.JSX.Element {
  const cardRef = useRef<HTMLDivElement>(null)
  const genres = useMemo(() => stats.genres.slice(0, 6), [stats.genres])
  const total = stats.movies + stats.shows
  const formatSlices = useMemo(
    () => [
      { name: 'movies', value: stats.movies },
      { name: 'shows', value: stats.shows }
    ],
    [stats.movies, stats.shows]
  )
  // Top three languages plus everything else, keyed by ISO code so colours stay put.
  const { languageSlices, languageConfig, languageShare, topLanguageLabel } = useMemo(() => {
    const top = stats.languages.slice(0, 3)
    const covered = top.reduce((n, l) => n + l.count, 0)
    const rest = Math.max(0, total - covered)
    const slices = top.map((l) => ({ name: l.code, value: l.count }))
    if (rest > 0) slices.push({ name: 'other', value: rest })
    const config: Record<string, { label: string; color: DitherColor }> = {}
    top.forEach((l, i) => {
      config[l.code] = { label: languageName(l.code), color: LANGUAGE_COLORS[i] ?? 'grey' }
    })
    config.other = { label: 'Other', color: 'grey' }
    const first = top[0]
    return {
      languageSlices: slices,
      languageConfig: config,
      languageShare: total > 0 && first ? Math.round((first.count / total) * 100) : 0,
      topLanguageLabel: first ? languageName(first.code) : ''
    }
  }, [stats.languages, total])
  // One row per star, 1 to 5, so the bars read left to right like the rating control.
  const ratingRows = useMemo(
    () => (stats.ratings?.distribution ?? []).map((count, i) => ({ label: String(i + 1), count })),
    [stats.ratings]
  )
  const movieShare = total > 0 ? Math.round((stats.movies / total) * 100) : 0
  const topLanguage = stats.languages[0]

  // The card. Everything inside is what gets copied, minus the button, which opts out of the
  // capture; the footer signs the image with the handle.
  return (
    <div
      ref={cardRef}
      className="relative flex flex-col gap-5 overflow-hidden border border-white/[0.06] bg-surface-2 p-5"
      style={squircleStyle('frame')}
    >
      {/* Three rows of two: each panel gets the same width, so nothing crowds the top. */}
      <div className="relative grid grid-cols-2 gap-x-6 gap-y-5">
        {languageSlices.length > 0 ? (
          <Panel title="Language">
            <Donut
              data={languageSlices}
              config={languageConfig}
              centerValue={`${languageShare}%`}
              centerLabel={topLanguageLabel}
            />
          </Panel>
        ) : null}
        <Panel title="Format">
          <Donut
            data={formatSlices}
            config={FORMAT}
            centerValue={`${movieShare}%`}
            centerLabel="Movies"
          />
        </Panel>

        <Panel title="Last 12 months">
          <div className={cn('h-[180px]', CHART_TEXT)}>
            <BarChart
              data={stats.months}
              config={SERIES}
              margins={{ top: 6, left: 4, right: 4, bottom: 18 }}
            >
              <Bar dataKey="count" variant="gradient" />
              <XAxis dataKey="label" maxTicks={12} tickMargin={6} />
              <ChartTooltip labelKey="label" />
            </BarChart>
          </div>
        </Panel>
        {genres.length > 0 ? (
          <Panel title="Taste">
            <TasteRadar data={genres} className="h-[220px]" />
          </Panel>
        ) : null}

        {stats.decades.length > 0 ? (
          <Panel title="By decade">
            <div className={cn('h-[150px]', CHART_TEXT)}>
              <BarChart
                data={stats.decades}
                config={SERIES}
                margins={{ top: 6, left: 4, right: 4, bottom: 18 }}
              >
                <Bar dataKey="count" variant="gradient" />
                <XAxis dataKey="label" maxTicks={6} tickMargin={6} />
                <ChartTooltip labelKey="label" />
              </BarChart>
            </div>
          </Panel>
        ) : null}
        {stats.ratings ? (
          <Panel title="Ratings">
            <div className={cn('h-[150px]', CHART_TEXT)}>
              <BarChart
                data={ratingRows}
                config={SERIES}
                margins={{ top: 6, left: 4, right: 4, bottom: 18 }}
              >
                <Bar dataKey="count" variant="gradient" />
                <XAxis dataKey="label" maxTicks={5} tickMargin={6} />
                <ChartTooltip labelKey="label" />
              </BarChart>
            </div>
          </Panel>
        ) : null}
      </div>

      <dl className="relative grid grid-cols-4 gap-x-4 gap-y-4">
        <Fact
          label="Hours watched"
          value={compact(Math.round(stats.hoursWatched))}
          detail={hoursDetail(stats.hoursWatched)}
        />
        <Fact
          label="Titles watched"
          value={compact(stats.movies + stats.shows)}
          detail={`${compact(stats.movies)} movies · ${compact(stats.shows)} shows`}
        />
        {stats.highlights.longestMovie ? (
          <Fact
            label="Longest sit"
            value={stats.highlights.longestMovie.title}
            poster={stats.highlights.longestMovie.posterPath}
            detail={`${Math.floor(stats.highlights.longestMovie.runtimeMin / 60)}h ${
              stats.highlights.longestMovie.runtimeMin % 60
            }m`}
          />
        ) : null}
        {stats.highlights.oldest ? (
          <Fact
            label="Furthest back"
            value={stats.highlights.oldest.title}
            poster={stats.highlights.oldest.posterPath}
            detail={String(stats.highlights.oldest.year)}
          />
        ) : null}
        {stats.highlights.topRated ? (
          <Fact
            label="Top rating"
            value={stats.highlights.topRated.title}
            poster={stats.highlights.topRated.posterPath}
            detail={`${stats.highlights.topRated.score} of 5`}
          />
        ) : null}
        {topLanguage ? (
          <Fact
            label="Most watched language"
            value={languageName(topLanguage.code)}
            detail={`${compact(topLanguage.count)} titles`}
          />
        ) : null}
        {stats.highlights.busiestMonth ? (
          <Fact
            label="Busiest month"
            value={stats.highlights.busiestMonth.label}
            detail={`${compact(stats.highlights.busiestMonth.count)} titles`}
          />
        ) : null}
        {stats.highlights.newest ? (
          <Fact
            label="Freshest pick"
            value={stats.highlights.newest.title}
            poster={stats.highlights.newest.posterPath}
            detail={String(stats.highlights.newest.year)}
          />
        ) : null}
      </dl>

      <footer className="relative flex items-center justify-between border-t border-white/[0.06] pt-3">
        <DropMark />
        <CopyImageButton target={cardRef} filename={`${profile.username}-vesper-stats`} />
      </footer>
    </div>
  )
}

/* ---------- pieces ---------- */

const FORMAT = {
  movies: { label: 'Movies', color: 'violet' as const },
  shows: { label: 'Shows', color: 'grey' as const }
}
// Fixed order for the language slices: the app's violet first, then the kit's blue and pink,
// with grey held back for "Other".
const LANGUAGE_COLORS: DitherColor[] = ['violet', 'blue', 'pink']

/** A dithered donut with a figure in the hole and a key beneath. Part-to-whole only, and no
 *  more than four slices, so the key stays short and the colours stay tellable. */
function Donut({
  data,
  config,
  centerValue,
  centerLabel
}: {
  data: { name: string; value: number }[]
  config: Record<string, { label?: string; color: DitherColor }>
  centerValue: string
  centerLabel: string
}): React.JSX.Element {
  return (
    // Top-aligned rather than centred, so two donuts on one row share a baseline whatever the
    // length of their keys.
    <div className="flex flex-1 flex-col items-center justify-start gap-3">
      <div className="relative size-[150px]">
        <PieChart
          data={data}
          config={config}
          dataKey="value"
          nameKey="name"
          innerRadius={0.64}
          margins={{ top: 0, right: 0, bottom: 0, left: 0 }}
        >
          <Pie variant="gradient" />
          <ChartTooltip heading={false} />
        </PieChart>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-[22px] leading-6 font-medium tracking-[-0.02em] text-text">
            {centerValue}
          </span>
          <span className="text-[11px] leading-4 font-medium text-text-muted">{centerLabel}</span>
        </div>
      </div>
      <dl className="flex w-full flex-col gap-1">
        {data.map((slice) => (
          <div
            key={slice.name}
            className="flex items-center gap-2 text-[12px] leading-4 font-medium tabular-nums"
          >
            <span
              aria-hidden
              className="size-2 shrink-0 rounded-[1px]"
              style={{ backgroundColor: rgb(PALETTE[config[slice.name]?.color ?? 'grey'].fill) }}
            />
            <dt className="truncate text-text-tertiary">
              {config[slice.name]?.label ?? slice.name}
            </dt>
            <dd className="ml-auto text-text">{compact(slice.value)}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

function Panel({
  title,
  children
}: {
  title: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <section className="relative flex min-w-0 flex-col gap-2">
      <Caption>{title}</Caption>
      {children}
    </section>
  )
}

function Caption({ children }: { children: React.ReactNode }): React.JSX.Element {
  return <h3 className="text-[11px] leading-4 font-medium text-text-muted">{children}</h3>
}

// The mascot's body and eye outlines, copied from drop-mascot.tsx.
const DROP_BODY =
  'M-44.0 -39.8 A62.2 62.2 0 1 0 44.0 -39.8 L10.6 -73.2 A15.0 15.0 0 0 0 -10.6 -73.2 Z'
const DROP_EYE =
  'M-7.25 -8.75 C-7.25 -12.754 -4.004 -16 0 -16 C4.004 -16 7.25 -12.754 7.25 -8.75 C7.25 -2.917 7.25 2.917 7.25 8.75 C7.25 12.754 4.004 16 0 16 C-4.004 16 -7.25 12.754 -7.25 8.75 C-7.25 2.917 -7.25 -2.917 -7.25 -8.75 Z'

/**
 * A still, one-colour mascot in its idle pose, for the card's signature. The live mascot
 * animates through CSS-driven path and transform rules that the image exporter cannot
 * serialise, so this is plain SVG with the eyes knocked out in the card surface.
 */
function DropMark({ size = 22 }: { size?: number }): React.JSX.Element {
  return (
    <svg viewBox="0 0 170 170" width={size} height={size} aria-hidden>
      <g transform="translate(85 92)">
        <path d={DROP_BODY} transform="rotate(-23)" fill="#b3b3b3" />
        <g transform="translate(31.7 -8.3)" fill="#1a1a1a">
          <path d={DROP_EYE} transform="translate(-14 0)" />
          <path d={DROP_EYE} transform="translate(14 0)" />
        </g>
      </g>
    </svg>
  )
}

function Fact({
  label,
  value,
  detail,
  poster
}: {
  label: string
  value: string
  detail: string
  /** TMDB poster path; facts that name a title show its cover beside the text. */
  poster?: string
}): React.JSX.Element {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <dt className="text-[11px] leading-4 font-medium text-text-muted">{label}</dt>
      <div className="flex min-w-0 items-center gap-2">
        {poster ? (
          <span
            aria-hidden
            className="h-9 w-6 shrink-0 rounded-[4px] bg-cover bg-center"
            style={{
              backgroundColor: '#2a2a2a',
              backgroundImage: `url(${tmdbImage(poster, 'w92') ?? ''})`
            }}
          />
        ) : null}
        <div className="flex min-w-0 flex-col gap-0.5">
          <dd className="truncate text-[13px] leading-4 font-medium text-text">{value}</dd>
          <dd className="text-[12px] leading-4 font-medium text-text-tertiary tabular-nums">
            {detail}
          </dd>
        </div>
      </div>
    </div>
  )
}

function Note({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <div className="flex h-full min-h-[200px] items-center justify-center">
      <p className="text-[13px] leading-5 font-medium text-text-tertiary">{children}</p>
    </div>
  )
}

type CopyState = 'idle' | 'working' | 'done' | 'failed'

function CopyImageButton({
  target,
  filename
}: {
  target: React.RefObject<HTMLDivElement | null>
  filename: string
}): React.JSX.Element {
  const [state, setState] = useState<CopyState>('idle')

  useEffect(() => {
    if (state !== 'done' && state !== 'failed') return
    const id = setTimeout(() => setState('idle'), 1600)
    return () => clearTimeout(id)
  }, [state])

  const copy = async (): Promise<void> => {
    const node = target.current
    if (!node || state === 'working') return
    setState('working')
    try {
      const blob = await toBlob(node, {
        pixelRatio: 2,
        backgroundColor: '#1a1a1a',
        // The posters were first loaded as plain CSS backgrounds, so the HTTP cache holds
        // opaque copies that a CORS fetch is refused. A busted URL and no-store go to the
        // network instead, where TMDB answers with the CORS header we need.
        cacheBust: true,
        fetchRequestInit: { cache: 'no-store', mode: 'cors' },
        // WebGPU canvases read back blank (the solid fill shows instead), and the button itself
        // has no business in the picture.
        filter: (el) =>
          !(
            el instanceof HTMLElement &&
            (el.hasAttribute('data-shader') || el.hasAttribute('data-capture-skip'))
          )
      })
      if (!blob) throw new Error('No image')
      if (
        navigator.clipboard &&
        'write' in navigator.clipboard &&
        typeof ClipboardItem !== 'undefined'
      ) {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
      } else {
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `${filename}.png`
        a.click()
        URL.revokeObjectURL(url)
      }
      setState('done')
    } catch {
      setState('failed')
    }
  }

  const label =
    state === 'working'
      ? 'Exporting image'
      : state === 'done'
        ? 'Copied to clipboard'
        : state === 'failed'
          ? 'Could not copy'
          : 'Export as image'

  return (
    <button
      type="button"
      data-capture-skip
      onClick={() => void copy()}
      disabled={state === 'working'}
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex size-8 items-center justify-center rounded-[12px] bg-white/[0.06] text-text outline-none transition-[background-color,transform,color] duration-150 ease-out hover:bg-white/[0.1] active:scale-[0.97] disabled:opacity-60',
        state === 'failed' && 'text-red-400'
      )}
    >
      {/* Camera, spinner and check share one slot; the swap crossfades between them and the
          check draws its stroke on arrival. */}
      <span
        className="t-icon-swap"
        data-state={state === 'done' ? 'b' : state === 'working' ? 'c' : 'a'}
        aria-hidden
      >
        <span className="t-icon inline-flex" data-icon="a">
          <CameraSparkleIcon className="size-[18px]" />
        </span>
        <span className="t-icon inline-flex" data-icon="b">
          <CheckmarkIcon className="size-[18px]" />
        </span>
        <span className="t-icon inline-flex" data-icon="c">
          <Ring className="size-4" />
        </span>
      </span>
    </button>
  )
}

function StatsSkeleton({ label }: { label?: string }): React.JSX.Element {
  return (
    <div className="flex flex-col gap-3" aria-busy>
      <div
        className="relative flex flex-col gap-5 border border-white/[0.06] bg-surface-2 p-5"
        style={squircleStyle('frame')}
      >
        <div className="flex flex-col gap-2">
          <div className="grid grid-cols-2 gap-x-6 gap-y-5">
            <div className="flex flex-col items-center gap-3">
              <Skeleton className="h-3 w-16 self-start" />
              <Skeleton className="size-[150px] rounded-full" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-full" />
            </div>
            <div className="flex flex-col items-center gap-3">
              <Skeleton className="h-3 w-16 self-start" />
              <Skeleton className="size-[150px] rounded-full" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-full" />
            </div>
            <div className="flex flex-col gap-2">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-[180px] w-full" />
            </div>
            <div className="flex flex-col gap-2">
              <Skeleton className="h-3 w-12" />
              <Skeleton className="mx-auto size-[200px] rounded-full" />
            </div>
            <div className="flex flex-col gap-2">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-[150px] w-full" />
            </div>
            <div className="flex flex-col gap-2">
              <Skeleton className="h-3 w-14" />
              <Skeleton className="h-[150px] w-full" />
            </div>
          </div>
        </div>
        <div className="grid grid-cols-4 gap-4">
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="flex flex-col gap-1">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-3 w-12" />
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between border-t border-white/[0.06] pt-3">
          <Skeleton className="size-[22px] rounded-full" />
          <Skeleton className="h-7 w-20 rounded-full" />
        </div>
      </div>
      {label ? (
        <p className="text-center text-[12px] leading-4 font-medium text-text-muted" role="status">
          {label}
        </p>
      ) : null}
    </div>
  )
}
