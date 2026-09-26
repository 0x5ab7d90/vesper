import { ipcMain } from 'electron'
import { cinejoy } from './cinejoy'
import { closeMiruroPipe, miruro } from './miruro'
import { movy } from './movy'
import { rivestream } from './rivestream'
import { stellar } from './stellar'
import type { WebSourceInput, WebSourceSite, WebStream } from './types'

// Web sources (ADR-0019): several sites, each with its own way of handing out
// HLS playlists for a title, asked all at once. A site that is down, or whose
// scheme has rotated, simply contributes nothing; the others still fill the
// picker. Each site module is the one file that stops working when its site
// changes.

export type { WebSourceInput, WebStream } from './types'

const SITES: WebSourceSite[] = [movy, rivestream, stellar, cinejoy, miruro]

/** Hidden windows a site keeps open between calls; they must not outlive the app's own. */
export function closeWebSourceWindows(): void {
  closeMiruroPipe()
}

export async function listWebStreams(
  input: WebSourceInput,
  onChunk?: (rows: WebStream[]) => void
): Promise<WebStream[]> {
  const out: WebStream[] = []
  await Promise.all(
    SITES.map(async (site) => {
      try {
        const rows = await site.listStreams(input, (chunk) => {
          out.push(...chunk)
          onChunk?.(chunk)
        })
        // A site that answers all at once (no chunks) still lands here.
        const missed = rows.filter((r) => !out.includes(r))
        if (missed.length > 0) {
          out.push(...missed)
          onChunk?.(missed)
        }
      } catch (err) {
        console.warn(`[web-sources] ${site.name} failed:`, (err as Error).message)
      }
    })
  )
  return out
}

function validInput(raw: unknown): WebSourceInput | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  if (typeof r.title !== 'string' || !r.title) return null
  if (r.mediaType !== 'movie' && r.mediaType !== 'tv') return null
  if (typeof r.tmdbId !== 'number' || !Number.isInteger(r.tmdbId) || r.tmdbId <= 0) return null
  const num = (v: unknown): number | undefined =>
    typeof v === 'number' && Number.isFinite(v) ? v : undefined
  return {
    title: r.title,
    mediaType: r.mediaType,
    tmdbId: r.tmdbId,
    imdbId: typeof r.imdbId === 'string' ? r.imdbId : undefined,
    year: num(r.year),
    season: num(r.season),
    episode: num(r.episode)
  }
}

export function registerWebSources(): void {
  // Partial answers ride back as `web:streamsChunk` events tagged with the
  // caller's request id; the invoke itself resolves with the full list.
  ipcMain.handle(
    'web:listStreams',
    async (e, raw: unknown, requestId: unknown): Promise<WebStream[]> => {
      const input = validInput(raw)
      if (!input) throw new Error('invalid web source input')
      const id = typeof requestId === 'string' ? requestId : null
      return listWebStreams(input, (rows) => {
        if (id && !e.sender.isDestroyed()) e.sender.send('web:streamsChunk', id, rows)
      })
    }
  )
}
