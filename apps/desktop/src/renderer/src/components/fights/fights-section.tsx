import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { ScrollSection } from '@renderer/components/ui/scroll-section'
import { FightEventCard } from './fight-event-card'
import { FightStreamPicker } from './fight-stream-picker'
import {
  fightMatchesQuery,
  fightPosterUrl,
  isFightLive,
  isFightToday,
  liveMatchesQuery,
  streamKey,
  type FightMatch
} from '@renderer/lib/fights/api'

// The Fights row: live fights first, then today's upcoming ones. It renders
// nothing at all on quiet days or when the source is down — the homepage never
// shows an empty shelf for it. A card opens the fight's streams in the picker,
// before the start time too: streams often go up early.
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

  // The picked fight stays set while the dialog closes, so its title doesn't
  // blank out mid-animation.
  const [picking, setPicking] = useState<FightMatch | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)

  if (rows.length === 0) return null

  return (
    <>
      <ScrollSection title="Fights">
        {rows.map(({ match, live }) => (
          <FightEventCard
            key={match.id}
            title={match.title}
            poster={fightPosterUrl(match)}
            live={live}
            timeLabel={
              live
                ? undefined
                : new Date(match.date).toLocaleTimeString([], {
                    hour: 'numeric',
                    minute: '2-digit'
                  })
            }
            onClick={() => {
              setPicking(match)
              setPickerOpen(true)
            }}
          />
        ))}
      </ScrollSection>
      <FightStreamPicker
        match={picking}
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        onPicked={({ stream, url }) => {
          if (!picking) return
          void navigate({
            to: '/watch-fight/$id',
            params: { id: picking.id },
            search: {
              title: picking.title,
              poster: fightPosterUrl(picking),
              stream: streamKey(stream),
              url
            },
            viewTransition: false
          })
        }}
      />
    </>
  )
}
