import type { FunctionReturnType } from 'convex/server'
import { squircleStyle } from '@renderer/components/ui/squircle-surface'
import { VisitorSlot } from '@renderer/components/profile/showcase'
import { api } from '@convex/_generated/api'

export type TasteMatchData = FunctionReturnType<typeof api.tasteMatch.withUsername>
type Match = NonNullable<TasteMatchData>

/**
 * How your ratings line up with this person's, on someone else's card, then what you both
 * love. Renders nothing on your own card, when their activity is hidden, or until you have
 * rated enough of the same titles for a score.
 */
export function TasteMatch({ match }: { match: TasteMatchData }): React.JSX.Element | null {
  if (!match) return null
  return (
    <div className="flex flex-col gap-2">
      <span className="text-[11px] leading-4 font-medium text-text-muted">Taste match</span>
      <div
        className="flex flex-col gap-3 bg-surface-2 p-3 shadow-edge"
        style={squircleStyle('inset-sm')}
      >
        <span className="text-[22px] leading-7 font-medium tracking-[-0.01em] text-text tabular-nums">
          {match.percent}%
        </span>
        <Shared titles={match.shared} />
      </div>
    </div>
  )
}

function Shared({ titles }: { titles: Match['shared'] }): React.JSX.Element | null {
  if (titles.length === 0) return null
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[11px] leading-4 font-medium text-text-muted">You both love</span>
      <div className="grid grid-cols-4 gap-2">
        {titles.map((item) => (
          <VisitorSlot key={`${item.mediaType}-${item.tmdbId}`} item={item} />
        ))}
      </div>
    </div>
  )
}
