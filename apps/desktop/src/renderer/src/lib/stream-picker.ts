import type { ParsedStream, QualityTier } from './comet'
import { sortWebStreams, type WebStream } from './web-sources'

interface PickOptions {
  bingeGroup?: string
  topN?: number
}

function tierScore(t: ParsedStream['qualityTier']): number {
  switch (t) {
    case '1080p':
      return 100
    case '720p':
      return 70
    case '4K-DV':
      return 65
    case '4K-HDR':
      return 60
    case '4K':
      return 55
    case '480p':
      return 30
    case 'SD':
      return 10
  }
}

function score(s: ParsedStream, opts: PickOptions): number {
  const tier = tierScore(s.qualityTier)
  const seedScore = Math.min(60, Math.log10(Math.max(1, s.seeders)) * 15)
  const bingeBonus = opts.bingeGroup && s.bingeGroup === opts.bingeGroup ? 200 : 0
  // Cached streams are instant — always rank them above any uncached stream.
  const cachedBonus = s.cached ? 1000 : 0
  return cachedBonus + bingeBonus + tier + seedScore
}

export function rankStreams(streams: ParsedStream[], opts: PickOptions = {}): ParsedStream[] {
  return streams.toSorted((a, b) => score(b, opts) - score(a, opts))
}

export function topCandidates(streams: ParsedStream[], opts: PickOptions = {}): ParsedStream[] {
  const ranked = rankStreams(streams, opts)
  const n = opts.topN ?? 3
  const out: ParsedStream[] = []
  const seen = new Set<string>()
  for (const s of ranked) {
    if (seen.has(s.playbackHash)) continue
    seen.add(s.playbackHash)
    out.push(s)
    if (out.length >= n) break
  }
  return out
}

export type StreamSort = 'default' | 'quality' | 'size' | 'web'

export const STREAM_SORTS: { value: StreamSort; label: string }[] = [
  { value: 'default', label: 'Default' },
  { value: 'quality', label: 'Quality' },
  { value: 'size', label: 'Size' },
  { value: 'web', label: 'Web' }
]

// Display order only — highest quality first. Kept separate from tierScore so changing what the
// list shows never moves what autoplay picks.
const QUALITY_ORDER: QualityTier[] = ['4K-DV', '4K-HDR', '4K', '1080p', '720p', '480p', 'SD']

function qualityRank(t: QualityTier): number {
  const i = QUALITY_ORDER.indexOf(t)
  return i === -1 ? QUALITY_ORDER.length : i
}

// A web row's quality label mapped onto the same ladder, so the two kinds of
// row interleave by quality; an "Auto" row promises nothing and sits with SD.
function webQualityRank(q: string): number {
  if (q === '2160p') return qualityRank('4K')
  if (q === '1080p' || q === '720p' || q === '480p') return qualityRank(q)
  return qualityRank('SD')
}

export function sortStreams(
  streams: ParsedStream[],
  sort: StreamSort,
  opts: PickOptions = {}
): ParsedStream[] {
  if (sort === 'quality') {
    return streams.toSorted(
      (a, b) =>
        qualityRank(a.qualityTier) - qualityRank(b.qualityTier) ||
        b.videoSize - a.videoSize ||
        b.seeders - a.seeders
    )
  }
  if (sort === 'size') {
    return streams.toSorted(
      (a, b) =>
        b.videoSize - a.videoSize ||
        qualityRank(a.qualityTier) - qualityRank(b.qualityTier) ||
        b.seeders - a.seeders
    )
  }
  return rankStreams(streams, opts)
}

// The picker lists cached files and web sources as one list (ADR-0019). A
// cached file is always the better pick when it exists, so the default order
// keeps every web row under the cached ones; the quality order interleaves
// them, with the cached row winning a tie; the web tab is web rows alone.
export type PickerItem =
  | { kind: 'cached'; key: string; stream: ParsedStream }
  | { kind: 'web'; key: string; stream: WebStream }

export function mergePickerItems(
  cached: ParsedStream[],
  web: WebStream[],
  sort: StreamSort,
  opts: PickOptions = {}
): PickerItem[] {
  const webItems: PickerItem[] = sortWebStreams(web).map((s) => ({
    kind: 'web',
    key: `web:${s.id}`,
    stream: s
  }))
  if (sort === 'web') return webItems
  const cachedItems: PickerItem[] = sortStreams(cached, sort, opts).map((s) => ({
    kind: 'cached',
    key: s.playbackHash,
    stream: s
  }))
  if (sort !== 'quality') return [...cachedItems, ...webItems]
  const rank = (item: PickerItem): number =>
    item.kind === 'cached'
      ? qualityRank(item.stream.qualityTier)
      : webQualityRank(item.stream.quality)
  const merged: PickerItem[] = []
  let i = 0
  let j = 0
  while (i < cachedItems.length || j < webItems.length) {
    const c = cachedItems[i]
    const w = webItems[j]
    if (c && (!w || rank(c) <= rank(w))) {
      merged.push(c)
      i++
    } else {
      merged.push(w)
      j++
    }
  }
  return merged
}
