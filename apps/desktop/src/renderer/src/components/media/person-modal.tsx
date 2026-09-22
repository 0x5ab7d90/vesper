import { useEffect, useRef, useState } from 'react'
import { Dialog } from '@base-ui/react/dialog'
import { useQuery } from '@tanstack/react-query'
import { useRouterState } from '@tanstack/react-router'
import { m as motion } from 'motion/react'
import { Avatar } from '@renderer/components/ui/avatar'
import { Segmented } from '@renderer/components/ui/segmented'
import { Skeleton } from '@renderer/components/ui/skeleton'
import { SquircleSurface, squircleStyle } from '@renderer/components/ui/squircle-surface'
import { CloseIcon } from '@renderer/components/icons'
import { DitherCorner } from '@renderer/components/brand/dither-corner'
import {
  PersonFilmography,
  type PersonFilmographyFilter,
  type PersonFilmographyItem
} from '@renderer/components/media/person-filmography'
import { cn } from '@renderer/lib/cn'
import { closePerson, usePersonModalId } from '@renderer/lib/person-modal'
import { personCombinedCreditsQuery, personDetailsQuery } from '@renderer/lib/tmdb-queries'
import {
  formatBirthLine,
  personCreditTitle,
  personCreditYear,
  tmdbImage,
  type TmdbPersonCastCredit
} from '@renderer/lib/tmdb'

const POP = { type: 'spring', stiffness: 400, damping: 26 } as const
const BACKDROP_TILE_COUNT = 8

const TABS: { value: PersonFilmographyFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'movie', label: 'Movies' },
  { value: 'tv', label: 'TV' }
]

/** Mounted once in the authenticated layout; opens for whichever person the store holds. */
export function PersonModal(): React.JSX.Element {
  const personId = usePersonModalId()
  return (
    <Dialog.Root open={personId !== null} onOpenChange={(open) => (open ? null : closePerson())}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" />
        <Dialog.Popup
          aria-label="Person"
          className="fixed top-1/2 left-1/2 z-50 w-[min(1300px,96vw)] -translate-x-1/2 -translate-y-1/2 outline-none"
        >
          {personId !== null ? <PersonBody key={personId} personId={personId} /> : null}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

function PersonBody({ personId }: { personId: number }): React.JSX.Element {
  const details = useQuery(personDetailsQuery(personId))
  const credits = useQuery(personCombinedCreditsQuery(personId))
  const [filter, setFilter] = useState<PersonFilmographyFilter>('all')
  useCloseOnNavigate()

  const cast = credits.data?.cast ?? []
  const significant = dedupeCredits(cast).filter(isSignificantCredit)

  const backdrops = significant
    .toSorted((a, b) => (b.vote_count ?? 0) - (a.vote_count ?? 0))
    .map((c) => tmdbImage(c.backdrop_path, 'w780'))
    .filter((u): u is string => !!u)
    .slice(0, BACKDROP_TILE_COUNT)

  // Ordered by how well known each credit is. Newest first buries the roles someone is famous
  // for under whatever they shot last, which is rarely what you opened the card to find.
  const filmography: PersonFilmographyItem[] = significant
    .filter((c) => c.poster_path)
    .toSorted((a, b) => b.popularity - a.popularity)
    .map((c) => ({
      id: c.id,
      type: c.media_type,
      title: personCreditTitle(c),
      poster: tmdbImage(c.poster_path, 'w185') ?? '',
      character: c.character || '',
      year: personCreditYear(c)
    }))

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96, y: 8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={POP}
      className="relative flex h-[min(1052px,94vh)] gap-1.5 bg-surface-2 p-1.5 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06),0_24px_64px_rgba(0,0,0,0.5)]"
      style={squircleStyle('frame')}
    >
      {/* Clear of the 320px identity card, the way the profile modal's field is. */}
      <DitherCorner width="calc(100% - 420px)" fadeInTo={40} />
      <SquircleSurface variant="inset" className="relative w-[320px] shrink-0 overflow-hidden">
        {details.data ? (
          <Identity
            name={details.data.name}
            born={formatBirthLine(details.data)}
            bio={details.data.biography ?? ''}
            profile={tmdbImage(details.data.profile_path, 'h632')}
            gender={details.data.gender}
            backdrops={backdrops}
          />
        ) : (
          <IdentitySkeleton />
        )}
      </SquircleSurface>

      <div className="relative flex min-w-0 flex-1 flex-col">
        <div className="flex shrink-0 items-center justify-between gap-2 pt-1 pr-1 pb-1.5 pl-1">
          <Segmented options={TABS} value={filter} onChange={setFilter} />
          <button
            type="button"
            onClick={closePerson}
            aria-label="Close"
            className="flex size-7 items-center justify-center rounded-full text-text-tertiary outline-none hover:bg-white/[0.08] hover:text-white active:opacity-70"
          >
            <CloseIcon className="size-3" />
          </button>
        </div>
        <SquircleSurface variant="inset" className="min-h-0 flex-1 overflow-hidden">
          <div className="scroll-hide flex h-full flex-col gap-6 overflow-y-auto py-4">
            {credits.isLoading ? (
              <CreditsSkeleton />
            ) : (
              <PersonFilmography items={filmography} filter={filter} />
            )}
          </div>
        </SquircleSurface>
      </div>
    </motion.div>
  )
}

/**
 * Opening a title from inside the modal should leave you on that title, not behind a sheet you
 * have to dismiss. Watching the route rather than threading a callback through every card keeps
 * the credit lists usable on their own.
 */
function useCloseOnNavigate(): void {
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const openedAt = useRef(pathname)
  useEffect(() => {
    if (pathname !== openedAt.current) closePerson()
  }, [pathname])
}

function Identity({
  name,
  born,
  bio,
  profile,
  gender,
  backdrops
}: {
  name: string
  born: string
  bio: string
  profile: string | undefined
  gender: number
  backdrops: string[]
}): React.JSX.Element {
  return (
    <div className="flex h-full flex-col">
      <CollageBanner tiles={backdrops} name={name} />
      <div className="scroll-hide relative -mt-12 flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 pb-4">
        {/* The ring is the card's own surface, so a transparent headshot never shows the
            collage through itself. */}
        <span className="inline-flex size-[96px] shrink-0 rounded-full bg-surface p-1.5">
          <Avatar
            size="2xl"
            className="size-full bg-surface-2"
            alt={name}
            fallback="silhouette"
            gender={gender}
            src={profile}
          />
        </span>
        <div className="flex flex-col gap-0.5">
          <h2 className="text-[18px] leading-6 font-medium tracking-[-0.01em] text-balance text-text">
            {name}
          </h2>
          {born ? (
            <span className="text-[12px] leading-4 font-medium text-text-tertiary">{born}</span>
          ) : null}
        </div>
        <Bio text={bio} />
      </div>
    </div>
  )
}

const BIO_CLAMP_LINES = 9
// Roughly what fits in the clamp at this column width. A short bio stays plain text rather than
// becoming a control that does nothing.
const BIO_EXPANDABLE_CHARS = 380

const BIO_TEXT = 'text-[13px] leading-[1.5] font-medium text-text-secondary'

/**
 * TMDB biographies run to essays. Show the opening and let the paragraph itself be the control —
 * the text is the biggest, most obvious target on the card, so a separate link under it is one
 * more thing to aim at for no added clarity. Hover is instant: it fires constantly, and a fade
 * here would trail the pointer.
 */
function Bio({ text }: { text: string }): React.JSX.Element | null {
  const [open, setOpen] = useState(false)
  if (!text) return null
  if (text.length <= BIO_EXPANDABLE_CHARS) return <p className={BIO_TEXT}>{text}</p>
  return (
    <button
      type="button"
      onClick={() => setOpen((v) => !v)}
      aria-expanded={open}
      className={cn(BIO_TEXT, 'bg-transparent text-left outline-none hover:text-text')}
      style={
        open
          ? undefined
          : {
              display: '-webkit-box',
              WebkitBoxOrient: 'vertical',
              WebkitLineClamp: BIO_CLAMP_LINES,
              overflow: 'hidden'
            }
      }
    >
      {text}
    </button>
  )
}

/** The page hero's skewed tile collage, at banner height. */
function CollageBanner({ tiles, name }: { tiles: string[]; name: string }): React.JSX.Element {
  return (
    <div
      className="relative h-[120px] w-full shrink-0 overflow-hidden bg-surface-2"
      aria-label={name}
    >
      {tiles.length > 0 ? (
        <div
          className="absolute top-0 bottom-0 flex"
          style={{ left: '-12%', right: '-12%', transform: 'skewX(-12deg)' }}
        >
          {tiles.map((src, i) => (
            <div
              key={`${i}-${src}`}
              className="h-full flex-1 bg-cover bg-center"
              style={{ backgroundImage: `url(${src})`, transform: 'skewX(12deg)' }}
            />
          ))}
        </div>
      ) : null}
    </div>
  )
}

function IdentitySkeleton(): React.JSX.Element {
  return (
    <div className="flex h-full flex-col">
      <Skeleton className="h-[120px] w-full rounded-none" />
      <div className="-mt-12 flex min-h-0 flex-1 flex-col gap-4 px-4 pb-4">
        <span className="inline-flex size-[96px] rounded-full bg-surface p-1.5">
          <Skeleton className="size-full rounded-full" />
        </span>
        <div className="flex flex-col gap-1.5">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-3 w-28" />
        </div>
        <div className="flex flex-col gap-1.5">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-3.5 w-full" />
          ))}
          <Skeleton className="h-3.5 w-2/3" />
        </div>
      </div>
    </div>
  )
}

function CreditsSkeleton(): React.JSX.Element {
  return (
    <div className="flex flex-col gap-3 px-6">
      {Array.from({ length: 10 }, (_, i) => (
        <Skeleton key={i} className="h-14 w-full rounded-[10px]" />
      ))}
    </div>
  )
}

function dedupeCredits(cast: TmdbPersonCastCredit[]): TmdbPersonCastCredit[] {
  const seen = new Map<string, TmdbPersonCastCredit>()
  for (const c of cast) {
    const key = `${c.media_type}:${c.id}`
    const existing = seen.get(key)
    if (!existing || c.popularity > existing.popularity) {
      seen.set(key, c)
    }
  }
  return [...seen.values()]
}

const SELF_RE = /^(self|himself|herself|host|presenter|narrator)\b/i

function isSignificantCredit(c: TmdbPersonCastCredit): boolean {
  if (SELF_RE.test((c.character ?? '').trim())) return false
  return true
}
