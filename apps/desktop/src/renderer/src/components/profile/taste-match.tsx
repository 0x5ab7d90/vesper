import type { FunctionReturnType } from 'convex/server'
import { squircleStyle } from '@renderer/components/ui/squircle-surface'
import { VisitorSlot } from '@renderer/components/profile/showcase'
import { api } from '@convex/_generated/api'

export type TasteMatchData = FunctionReturnType<typeof api.tasteMatch.withUsername>
type Match = NonNullable<TasteMatchData>

function titlesPhrase(n: number): string {
  return n === 1 ? '1 title' : `${n} titles`
}

/**
 * How your ratings line up with this person's, on someone else's card. A score once you have
 * rated enough of the same titles, then what you both love. Renders nothing on your own card
 * or when their activity is hidden.
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
        <Score match={match} />
        <Shared titles={match.shared} />
      </div>
    </div>
  )
}

function Score({ match }: { match: Match }): React.JSX.Element {
  if (match.percent === null) {
    return (
      <p className="text-[12px] leading-4 font-medium text-text-tertiary">
        {match.compared === 0
          ? 'Rate some titles you have both seen to get a score.'
          : `You've both rated ${titlesPhrase(match.compared)}. A few more and there's a score.`}
      </p>
    )
  }
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[22px] leading-7 font-medium tracking-[-0.01em] text-text tabular-nums">
        {match.percent}%
      </span>
      {match.inCommon > match.compared ? (
        <span className="text-[11px] leading-4 font-medium text-text-muted tabular-nums">
          {titlesPhrase(match.inCommon)} watched in common
        </span>
      ) : null}
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
