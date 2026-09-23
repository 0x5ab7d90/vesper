import { useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { AnimatePresence, m as motion } from 'motion/react'
import { api } from '@convex/_generated/api'
import { Row } from '@renderer/components/settings/integration-row'
import { Button } from '@renderer/components/ui/button'
import { ProgressBar } from '@renderer/components/ui/progress-bar'
import { Ring } from '@renderer/components/ui/spinner'
import { TextField } from '@renderer/components/ui/text-field'
import { cn } from '@renderer/lib/cn'

// The IMDb row. One-way: paste a public profile link, Vesper imports the ratings, watchlist
// and lists it can see, then keeps syncing them (see useImdbSync and the imdb cron). Nothing
// is ever written back to IMDb.

const PANEL = { type: 'spring', stiffness: 550, damping: 38 } as const

// Syncs retry on their own, so the ways out say so.
const ERRORS = {
  'not-found': "That profile couldn't be found. Check the link and try again.",
  private:
    'Nothing on that profile is public. Make your ratings or watchlist public on IMDb and Vesper will pick them up.',
  unavailable: "IMDb isn't answering right now. Vesper will try again on its own.",
  failed: 'Something went wrong partway through. Sync now to pick up the rest.'
} as const

export function ImdbIntegration(): React.JSX.Element {
  const connection = useQuery(api.imdb.connection)
  const connect = useMutation(api.imdb.connect)
  const runAgain = useMutation(api.imdb.runAgain)
  const disconnect = useMutation(api.imdb.disconnect)
  const addLists = useMutation(api.imdb.addLists)

  const [editing, setEditing] = useState(false)
  const [link, setLink] = useState('')
  const [linkError, setLinkError] = useState<string | undefined>()
  const [submitting, setSubmitting] = useState(false)

  const submit = async (): Promise<void> => {
    if (submitting) return
    setSubmitting(true)
    setLinkError(undefined)
    try {
      await connect({ link })
      setEditing(false)
      setLink('')
    } catch (err) {
      const msg = err instanceof Error ? err.message : ''
      setLinkError(
        msg.includes('invalid-link')
          ? "That doesn't look like an IMDb profile link."
          : msg.includes('already-running')
            ? 'An import is already running.'
            : "Couldn't start the import. Try again."
      )
    } finally {
      setSubmitting(false)
    }
  }

  const icon = <ImdbMark className="size-[26px] rounded-[7px]" />

  if (!connection) {
    return (
      <div className="flex flex-col">
        <Row
          icon={icon}
          title="IMDb"
          description="Bring in ratings, your watchlist and lists from a public IMDb profile, and keep them coming."
          trailing={
            <Button
              variant="secondary"
              size="sm"
              className="shrink-0 rounded-md"
              onClick={() => setEditing((v) => !v)}
            >
              Connect
            </Button>
          }
        />
        <Reveal open={editing}>
          <form
            className="flex flex-col gap-3 py-3 pr-1 pl-[46px]"
            onSubmit={(e) => {
              e.preventDefault()
              void submit()
            }}
          >
            <TextField
              autoFocus
              value={link}
              onChange={(e) => setLink(e.target.value)}
              placeholder="https://www.imdb.com/user/…"
              spellCheck={false}
              error={linkError}
              hint="Your profile, ratings, or watchlist link all work. Only what IMDb shows publicly is read."
            />
            <div className="flex items-center gap-2">
              <Button
                type="submit"
                variant="secondary"
                size="sm"
                className="rounded-md"
                disabled={submitting || link.trim().length === 0}
              >
                {submitting ? <Ring className="size-3.5" /> : null}
                Connect
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="rounded-md text-text-muted hover:text-text"
                onClick={() => {
                  setEditing(false)
                  setLinkError(undefined)
                }}
              >
                Cancel
              </Button>
            </div>
          </form>
        </Reveal>
      </div>
    )
  }

  const running = connection.status === 'running'
  // An import someone is watching gets the progress bar; a sync keeps the summary on show.
  const importing = running && !connection.syncing
  const who = connection.nickName ?? connection.imdbUserId ?? 'IMDb'
  const profileUrl = connection.imdbUserId
    ? `https://www.imdb.com/user/${connection.imdbUserId}/`
    : connection.link

  return (
    <div className="flex flex-col">
      <Row
        icon={icon}
        title="IMDb"
        description={
          importing ? (
            'Importing…'
          ) : (
            <>
              Syncing from{' '}
              <button
                type="button"
                onClick={() => window.open(profileUrl, '_blank', 'noopener,noreferrer')}
                className="font-semibold text-text outline-none transition-opacity active:opacity-80"
              >
                {who}
              </button>
            </>
          )
        }
        trailing={
          <div className="flex shrink-0 items-center gap-1.5">
            <Button
              variant="secondary"
              size="sm"
              className="rounded-md"
              disabled={running}
              onClick={() => void runAgain().catch(() => undefined)}
            >
              {running ? <Ring className="size-3.5" /> : null}
              {importing ? 'Importing' : running ? 'Syncing' : 'Sync now'}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="rounded-md text-text-muted hover:text-red-400"
              onClick={() => void disconnect()}
            >
              Remove
            </Button>
          </div>
        }
      />
      <div className="flex flex-col bg-white/[0.015]">
        {importing ? (
          <Progress progress={connection.progress} />
        ) : connection.error && (connection.status === 'failed' || running) ? (
          <p className="py-3 pr-1 pl-[46px] text-[12px] leading-4 font-medium text-text-tertiary">
            {ERRORS[connection.error]}
          </p>
        ) : connection.lastRun ? (
          <Summary run={connection.lastRun} lists={connection.lists} />
        ) : null}
        {/* Pasting is only the way in when IMDb refused to show the lists page. */}
        {!running && connection.listsDiscovery === 'blocked' ? (
          <AddList onAdd={(id) => addLists({ imdbListIds: [id], source: 'pasted' })} />
        ) : null}
      </div>
    </div>
  )
}

function Progress({
  progress
}: {
  progress: { done: number; total: number } | undefined
}): React.JSX.Element {
  const pct = progress && progress.total > 0 ? (progress.done / progress.total) * 100 : 0
  return (
    <div role="status" className="flex items-center gap-3 py-3 pr-1 pl-[46px]">
      <ProgressBar variant="interior" value={pct} className="flex-1" />
      <span className="shrink-0 text-[12px] leading-4 font-medium text-text-tertiary tabular-nums">
        {progress
          ? `${progress.done.toLocaleString()} / ${progress.total.toLocaleString()}`
          : 'Finding your profile…'}
      </span>
    </div>
  )
}

function Summary({
  run,
  lists
}: {
  run: {
    ratings: number
    watchlist: number
    lists?: number
    unmatched: { title: string; year?: number; reason: string }[]
    finishedAt?: number
  }
  lists: { imdbListId: string; name: string; markWatched: boolean; total?: number }[]
}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const named = lists.filter((l) => l.name)
  const parts = [
    `${run.ratings.toLocaleString()} ${run.ratings === 1 ? 'rating' : 'ratings'}`,
    `${run.watchlist.toLocaleString()} on your watchlist`
  ]
  if (named.length > 0) parts.push(`${named.length} ${named.length === 1 ? 'list' : 'lists'}`)
  return (
    <div className="flex flex-col py-3 pr-1 pl-[46px]">
      <div className="flex items-center gap-2 text-[12px] leading-4 font-medium text-text-tertiary tabular-nums">
        <span>{parts.join(' · ')}</span>
        {run.unmatched.length > 0 ? (
          <>
            <span aria-hidden>·</span>
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              className="text-text outline-none transition-opacity active:opacity-70"
            >
              {run.unmatched.length.toLocaleString()} not found
            </button>
          </>
        ) : null}
        {run.finishedAt ? (
          <span className="ml-auto shrink-0 text-text-muted">Synced {ago(run.finishedAt)}</span>
        ) : null}
      </div>
      <Reveal open={open}>
        <ul className="flex flex-col gap-1 pt-3">
          {run.unmatched.map((u, i) => (
            <li
              key={`${u.title}-${i}`}
              className="flex items-baseline gap-2 text-[12px] leading-4 font-medium"
            >
              <span className="truncate text-text-secondary">{u.title}</span>
              {u.year ? (
                <span className="shrink-0 text-text-muted tabular-nums">{u.year}</span>
              ) : null}
              <span className="ml-auto shrink-0 text-text-muted">{reasonLabel(u.reason)}</span>
            </li>
          ))}
        </ul>
      </Reveal>
    </div>
  )
}

/** Paste a public list link — shown only when IMDb blocked the lists page. */
function AddList({
  onAdd
}: {
  onAdd: (imdbListId: string) => Promise<unknown>
}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState('')
  const [error, setError] = useState<string | undefined>()
  const [busy, setBusy] = useState(false)

  const submit = async (): Promise<void> => {
    const m = value.trim().match(/(?:^|\/list\/)(ls\d{6,12})(?:[/?#]|$)/i)
    if (!m) {
      setError("That doesn't look like an IMDb list link.")
      return
    }
    setBusy(true)
    setError(undefined)
    try {
      await onAdd(m[1]!.toLowerCase())
      setValue('')
      setOpen(false)
    } catch {
      setError("Couldn't add that list. Try again.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col border-t border-white/[0.05] py-3 pr-1 pl-[46px]">
      <div className="flex items-center justify-between gap-4">
        <span className="text-[12px] leading-4 font-medium text-text-muted">
          IMDb wouldn&apos;t show your lists page. Paste a list link to sync it.
        </span>
        <Button
          variant="ghost"
          size="sm"
          className="shrink-0 rounded-md text-text-tertiary hover:text-text"
          onClick={() => setOpen((v) => !v)}
        >
          Add a list
        </Button>
      </div>
      <Reveal open={open}>
        <form
          className="flex flex-col gap-3 pt-3"
          onSubmit={(e) => {
            e.preventDefault()
            void submit()
          }}
        >
          <TextField
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="https://www.imdb.com/list/ls…"
            spellCheck={false}
            error={error}
          />
          <div className="flex items-center gap-2">
            <Button
              type="submit"
              variant="secondary"
              size="sm"
              className="rounded-md"
              disabled={busy || value.trim().length === 0}
            >
              {busy ? <Ring className="size-3.5" /> : null}
              Add list
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="rounded-md text-text-muted hover:text-text"
              onClick={() => {
                setOpen(false)
                setError(undefined)
              }}
            >
              Cancel
            </Button>
          </div>
        </form>
      </Reveal>
    </div>
  )
}

function reasonLabel(reason: string): string {
  switch (reason) {
    case 'tvEpisode':
      return 'episode'
    case 'videoGame':
      return 'game'
    case 'musicVideo':
      return 'music video'
    case 'podcastSeries':
    case 'podcastEpisode':
      return 'podcast'
    default:
      return 'not on TMDB'
  }
}

/** Measured-height reveal for the rows' expanding sub-areas. */
function Reveal({
  open,
  children
}: {
  open: boolean
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <AnimatePresence initial={false}>
      {open ? (
        <motion.div
          key="reveal"
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0, transition: { duration: 0.16, ease: 'easeOut' } }}
          transition={PANEL}
          className="overflow-hidden"
        >
          {children}
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}

function ago(ts: number): string {
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000))
  if (s < 60) return 'just now'
  const m = Math.round(s / 60)
  if (m < 60) return `${m} min ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h} ${h === 1 ? 'hour' : 'hours'} ago`
  const d = Math.round(h / 24)
  if (d < 30) return `${d} ${d === 1 ? 'day' : 'days'} ago`
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

/** IMDb's yellow mark, drawn inline so it ships with the app like the other brand icons. */
function ImdbMark({ className }: { className?: string }): React.JSX.Element {
  return (
    <svg viewBox="0 0 32 32" aria-hidden className={cn('shrink-0', className)}>
      <rect width="32" height="32" fill="#F5C518" />
      <text
        x="16"
        y="19.5"
        textAnchor="middle"
        fontFamily="Inter, system-ui, sans-serif"
        fontSize="10"
        fontWeight="800"
        letterSpacing="-0.3"
        fill="#000"
      >
        IMDb
      </text>
    </svg>
  )
}
