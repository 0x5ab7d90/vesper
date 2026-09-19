import { useRef } from 'react'
import { Button as BaseButton } from '@base-ui/react/button'
import { useNavigate } from '@tanstack/react-router'
import { ScrollSection } from '@renderer/components/ui/scroll-section'
import { usePreloadRoute } from '@renderer/lib/use-preload-route'

export interface PersonKnownForItem {
  id: number
  type: 'movie' | 'tv'
  title: string
  poster: string
  character: string
  year: string
}

export function PersonKnownFor({
  items
}: {
  items: PersonKnownForItem[]
}): React.JSX.Element | null {
  const navigate = useNavigate()
  if (items.length === 0) return null
  return (
    <ScrollSection title="Known for">
      {items.map((item) => (
        <KnownForCard
          key={`${item.type}-${item.id}`}
          item={item}
          onClick={() =>
            navigate({
              to: item.type === 'movie' ? '/movie/$id' : '/tv/$id',
              params: { id: String(item.id) },
              viewTransition: false
            })
          }
        />
      ))}
    </ScrollSection>
  )
}

function KnownForCard({
  item,
  onClick
}: {
  item: PersonKnownForItem
  onClick: () => void
}): React.JSX.Element {
  const ref = useRef<HTMLButtonElement>(null)
  usePreloadRoute(ref, {
    to: item.type === 'movie' ? '/movie/$id' : '/tv/$id',
    params: { id: String(item.id) }
  })
  return (
    <BaseButton
      ref={ref}
      onClick={onClick}
      className="flex w-[120px] shrink-0 flex-col gap-2 bg-transparent text-left outline-none"
      aria-label={item.title}
    >
      <div
        className="h-[170px] w-full overflow-hidden rounded-md bg-surface-2 bg-cover bg-center"
        style={{ backgroundImage: item.poster ? `url(${item.poster})` : undefined }}
      />
      <div className="flex flex-col gap-0.5">
        <span className="line-clamp-1 text-[13px] leading-4 font-semibold text-text">
          {item.title}
        </span>
        <span className="line-clamp-1 text-[12px] leading-4 font-medium text-text-tertiary tabular-nums">
          {[item.character, item.year].filter(Boolean).join(', ')}
        </span>
      </div>
    </BaseButton>
  )
}
