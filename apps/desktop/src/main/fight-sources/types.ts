// Shared shapes for the fight sites beyond streamed.st. Each site turns an
// event into embed pages the hidden-window interceptor can resolve; the
// registry in index.ts asks them all at once.

export interface FightSourceInput {
  title: string
  /** Scheduled start, unix ms. */
  date: number
  /** The event's streamed.st sources; some sites share their ids. */
  sources: Array<{ source: string; id: string }>
}

export interface FightSiteStream {
  /** Unique across sites: prefixed with the site's key. */
  id: string
  /** The site's name, shown under the stream in the picker. */
  site: string
  /** The site's own name for the stream: a channel, a link number. */
  label: string
  hd: boolean
  english: boolean
  embedUrl: string
  /** The page the site embeds the stream on, when the embed checks for it. */
  referer?: string
}

export interface FightSite {
  name: string
  /** Must not throw for an ordinary "nothing here": return an empty list instead. */
  listStreams: (input: FightSourceInput) => Promise<FightSiteStream[]>
}

export const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

export async function getText(url: string, timeoutMs = 10_000): Promise<string> {
  const res = await fetch(url, {
    headers: { 'User-Agent': BROWSER_UA },
    signal: AbortSignal.timeout(timeoutMs)
  })
  if (!res.ok) throw new Error(`${new URL(url).host} ${res.status}`)
  return await res.text()
}

/** One fetch per URL per window, shared by everyone asking in the meantime. */
export function cached<T>(ttlMs: number, load: (key: string) => Promise<T>) {
  const entries = new Map<string, { at: number; value: Promise<T> }>()
  return (key: string): Promise<T> => {
    const hit = entries.get(key)
    if (hit && Date.now() - hit.at < ttlMs) return hit.value
    const value = load(key)
    entries.set(key, { at: Date.now(), value })
    value.catch(() => entries.delete(key))
    return value
  }
}
