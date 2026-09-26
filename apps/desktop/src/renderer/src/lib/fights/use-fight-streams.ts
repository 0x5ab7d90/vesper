import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  fetchAllFightStreams,
  fetchSiteFightStreams,
  rankStreams,
  type FightMatch,
  type FightStream
} from './api'

export interface FightStreams {
  /** streamed.st's streams and the other sites', ranked together. */
  ranked: FightStream[]
  /** Both lists have answered, empty or not. */
  settled: boolean
}

/**
 * A fight's streams from every site. The streams menu and the player share
 * these queries, so a pick lands in the player with the list already cached.
 */
export function useFightStreams(match: FightMatch | null): FightStreams {
  const streamed = useQuery({
    queryKey: ['fights', 'all-streams', match?.id],
    queryFn: () => fetchAllFightStreams(match!),
    enabled: !!match,
    staleTime: 60_000,
    refetchInterval: 120_000
  })
  const sites = useQuery({
    queryKey: ['fights', 'site-streams', match?.id],
    queryFn: () => fetchSiteFightStreams(match!),
    enabled: !!match,
    staleTime: 60_000,
    refetchInterval: 120_000
  })
  const ranked = useMemo(
    () => rankStreams([...(streamed.data ?? []), ...(sites.data ?? [])]),
    [streamed.data, sites.data]
  )
  return {
    ranked,
    settled: streamed.isFetched && sites.isFetched
  }
}
