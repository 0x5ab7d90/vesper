import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { CloseIcon, SearchIcon } from '@renderer/components/icons'
import type { PosterRowItem } from '@renderer/components/media/poster-row'
import { TV_GUTTER, TvPosterRow, TvPosterRowSkeleton } from '@renderer/components/tv/tv-row'
import { searchMoviesQuery, searchTvQuery, trendingAllQuery } from '@renderer/lib/tmdb-queries'
import { tmdbImage, trendingItemTitle } from '@renderer/lib/tmdb'
import { cn } from '@renderer/lib/cn'

const DEBOUNCE_MS = 300

// Search at ten feet: the field is the page's headline, and results arrive as the same poster
// rows the home screen uses. The query lives in the URL so going back restores it.
export function TvSearch(): React.JSX.Element {
  const { q } = useSearch({ from: '/_authenticated/search' })
  const navigate = useNavigate()
  const inputRef = useRef<HTMLInputElement>(null)
  const [text, setText] = useState(q ?? '')
  const query = (q ?? '').trim()

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    const next = text.trim()
    if (next === query) return
    const t = setTimeout(() => {
      void navigate({
        to: '/search',
        search: next ? { q: next } : {},
        replace: true
      })
    }, DEBOUNCE_MS)
    return () => clearTimeout(t)
  }, [text, query, navigate])

  return (
    <div className="flex min-h-screen flex-col gap-12 pt-32 pb-16">
      <div className={TV_GUTTER}>
        <label className="flex h-20 w-full max-w-[960px] items-center gap-5 rounded-full bg-white/10 px-8 ring-1 ring-transparent ring-inset transition-[background-color,box-shadow] duration-(--hover-dur) focus-within:bg-white/[0.14] focus-within:ring-white/15">
          <SearchIcon className="size-8 shrink-0 text-text-tertiary" />
          <input
            ref={inputRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="What do you want to watch?"
            aria-label="Search movies and series"
            spellCheck={false}
            className="h-full min-w-0 flex-1 bg-transparent text-[32px] leading-10 font-normal text-text outline-none placeholder:text-text-muted"
          />
          {text ? (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => {
                setText('')
                inputRef.current?.focus()
              }}
              className="flex size-12 shrink-0 items-center justify-center rounded-full text-text-tertiary outline-none hover:bg-white/10 hover:text-text active:scale-[0.94]"
            >
              <CloseIcon className="size-6" />
            </button>
          ) : null}
        </label>
      </div>
      {query ? <Results query={query} /> : <Trending />}
    </div>
  )
}

function Trending(): React.JSX.Element {
  const trending = useQuery(trendingAllQuery())
  if (!trending.data) return <TvPosterRowSkeleton title="Trending now" />
  return (
    <TvPosterRow
      title="Trending now"
      items={trending.data.results.map(
        (t): PosterRowItem => ({
          id: t.id,
          title: trendingItemTitle(t),
          poster: tmdbImage(t.poster_path, 'w500') ?? '',
          posterPath: t.poster_path ?? undefined,
          type: t.media_type
        })
      )}
    />
  )
}

function Results({ query }: { query: string }): React.JSX.Element {
  const movies = useQuery(searchMoviesQuery(query))
  const tv = useQuery(searchTvQuery(query))

  if (movies.isPending || tv.isPending) {
    return (
      <div aria-busy className="flex flex-col gap-10">
        <TvPosterRowSkeleton title="Movies" />
        <TvPosterRowSkeleton title="Series" />
      </div>
    )
  }

  const movieItems = (movies.data?.results ?? []).map(
    (m): PosterRowItem => ({
      id: m.id,
      title: m.title,
      poster: tmdbImage(m.poster_path, 'w500') ?? '',
      posterPath: m.poster_path ?? undefined,
      type: 'movie'
    })
  )
  const tvItems = (tv.data?.results ?? []).map(
    (s): PosterRowItem => ({
      id: s.id,
      title: s.name,
      poster: tmdbImage(s.poster_path, 'w500') ?? '',
      posterPath: s.poster_path ?? undefined,
      type: 'tv'
    })
  )

  if (movieItems.length === 0 && tvItems.length === 0) {
    return (
      <div className={cn(TV_GUTTER, 'flex flex-col gap-3 pt-8')}>
        <p className="text-[28px] leading-8 font-medium text-text">
          Nothing matches &ldquo;{query}&rdquo;
        </p>
        <p className="text-[20px] leading-7 font-normal text-text-tertiary">
          Check the spelling, or try the title&rsquo;s original name.
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-10">
      {movieItems.length > 0 ? <TvPosterRow title="Movies" items={movieItems} /> : null}
      {tvItems.length > 0 ? <TvPosterRow title="Series" items={tvItems} /> : null}
    </div>
  )
}
