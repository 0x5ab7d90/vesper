import { ipcMain } from 'electron'
import { dlhd } from './dlhd'
import { methstreams } from './methstreams'
import { timst } from './timst'
import type { FightSite, FightSiteStream, FightSourceInput } from './types'
import { watchWrestling } from './watch-wrestling'

// Fight streams beyond streamed.st: several sites, each asked the way its own
// pages find an event, all at once. Each hands back embed pages, which play
// through the same hidden-window interceptor as streamed.st's (ADR-0017). A
// site that is down, or whose markup has moved, contributes nothing.

export type { FightSiteStream, FightSourceInput } from './types'

const SITES: FightSite[] = [methstreams, timst, dlhd, watchWrestling]
const SITE_TIMEOUT_MS = 15_000

export async function listFightStreams(input: FightSourceInput): Promise<FightSiteStream[]> {
  const lists = await Promise.all(
    SITES.map((site) =>
      Promise.race([
        site.listStreams(input),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('timed out')), SITE_TIMEOUT_MS)
        )
      ]).catch((err: Error) => {
        console.warn(`[fight-sources] ${site.name} failed:`, err.message)
        return [] as FightSiteStream[]
      })
    )
  )
  return lists.flat()
}

function validInput(raw: unknown): FightSourceInput | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  if (typeof r.title !== 'string' || !r.title) return null
  if (typeof r.date !== 'number' || !Number.isFinite(r.date)) return null
  const sources = Array.isArray(r.sources)
    ? r.sources.filter(
        (s): s is { source: string; id: string } =>
          !!s &&
          typeof (s as Record<string, unknown>).source === 'string' &&
          typeof (s as Record<string, unknown>).id === 'string'
      )
    : []
  return { title: r.title, date: r.date, sources }
}

export function registerFightSources(): void {
  ipcMain.handle('fights:listStreams', async (_e, raw: unknown): Promise<FightSiteStream[]> => {
    const input = validInput(raw)
    if (!input) throw new Error('invalid fight input')
    return listFightStreams(input)
  })
}
