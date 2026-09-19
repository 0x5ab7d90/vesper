import { useEffect, useMemo, useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { AnimatePresence, m as motion } from 'motion/react'
import { cn } from '@renderer/lib/cn'
import { SkeletonSwap } from '@renderer/components/ui/skeleton-swap'
import { KalshiMarketChart } from '@renderer/components/fights/kalshi-market-chart'
import {
  fightMatchesQuery,
  fightPosterUrl,
  liveMatchesQuery,
  type FightMatch
} from '@renderer/lib/fights/api'
import {
  athleteStatsQuery,
  CARD_SEGMENT_ORDER,
  fightCenterQuery,
  matchEspnEvent,
  stanceImage,
  ufcScoreboardQuery,
  type EspnBout,
  type EspnCard,
  type EspnCompetitor
} from '@renderer/lib/fights/espn'
import { IMG_OUTLINE } from '@renderer/components/ui/image-outline'
import { EASE_IN, EASE_OUT } from '@renderer/lib/motion'

// The Fight card: a UFC event's bout list with tale-of-the-tape comparison.
// An enhancement, never a gate — when ESPN has nothing for this event, a live
// fight redirects straight into the player instead.

type SearchParams = {
  espnId?: string
}

export const Route = createFileRoute('/_authenticated/fights/$id')({
  validateSearch: (search): SearchParams => {
    const s = search as Record<string, unknown>
    return { espnId: s.espnId ? String(s.espnId) : undefined }
  },
  component: FightCardPage
})

const LIVE_WINDOW_MS = 7 * 60 * 60_000

function FightCardPage(): React.JSX.Element {
  const params = Route.useParams()
  const search = Route.useSearch()
  const navigate = useNavigate()

  const matches = useQuery(fightMatchesQuery())
  const liveMatches = useQuery(liveMatchesQuery())
  const match = useMemo(
    () => (matches.data ?? []).find((m) => m.id === params.id) ?? null,
    [matches.data, params.id]
  )
  const live = (liveMatches.data ?? []).some((m) => m.id === params.id)

  // Deep links arrive without a pre-matched ESPN id — re-match from the
  // scoreboard around the event's date.
  const scoreboard = useQuery({
    ...ufcScoreboardQuery(match?.date ?? Date.now()),
    enabled: !search.espnId && !!match
  })
  const espnId =
    search.espnId ?? (match ? (matchEspnEvent(match, scoreboard.data ?? [])?.id ?? null) : null)
  const matchingSettled = Boolean(search.espnId) || scoreboard.isFetched

  // Poll the card while the event could be in progress so results land live.
  const inLiveWindow =
    !!match && Date.now() >= match.date && Date.now() - match.date < LIVE_WINDOW_MS
  const fightCenter = useQuery({
    ...fightCenterQuery(espnId ?? '', live || inLiveWindow),
    enabled: !!espnId
  })

  const goWatch = (): void => {
    if (!match) return
    void navigate({
      to: '/watch-fight/$id',
      params: { id: match.id },
      search: { title: match.title, poster: fightPosterUrl(match) },
      viewTransition: false
    })
  }

  // No card data for a live fight → plain Fight behavior: straight to the player.
  useEffect(() => {
    if (match && live && matchingSettled && !espnId) goWatch()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [match, live, matchingSettled, espnId])

  if (matches.isSuccess && !match) {
    return (
      <Shell>
        <span className="text-[14px] leading-[18px] text-text-muted">
          This event is no longer listed.
        </span>
      </Shell>
    )
  }
  if (!match) return <Shell />

  const cards = fightCenter.data?.cards ?? {}
  const segmentKeys = [
    ...CARD_SEGMENT_ORDER.filter((k) => k in cards),
    ...Object.keys(cards).filter((k) => !CARD_SEGMENT_ORDER.includes(k))
  ]

  return (
    <Shell>
      <Hero match={match} live={live} eventName={fightCenter.data?.event?.name} onWatch={goWatch} />
      {matchingSettled && !espnId ? (
        <span className="text-[13px] leading-4 text-text-muted">
          No fight card is available for this event.
        </span>
      ) : null}
      {espnId ? (
        <SkeletonSwap
          ready={!fightCenter.isPending}
          reserve="auto"
          label="Fight card"
          skeleton={<BoutRowsSkeleton />}
        >
          <div className="flex flex-col gap-8">
            {segmentKeys.map((key) => (
              <CardSegment key={key} card={cards[key]} />
            ))}
          </div>
        </SkeletonSwap>
      ) : null}
    </Shell>
  )
}

function Shell({ children }: { children?: React.ReactNode }): React.JSX.Element {
  return (
    <div className="mx-auto flex w-full max-w-[980px] flex-col gap-8 px-6 py-8">{children}</div>
  )
}

function Hero({
  match,
  live,
  eventName,
  onWatch
}: {
  match: FightMatch
  live: boolean
  eventName?: string
  onWatch: () => void
}): React.JSX.Element {
  const poster = fightPosterUrl(match)
  const when = new Date(match.date).toLocaleString([], {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  })
  return (
    <div className="flex items-center gap-6">
      {poster ? (
        <img
          src={poster}
          alt=""
          className={cn('h-[150px] w-[266px] shrink-0 rounded-xl object-cover', IMG_OUTLINE)}
        />
      ) : null}
      <div className="flex min-w-0 flex-col gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-[22px] leading-[26px] font-bold tracking-[-0.01em] text-balance text-text">
            {eventName ?? match.title}
          </h1>
          <span className="text-[13px] leading-4 text-text-muted">{when}</span>
        </div>
        {live ? (
          <button
            type="button"
            onClick={onWatch}
            className="flex w-fit items-center gap-2 rounded-full bg-accent px-5 py-2.5 text-[14px] leading-[18px] font-bold text-accent-fg outline-none"
          >
            <span aria-hidden className="size-2 rounded-full bg-[#f43]" />
            Watch live
          </button>
        ) : (
          <span className="flex w-fit items-center rounded-full bg-wash px-4 py-2 text-[13px] leading-4 font-medium text-text-tertiary">
            Starts{' '}
            {new Date(match.date).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
          </span>
        )}
      </div>
    </div>
  )
}

function CardSegment({ card }: { card: EspnCard }): React.JSX.Element {
  const bouts = [...(card.competitions ?? [])].sort(
    (a, b) => (a.matchNumber ?? 0) - (b.matchNumber ?? 0)
  )
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-[16px] leading-5 font-bold text-text">
        {card.displayName ?? card.name ?? 'Card'}
      </h2>
      <div className="flex flex-col gap-3">
        {bouts.map((bout) => (
          <BoutCard key={bout.id} bout={bout} />
        ))}
      </div>
    </section>
  )
}

function BoutCard({ bout }: { bout: EspnBout }): React.JSX.Element {
  const [expanded, setExpanded] = useState(false)
  const [a, b] = orderedCompetitors(bout)
  const state = bout.status?.type?.state ?? 'pre'
  const done = state === 'post'
  const inProgress = state === 'in'

  return (
    <div
      className="flex flex-col rounded-xl bg-surface"
      style={{ boxShadow: 'var(--shadow-resting)' }}
    >
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        aria-expanded={expanded}
        className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 px-5 py-4 text-left outline-none"
      >
        <Fighter competitor={a} side="left" dimmed={done && !a?.winner} />
        <div className="flex min-w-[130px] flex-col items-center gap-1.5">
          <span className="text-[11px] leading-[14px] font-medium tracking-[0.08em] text-text-muted uppercase">
            {bout.note ?? bout.type?.text ?? ''}
          </span>
          {inProgress ? (
            <span className="flex items-center gap-1.5 text-[12px] leading-4 font-bold text-text tabular-nums">
              <span aria-hidden className="size-1.5 rounded-full bg-[#f43]" />R
              {bout.status?.period ?? '–'} · {bout.status?.displayClock ?? ''}
            </span>
          ) : done ? (
            <span className="max-w-[220px] text-center text-[12px] leading-4 font-medium text-text-secondary">
              {bout.status?.result?.displayName ?? 'Final'}
              {bout.status?.result?.description ? ` — ${bout.status.result.description}` : ''}
            </span>
          ) : null}
        </div>
        <Fighter competitor={b} side="right" dimmed={done && !b?.winner} />
      </button>
      <AnimatePresence initial={false}>
        {expanded ? (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0, transition: { duration: 0.16, ease: EASE_IN } }}
            transition={{ duration: 0.3, ease: EASE_OUT }}
            className="overflow-hidden"
          >
            <TaleOfTheTape a={a} b={b} />
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  )
}

function orderedCompetitors(
  bout: EspnBout
): [EspnCompetitor | undefined, EspnCompetitor | undefined] {
  const list = [...(bout.competitors ?? [])].sort((x, y) => (x.order ?? 0) - (y.order ?? 0))
  return [list[0], list[1]]
}

function Fighter({
  competitor,
  side,
  dimmed
}: {
  competitor?: EspnCompetitor
  side: 'left' | 'right'
  dimmed: boolean
}): React.JSX.Element {
  const athlete = competitor?.athlete
  const right = side === 'right'
  // ESPN hands out a literal blank.png when it has no flag for a fighter.
  const flagHref =
    athlete?.flag?.href && !athlete.flag.href.includes('/blank.png') ? athlete.flag.href : undefined
  return (
    <div
      className={cn(
        'flex min-w-0 items-center gap-3',
        right && 'flex-row-reverse',
        dimmed && 'opacity-50'
      )}
    >
      <div className="size-14 shrink-0 overflow-hidden rounded-full bg-surface-3">
        {athlete?.headshot?.href ? (
          <img
            src={athlete.headshot.href}
            alt=""
            loading="lazy"
            className={cn('h-full w-full rounded-full object-cover object-top', IMG_OUTLINE)}
            onError={(e) => {
              e.currentTarget.style.display = 'none'
            }}
          />
        ) : null}
      </div>
      <div className={cn('flex min-w-0 flex-col gap-0.5', right && 'items-end text-right')}>
        <span className="flex items-center gap-1.5 truncate text-[14px] leading-[18px] font-semibold text-text">
          {competitor?.winner ? (
            <span className="rounded-sm bg-wash px-1 text-[10px] leading-[14px] font-bold text-text">
              W
            </span>
          ) : null}
          {athlete?.displayName ?? 'TBD'}
        </span>
        <span className="text-[12px] leading-4 text-text-muted tabular-nums">
          {competitor?.displayRecord}
        </span>
        {flagHref ? (
          <img
            src={flagHref}
            alt=""
            aria-hidden
            className={cn('mt-0.5 h-4 w-auto rounded-[2px]', right ? 'self-end' : 'self-start')}
            onError={(e) => {
              e.currentTarget.style.display = 'none'
            }}
          />
        ) : null}
      </div>
    </div>
  )
}

const CAREER_STATS: Array<{ key: string; label: string }> = [
  { key: 'strikeLPM', label: 'Sig. str. per min' },
  { key: 'strikeAccuracy', label: 'Sig. str. accuracy' },
  { key: 'takedownAvg', label: 'Takedowns per 15 min' },
  { key: 'takedownAccuracy', label: 'Takedown accuracy' },
  { key: 'submissionAvg', label: 'Subs per 15 min' }
]

function TaleOfTheTape({ a, b }: { a?: EspnCompetitor; b?: EspnCompetitor }): React.JSX.Element {
  const statsA = useQuery({ ...athleteStatsQuery(a?.athlete?.id ?? ''), enabled: !!a?.athlete?.id })
  const statsB = useQuery({ ...athleteStatsQuery(b?.athlete?.id ?? ''), enabled: !!b?.athlete?.id })
  const physical: Array<[string, string, string]> = [
    ['Height', a?.athlete?.displayHeight ?? '—', b?.athlete?.displayHeight ?? '—'],
    ['Weight', a?.athlete?.displayWeight ?? '—', b?.athlete?.displayWeight ?? '—'],
    ['Age', fmt(a?.athlete?.age), fmt(b?.athlete?.age)],
    ['Reach', a?.athlete?.displayReach ?? '—', b?.athlete?.displayReach ?? '—'],
    ['Stance', a?.athlete?.stance?.text ?? '—', b?.athlete?.stance?.text ?? '—']
  ]
  // isLoading (not isPending) so a fighter with no athlete id — query disabled
  // forever — shows the dash, not an eternal skeleton.
  const readyA = !statsA.isLoading
  const readyB = !statsB.isLoading
  // Each fighter faces the center, like a staredown.
  const poseA = stanceImage(a?.athlete, 'right')
  const poseB = stanceImage(b?.athlete, 'left')
  return (
    <div className="oa-arrive flex flex-col border-t border-border px-5 py-4">
      <div className="flex items-center gap-2">
        <StancePose src={poseA} name={a?.athlete?.displayName} />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          {physical.map(([label, va, vb]) => (
            <TapeRow
              key={label}
              label={label}
              va={<TapeValue value={va} />}
              vb={<TapeValue value={vb} align="right" />}
            />
          ))}
          {CAREER_STATS.map((s) => (
            <TapeRow
              key={s.label}
              label={s.label}
              va={<StatCell ready={readyA} value={statsA.data?.[s.key] ?? '—'} />}
              vb={<StatCell ready={readyB} value={statsB.data?.[s.key] ?? '—'} align="right" />}
            />
          ))}
        </div>
        <StancePose src={poseB} name={b?.athlete?.displayName} />
      </div>
      <KalshiMarketChart a={a?.athlete?.displayName} b={b?.athlete?.displayName} />
    </div>
  )
}

function TapeRow({
  label,
  va,
  vb
}: {
  label: string
  va: React.ReactNode
  vb: React.ReactNode
}): React.JSX.Element {
  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 py-1">
      <div className="min-w-0">{va}</div>
      <span className="min-w-[150px] text-center text-[11px] leading-[14px] font-medium tracking-[0.08em] text-text-muted uppercase">
        {label}
      </span>
      <div className="min-w-0">{vb}</div>
    </div>
  )
}

function TapeValue({ value, align }: { value: string; align?: 'right' }): React.JSX.Element {
  return (
    <span
      className={cn(
        'block text-[13px] leading-4 font-medium text-text tabular-nums',
        align === 'right' && 'text-right'
      )}
    >
      {value}
    </span>
  )
}

function StatCell({
  ready,
  value,
  align
}: {
  ready: boolean
  value: string
  align?: 'right'
}): React.JSX.Element {
  return (
    <SkeletonSwap
      ready={ready}
      lines={1}
      lineHeight={16}
      skeleton={
        <div className={cn('flex h-4 items-center', align === 'right' && 'justify-end')}>
          <Bar className="w-12" />
        </div>
      }
    >
      <TapeValue value={value} align={align} />
    </SkeletonSwap>
  )
}

function fmt(n?: number): string {
  return n !== undefined ? String(n) : '—'
}

function StancePose({ src, name }: { src?: string; name?: string }): React.JSX.Element | null {
  if (!src) return null
  return (
    <img
      src={src}
      alt={name ?? ''}
      loading="lazy"
      className="h-[240px] w-[130px] shrink-0 object-contain object-bottom"
      onError={(e) => {
        e.currentTarget.style.display = 'none'
      }}
    />
  )
}

// Matches the skeleton-swap bar style used across the app.
function Bar({ className }: { className?: string }): React.JSX.Element {
  return <div className={cn('h-[9px] rounded-[5px] bg-white/[0.06]', className)} />
}

// Pixel-matched wait: a segment title and three bout-row shapes drawn in the
// skeleton-swap bar style. Deliberately no image placeholders — images load
// in place.
function BoutRowsSkeleton(): React.JSX.Element {
  return (
    <div aria-hidden className="flex flex-col gap-3">
      <div className="flex h-5 items-center">
        <Bar className="w-28" />
      </div>
      {Array.from({ length: 3 }).map((_, i) => (
        <div
          key={i}
          className="grid h-[88px] grid-cols-[1fr_auto_1fr] items-center gap-4 rounded-xl bg-surface px-5"
          style={{ boxShadow: 'var(--shadow-resting)' }}
        >
          <div className="flex flex-col gap-2">
            <Bar className="w-32" />
            <Bar className="w-20" />
          </div>
          <Bar className="w-24" />
          <div className="flex flex-col items-end gap-2">
            <Bar className="w-32" />
            <Bar className="w-20" />
          </div>
        </div>
      ))}
    </div>
  )
}
