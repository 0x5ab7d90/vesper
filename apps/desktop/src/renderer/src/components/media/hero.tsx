import { useState } from 'react'
import { Button } from '@renderer/components/ui/button'
import { IconButton } from '@renderer/components/ui/icon-button'
import { Badge } from '@renderer/components/ui/badge'
import { PlayIcon, PlusIcon } from '@renderer/components/icons'
import { OverviewModal } from '@renderer/components/media/overview-modal'
import { ImdbLogo } from '@renderer/components/brand/imdb-logo'
import { RtLogo } from '@renderer/components/brand/rt-logo'
import { MetacriticLogo } from '@renderer/components/brand/metacritic-logo'
import { AddToListsPopover } from '@renderer/components/library/add-to-lists-popover'
import { RatingButton } from '@renderer/components/media/rating-button'
import { cn } from '@renderer/lib/cn'

export interface HeroProps {
  title: string
  logo?: string
  tags: string[]
  rating: string
  description: string
  year: number
  runtime: string
  metacritic?: number
  rottenTomatoes?: number
  imdb?: string
  starring: string
  director: string
  backdrop: string
  poster: string
  releaseLabel?: string
  mediaType: 'movie' | 'tv'
  tmdbId: number
  posterPath?: string
  onPlay?: () => void
  playBusy?: boolean
  resume?: { label: string; percent: number } | null
}

/** Shared with the skeleton so the swap doesn't jump. */
export const HERO_HEIGHT = 'h-[clamp(420px,58vh,620px)]'

export function Hero({
  title,
  logo,
  tags,
  rating,
  description,
  year,
  runtime,
  metacritic,
  rottenTomatoes,
  imdb,
  starring,
  director,
  backdrop,
  poster,
  releaseLabel,
  mediaType,
  tmdbId,
  posterPath,
  onPlay,
  playBusy,
  resume
}: HeroProps): React.JSX.Element {
  const unreleased = !!releaseLabel
  const [overviewOpen, setOverviewOpen] = useState(false)
  return (
    <section
      className={cn(
        'relative flex w-full shrink-0 overflow-hidden rounded-lg bg-surface',
        HERO_HEIGHT
      )}
      aria-label={title}
    >
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: `url(${poster})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          maskImage: 'linear-gradient(black 60%, transparent 95%)',
          WebkitMaskImage: 'linear-gradient(black 60%, transparent 95%)'
        }}
      />
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: `url(${backdrop})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          maskImage: 'linear-gradient(black 65%, transparent 95%)',
          WebkitMaskImage: 'linear-gradient(black 65%, transparent 95%)'
        }}
      />
      <div
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(180deg, rgba(18,18,18,0) 14.76%, rgba(18,18,18,0.55) 50%, rgba(18,18,18,0.92) 80%, #121212 90%, #121212 100%)'
        }}
      />
      <div className="relative flex w-full flex-col justify-end p-8">
        <div className="flex w-full items-end justify-between gap-8">
          <div className="flex max-w-[532px] flex-col gap-3">
            {logo ? (
              <img
                src={logo}
                alt={title}
                width={380}
                height={110}
                decoding="async"
                fetchPriority="high"
                className="mb-1 max-h-[110px] w-auto max-w-[380px]"
              />
            ) : (
              <h1 className="text-5xl leading-tight font-bold tracking-[-0.02em] text-balance text-text">
                {title}
              </h1>
            )}
            <div className="flex items-center gap-2">
              <span className="text-[13px] leading-4 font-medium text-text-secondary">
                {tags.join(', ')}
              </span>
              <Badge variant="chip" size="sm">
                {rating}
              </Badge>
            </div>
            <button
              type="button"
              onClick={() => setOverviewOpen(true)}
              className="line-clamp-2 max-w-[460px] bg-transparent text-left text-[13px] leading-[1.5] font-medium text-text-secondary outline-none"
            >
              {description}
            </button>
            <div className="flex flex-wrap items-center gap-3 text-[13px] leading-4 font-medium text-text tabular-nums">
              <span>{year}</span>
              <span>{unreleased ? releaseLabel : runtime}</span>
              {metacritic !== undefined ? (
                <span className="inline-flex items-center gap-1.5">
                  <MetacriticLogo score={metacritic} className="size-4" />
                  {metacritic}
                </span>
              ) : null}
              {rottenTomatoes !== undefined ? (
                <span className="inline-flex items-center gap-1.5">
                  <RtLogo score={rottenTomatoes} className="size-4" />
                  {rottenTomatoes}%
                </span>
              ) : null}
              {imdb ? (
                <span className="inline-flex items-center gap-1.5">
                  <ImdbLogo className="h-[14px] w-auto" />
                  {imdb}
                </span>
              ) : null}
            </div>
            <div className="mt-2 flex items-center gap-2">
              <Button
                variant="primary"
                size="lg"
                className="h-[38px] gap-2.5 px-6"
                disabled={unreleased || playBusy}
                aria-disabled={unreleased || playBusy}
                onClick={(e) => {
                  e.stopPropagation()
                  onPlay?.()
                }}
              >
                <PlayIcon className="size-3.5" />
                {resume ? (
                  <span
                    className={cn('h-1.5 w-12 shrink-0 overflow-hidden rounded-full bg-black/15')}
                  >
                    <span
                      className={cn('block h-full rounded-full bg-current')}
                      style={{ width: `${resume.percent}%` }}
                    />
                  </span>
                ) : null}
                {resume ? resume.label : 'Play'}
              </Button>
              <AddToListsPopover
                mediaType={mediaType}
                tmdbId={tmdbId}
                title={title}
                posterPath={posterPath}
              >
                <IconButton
                  variant="soft"
                  size="lg"
                  aria-label="Add to list"
                  className="rounded-[14px]"
                  onClick={(e) => e.stopPropagation()}
                >
                  <PlusIcon className="size-4" />
                </IconButton>
              </AddToListsPopover>
              <RatingButton
                mediaType={mediaType}
                tmdbId={tmdbId}
                title={title}
                posterPath={posterPath}
              />
            </div>
          </div>
          <div className="hidden w-[220px] shrink-0 flex-col gap-4 pb-1 text-[12px] leading-4 font-medium lg:flex">
            <div className="flex flex-col gap-1">
              <span className="font-bold text-text-faint">Starring</span>
              <span className="leading-[1.4] text-text">{starring}</span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="font-bold text-text-faint">Director</span>
              <span className="leading-[1.4] text-text">{director}</span>
            </div>
          </div>
        </div>
      </div>
      <OverviewModal
        title={title}
        overview={description}
        open={overviewOpen}
        onOpenChange={setOverviewOpen}
      />
    </section>
  )
}
