import { useMemo } from 'react'
import { AnimatePresence, m as motion, useReducedMotion } from 'motion/react'
import { useNavigate } from '@tanstack/react-router'
import { IMG_OUTLINE } from '@renderer/components/ui/image-outline'
import { cn } from '@renderer/lib/cn'
import { EASE_OUT, EXIT_FADE } from '@renderer/lib/motion'

export interface PersonFilmographyItem {
  id: number
  type: 'movie' | 'tv'
  title: string
  poster: string
  character: string
  year: string
}

export type PersonFilmographyFilter = 'all' | 'movie' | 'tv'

const ANIM = { duration: 0.18, ease: EASE_OUT }

/** The credit list. The filter belongs to the modal, whose tab bar sits above the panel. */
export function PersonFilmography({
  items,
  filter
}: {
  items: PersonFilmographyItem[]
  filter: PersonFilmographyFilter
}): React.JSX.Element | null {
  const navigate = useNavigate()
  const reduced = useReducedMotion()

  const filtered = useMemo(() => {
    if (filter === 'all') return items
    return items.filter((i) => i.type === filter)
  }, [items, filter])

  if (items.length === 0) return null

  return (
    <div className="flex flex-col px-6">
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
              className={cn(
                'h-14 w-10 shrink-0 overflow-hidden rounded-md bg-surface-2 bg-cover bg-center',
                IMG_OUTLINE
              )}
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
  )
}
