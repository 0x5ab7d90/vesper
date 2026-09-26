import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { ScrollSection } from '@renderer/components/ui/scroll-section'
import { FightEventCard } from './fight-event-card'
import {
  fightMatchesQuery,
  fightPosterUrl,
  isFightLive,
  isFightToday,
  isUfcTitle,
  liveMatchesQuery,
  type FightMatch
} from '@renderer/lib/fights/api'
import { matchEspnEvent, ufcScoreboardQuery, type EspnEvent } from '@renderer/lib/fights/espn'

// The Fights row: live fights first, then today's upcoming ones. It renders
// nothing at all on quiet days or when the source is down — the homepage never
// shows an empty shelf for it.
export function FightsSection(): React.JSX.Element | null {
  const navigate = useNavigate()
  const matches = useQuery(fightMatchesQuery())
  const liveMatches = useQuery(liveMatchesQuery())

  // Re-read the clock every half minute so a fight flips to live at its start
  // time, not at the next refetch.
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(id)
  }, [])

  const rows = useMemo(() => {
    const liveFights = (liveMatches.data ?? []).filter((m) => m.category === 'fight')
    const liveIds = new Set(liveFights.map((m) => m.id))
    // A live fight the fight list doesn't carry still belongs on the shelf.
    const all = [...(matches.data ?? [])]
    for (const m of liveFights) if (!all.some((x) => x.id === m.id)) all.push(m)
    const liveRows = all.filter((m) => isFightLive(m, liveIds, now))
    const upcoming = all
      .filter((m) => !isFightLive(m, liveIds, now) && isFightToday(m, now) && m.date > now)
      .sort((a, b) => a.date - b.date)
    return [
      ...liveRows.map((m) => ({ match: m, live: true })),
      ...upcoming.map((m) => ({ match: m, live: false }))
    ]
  }, [matches.data, liveMatches.data, now])

  const anyUfc = rows.some((r) => isUfcTitle(r.match.title))
  const scoreboard = useQuery({ ...ufcScoreboardQuery(now), enabled: anyUfc })

  if (rows.length === 0) return null

  return (
    <ScrollSection title="Fights">
      {rows.map(({ match, live }) => (
        <FightRowCard
          key={match.id}
          match={match}
          live={live}
          espnEvents={scoreboard.data ?? []}
          onWatch={() =>
            void navigate({
              to: '/watch-fight/$id',
              params: { id: match.id },
              search: { title: match.title, poster: fightPosterUrl(match) },
              viewTransition: false
            })
          }
          onDetails={(espnId) =>
            void navigate({
              to: '/fights/$id',
              params: { id: match.id },
              search: { espnId },
              viewTransition: false
            })
          }
        />
      ))}
    </ScrollSection>
  )
}

function FightRowCard({
  match,
  live,
  espnEvents,
  onWatch,
  onDetails
}: {
  match: FightMatch
  live: boolean
  espnEvents: EspnEvent[]
  onWatch: () => void
  onDetails: (espnId: string) => void
}): React.JSX.Element {
  const espnEvent = isUfcTitle(match.title) ? matchEspnEvent(match, espnEvents) : null

  // UFC events with a matched card are clickable anytime; everything else is
  // watchable when live and inert until then.
  const onClick = espnEvent ? () => onDetails(espnEvent.id) : live ? onWatch : undefined

  const timeLabel = live
    ? undefined
    : new Date(match.date).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })

  return (
    <FightEventCard
      title={match.title}
      poster={fightPosterUrl(match)}
      live={live}
      timeLabel={timeLabel}
      onClick={onClick}
    />
  )
}
