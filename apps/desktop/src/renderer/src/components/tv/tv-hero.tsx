import { ImdbLogo } from '@renderer/components/brand/imdb-logo'
import { MetacriticLogo } from '@renderer/components/brand/metacritic-logo'
import { PlayIcon } from '@renderer/components/icons'
import { TV_GUTTER } from '@renderer/components/tv/tv-row'
import { useTvAmbientSource } from '@renderer/lib/tv-ambient'
import { cn } from '@renderer/lib/cn'

export interface TvHeroProps {
  title: string
  logo?: string
  backdrop: string
  description: string
  year: number
  /** Runtime, or the release date for something that isn't out yet. */
  timing: string
  rating: string
  genres: string[]
  imdb?: string
  metacritic?: number
  starring?: string
  director?: string
  actions: React.ReactNode
  /** Sits under the actions: carousel dots on the home spotlight. */
  footer?: React.ReactNode
}

// A title at ten feet: the backdrop fills the screen and the words sit bottom-left, where a
// left-to-right scrim keeps them legible over any art.
export function TvHero({
  title,
  logo,
  backdrop,
  description,
  year,
  timing,
  rating,
  genres,
  imdb,
  metacritic,
  starring,
  director,
  actions,
  footer
}: TvHeroProps): React.JSX.Element {
  useTvAmbientSource(backdrop)
  return (
    <section
      className="relative flex h-[88vh] min-h-[600px] w-full shrink-0 items-end overflow-hidden"
      aria-label={title}
    >
      {/* The art dissolves into the shell's ambient glow rather than into a painted colour, so
          the page below carries on in the title's own tones. */}
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          maskImage: 'linear-gradient(180deg, black 50%, transparent 100%)',
          WebkitMaskImage: 'linear-gradient(180deg, black 50%, transparent 100%)'
        }}
      >
        <div
          className="absolute inset-0 bg-cover bg-top"
          style={{ backgroundImage: backdrop ? `url(${backdrop})` : undefined }}
        />
        <div
          className="absolute inset-0"
          style={{
            background:
              'linear-gradient(90deg, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.55) 32%, rgba(0,0,0,0) 62%)'
          }}
        />
      </div>
      <div className={cn(TV_GUTTER, 'relative flex w-full items-end justify-between gap-16 pb-16')}>
        <div className="flex max-w-[900px] min-w-0 flex-col gap-6">
          {logo ? (
            <img
              src={logo}
              alt={title}
              decoding="async"
              fetchPriority="high"
              className="max-h-[170px] w-auto max-w-[560px] self-start object-contain object-left drop-shadow-[0_4px_24px_rgba(0,0,0,0.5)]"
            />
          ) : (
            <h1 className="text-[72px] leading-[1.05] font-medium tracking-[-0.03em] text-balance text-text">
              {title}
            </h1>
          )}
          <div className="flex flex-wrap items-center gap-5 text-[20px] leading-6 font-medium text-text tabular-nums">
            {year ? <span>{year}</span> : null}
            {timing ? <span>{timing}</span> : null}
            {rating ? (
              <span className="rounded-md px-2 py-0.5 text-[16px] leading-5 ring-1 ring-white/25 ring-inset">
                {rating}
              </span>
            ) : null}
            {imdb ? (
              <span className="inline-flex items-center gap-2">
                <ImdbLogo className="h-5 w-auto" />
                {imdb}
              </span>
            ) : null}
            {metacritic !== undefined ? (
              <span className="inline-flex items-center gap-2">
                <MetacriticLogo score={metacritic} className="size-6" />
                {metacritic}
              </span>
            ) : null}
          </div>
          {genres.length > 0 ? (
            <p className="text-[20px] leading-6 font-medium text-text-tertiary">
              {genres.join(' · ')}
            </p>
          ) : null}
          {description ? (
            <p className="line-clamp-3 max-w-[760px] text-[22px] leading-[32px] font-normal text-text-secondary">
              {description}
            </p>
          ) : null}
          <div className="mt-2 flex items-center gap-4">{actions}</div>
          {footer}
        </div>
        {/* Credits sit off to the right, as on the desktop hero, leaving the left column to
            what you'd decide on: what it is and whether to play it. */}
        {starring || director ? (
          <dl className="flex w-[380px] shrink-0 flex-col gap-6 pb-1">
            {starring ? <Credit label="Starring" value={starring} /> : null}
            {director ? <Credit label="Director" value={director} /> : null}
          </dl>
        ) : null}
      </div>
    </section>
  )
}

function Credit({ label, value }: { label: string; value: string }): React.JSX.Element {
  return (
    <div className="flex flex-col gap-1.5">
      <dt className="text-[18px] leading-6 font-medium text-text-muted">{label}</dt>
      <dd className="line-clamp-2 text-[20px] leading-7 font-medium text-text">{value}</dd>
    </div>
  )
}

const TV_BUTTON =
  'inline-flex h-16 items-center justify-center gap-3 rounded-full px-10 text-[22px] leading-6 font-medium whitespace-nowrap outline-none select-none transition-[background-color,scale,opacity] duration-(--press-dur) ease-(--press-ease) active:scale-[0.97] disabled:pointer-events-none disabled:opacity-40 focus-visible:ring-1 focus-visible:ring-white/30'

export function TvPlayButton({
  onClick,
  disabled,
  resume,
  label = 'Play'
}: {
  onClick: () => void
  disabled?: boolean
  resume?: { label: string; percent: number } | null
  label?: string
}): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(TV_BUTTON, 'bg-white text-black hover:bg-white/85')}
    >
      <PlayIcon className="size-6" />
      {resume ? (
        <span className="h-2 w-20 shrink-0 overflow-hidden rounded-full bg-black/15">
          <span
            className="block h-full rounded-full bg-current"
            style={{ width: `${resume.percent}%` }}
          />
        </span>
      ) : null}
      {resume ? resume.label : label}
    </button>
  )
}

// Takes a ref so it can stand in as a Base UI trigger (the lists popover renders through it).
export function TvSecondaryButton({
  className,
  ref,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  ref?: React.Ref<HTMLButtonElement>
}): React.JSX.Element {
  return (
    <button
      ref={ref}
      type="button"
      className={cn(
        TV_BUTTON,
        'bg-white/15 text-text backdrop-blur-md hover:bg-white/25',
        className
      )}
      {...props}
    />
  )
}
