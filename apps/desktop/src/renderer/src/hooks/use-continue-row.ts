import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import type { FunctionReturnType } from 'convex/server'
import type { api } from '@convex/_generated/api'
import { fanartMovieQuery, fanartTvQuery, tvExternalIdsQuery } from '@renderer/lib/external-queries'
import { pickFanartLogo } from '@renderer/lib/fanart'
import { formatTimeLeft } from '@renderer/lib/next-episode'
import { tmdbImage, type BackdropSize } from '@renderer/lib/tmdb'

export type ContinueRow = FunctionReturnType<typeof api.playback.listContinueWatching>[number]

export interface ContinueRowView {
  backdrop: string
  logo: string | undefined
  remaining: string
  progress: number
  detailTarget:
    | { to: '/movie/$id'; params: { id: string } }
    | { to: '/tv/$id'; params: { id: string } }
  /** Resumes straight into the player when the stream is known, else opens the title. */
  resume: () => void
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n)
}

/** Everything a continue-watching card shows and does, shared by the desktop and TV homes. */
export function useContinueRow(row: ContinueRow, backdropSize: BackdropSize): ContinueRowView {
  const navigate = useNavigate()

  const isMovie = row.mediaType === 'movie'
  const movieFanart = useQuery({ ...fanartMovieQuery(row.imdbId), enabled: isMovie })
  const ext = useQuery({ ...tvExternalIdsQuery(row.tmdbId), enabled: !isMovie })
  const tvdbId = ext.data?.tvdb_id ?? undefined
  const tvFanart = useQuery({ ...fanartTvQuery(tvdbId), enabled: !isMovie && !!tvdbId })

  const logo = isMovie
    ? pickFanartLogo(movieFanart.data?.hdmovielogo ?? movieFanart.data?.movielogo ?? undefined)
    : pickFanartLogo(tvFanart.data?.clearlogo ?? tvFanart.data?.hdtvlogo ?? undefined)

  const backdrop = tmdbImage(row.backdropPath, backdropSize) ?? ''
  const timeLeft = formatTimeLeft(row.positionSec, row.durationSec)
  const seasonEp =
    !isMovie && row.season !== undefined && row.episode !== undefined
      ? `S${pad(row.season)}E${pad(row.episode)}`
      : null
  const remaining = seasonEp ? `${seasonEp} · ${timeLeft}` : timeLeft
  const progress = row.durationSec > 0 ? (row.positionSec / row.durationSec) * 100 : 0

  const detailTarget = isMovie
    ? ({ to: '/movie/$id', params: { id: String(row.tmdbId ?? 0) } } as const)
    : ({ to: '/tv/$id', params: { id: String(row.tmdbId ?? 0) } } as const)

  const resume = (): void => {
    if (row.streamUrl && row.tmdbId) {
      navigate({
        to: '/watch/$mediaType/$id',
        params: { mediaType: row.mediaType, id: String(row.tmdbId) },
        search: {
          url: row.streamUrl,
          title: row.title ?? '',
          episodeLabel: row.episodeLabel,
          imdbId: row.imdbId,
          mediaType: row.mediaType,
          season: row.season,
          episode: row.episode,
          resumeSec: row.positionSec
        },
        viewTransition: false
      })
      return
    }
    navigate({ ...detailTarget, viewTransition: false })
  }

  return { backdrop, logo, remaining, progress, detailTarget, resume }
}
