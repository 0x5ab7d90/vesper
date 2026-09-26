// Shared shapes for the web-source sites (ADR-0019). Each site turns a title
// into rows the picker can show, every row already routed through the header
// proxy; the registry in index.ts runs them all at once.

export interface WebSourceInput {
  title: string
  mediaType: 'movie' | 'tv'
  tmdbId: number
  imdbId?: string
  year?: number
  season?: number
  episode?: number
}

export interface WebStream {
  /** Unique across sites: prefixed with the site's key. */
  id: string
  server: string
  /** Audio language as a subtitle-style code, for the flag tile. */
  lang: string
  /** "2160p", "1080p", "Auto", … as the provider labels it. */
  quality: string
  /** Playback URL through the local header proxy. */
  url: string
  /** Subtitle files the site serves alongside the stream, also through the proxy. */
  subtitles?: WebSubtitle[]
}

export interface WebSubtitle {
  /** Subtitle-style language code, for the flag tile. */
  lang: string
  label: string
  url: string
  /** The one the site turns on by itself. */
  default?: boolean
}

export interface WebSourceSite {
  name: string
  /**
   * Every row the site has for the title. Rows may arrive in chunks as the
   * site's servers answer; the resolved value is the whole list. Must not
   * throw for an ordinary "nothing here": return an empty list instead.
   */
  listStreams: (
    input: WebSourceInput,
    onChunk?: (rows: WebStream[]) => void
  ) => Promise<WebStream[]>
}

/** "720p | English" → "720p"; "4K HDR" → "2160p"; anything else → "Auto". */
export function parseQuality(label: string): string {
  const p = /(\d{3,4})p/i.exec(label)
  if (p) return `${p[1]}p`
  if (/\b4k\b/i.test(label)) return '2160p'
  return 'Auto'
}

const LANGUAGE_CODES: Record<string, string> = {
  english: 'en',
  hindi: 'hi',
  tamil: 'ta',
  telugu: 'te',
  kannada: 'kn',
  malayalam: 'ml',
  bengali: 'bn',
  french: 'fr',
  german: 'de',
  spanish: 'es',
  esla: 'spl',
  latino: 'spl',
  portuguese: 'pt',
  ptbr: 'pob',
  italian: 'it',
  arabic: 'ar',
  russian: 'ru',
  japanese: 'ja',
  korean: 'ko',
  chinese: 'zh',
  turkish: 'tr'
}

/** The audio language named in a label ("720p | Hindi"), as a flag-tile code; English otherwise. */
export function parseLanguage(label: string): string {
  const lower = label.toLowerCase()
  for (const [name, code] of Object.entries(LANGUAGE_CODES)) {
    if (lower.includes(name)) return code
  }
  return 'en'
}
