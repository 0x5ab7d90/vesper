import { useMemo, useState } from 'react'
import { Button as BaseButton } from '@base-ui/react/button'
import { AnimatePresence, m as motion, useReducedMotion } from 'motion/react'
import { useNavigate } from '@tanstack/react-router'
import { cn } from '@renderer/lib/cn'
import { SectionTitle } from '@renderer/components/ui/section-title'
import { EASE_OUT, EXIT_FADE } from '@renderer/lib/motion'

export interface PersonFilmographyItem {
  id: number
  type: 'movie' | 'tv'
  title: string
  poster: string
  character: string
  year: string
  sortDate: number
}

type Filter = 'all' | 'movie' | 'tv'

const ANIM = { duration: 0.18, ease: EASE_OUT }

export function PersonFilmography({
  items
}: {
  items: PersonFilmographyItem[]
}): React.JSX.Element | null {
  const navigate = useNavigate()
  const [filter, setFilter] = useState<Filter>('all')
  const reduced = useReducedMotion()

  const filtered = useMemo(() => {
    if (filter === 'all') return items
    return items.filter((i) => i.type === filter)
  }, [items, filter])

  if (items.length === 0) return null

  return (
    <section className="flex flex-col gap-4 px-6">
      <div className="flex items-center justify-between">
        <SectionTitle>Filmography</SectionTitle>
        <Tabs value={filter} onChange={setFilter} />
      </div>
      <div className="flex flex-col">
        <AnimatePresence initial={false} mode="popLayout">
          {filtered.map((item) => (
            <motion.button
              key={`${item.type}-${item.id}`}
              type="button"
              layout={reduced ? false : 'position'}
              initial={reduced ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={EXIT_FADE}
              transition={ANIM}
              onClick={() =>
                navigate({
                  to: item.type === 'movie' ? '/movie/$id' : '/tv/$id',
                  params: { id: String(item.id) },
                  viewTransition: false
                })
              }
              className="flex items-center gap-3 border-b border-white/[0.04] bg-transparent py-3 text-left outline-none last:border-b-0"
              aria-label={item.title}
            >
              <div
                className="h-14 w-10 shrink-0 overflow-hidden rounded-md bg-surface-2 bg-cover bg-center"
                style={{ backgroundImage: item.poster ? `url(${item.poster})` : undefined }}
              />
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="line-clamp-1 text-[14px] leading-5 font-semibold text-text">
                  {item.title}
                </span>
                <span className="line-clamp-1 text-[13px] leading-4 font-medium text-text-tertiary">
                  {item.character || (item.type === 'tv' ? 'TV series' : 'Movie')}
                </span>
              </div>
              <span className="shrink-0 text-[13px] leading-4 font-medium tabular-nums text-text-tertiary">
                {item.year || '—'}
              </span>
            </motion.button>
          ))}
        </AnimatePresence>
      </div>
    </section>
  )
}

const TABS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'movie', label: 'Movies' },
  { key: 'tv', label: 'TV' }
]

function Tabs({
  value,
  onChange
}: {
  value: Filter
  onChange: (v: Filter) => void
}): React.JSX.Element {
  return (
    <div className="inline-flex items-center gap-1 rounded-lg bg-surface-2 p-1">
      {TABS.map((t) => (
        <BaseButton
          key={t.key}
          onClick={() => onChange(t.key)}
          className={cn(
            'rounded-md px-3 py-1 text-[12px] leading-4 font-semibold outline-none transition-colors',
            value === t.key ? 'bg-white/15 text-text' : 'bg-transparent text-text-tertiary'
          )}
          aria-pressed={value === t.key}
        >
          {t.label}
        </BaseButton>
      ))}
    </div>
  )
}
