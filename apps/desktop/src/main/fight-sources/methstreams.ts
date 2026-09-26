import { decodeEntities, sameEvent, titleKey } from './match'
import { cached, getText, type FightSite, type FightSiteStream } from './types'

// Methstreams lists the day's events per sport on a plain server-rendered
// page, and each event page carries its links as a JSON array in an inline
// script. The links are other sites' embed pages, which check that they are
// framed by Methstreams.

const SITE = 'https://methstreams.gs'
const LEAGUES = ['mmastreams', 'boxingstreams']

interface Listing {
  slug: string
  title: string
}

const leaguePage = cached(2 * 60_000, (league) => getText(`${SITE}/league/${league}`))
const eventPage = cached(60_000, (slug) => getText(`${SITE}/stream/${slug}`))

function listings(html: string): Listing[] {
  const out: Listing[] = []
  const re =
    /<a class="card" href="\/stream\/([^"]+)">[\s\S]*?<div class="card-title">([^<]*)<\/div>/g
  for (let m = re.exec(html); m; m = re.exec(html)) {
    out.push({ slug: m[1], title: decodeEntities(m[2].trim()) })
  }
  return out
}

interface MethLink {
  label?: string
  value?: string
}

function links(html: string): MethLink[] {
  const m = /const allStreams = (\[[\s\S]*?\]);/.exec(html)
  if (!m) return []
  try {
    const parsed = JSON.parse(m[1]) as unknown
    return Array.isArray(parsed) ? (parsed as MethLink[]) : []
  } catch {
    return []
  }
}

export const methstreams: FightSite = {
  name: 'Methstreams',
  async listStreams(input) {
    const key = titleKey(input.title)
    const pages = await Promise.all(LEAGUES.map((l) => leaguePage(l).catch(() => '')))
    const events = pages.flatMap(listings).filter((l) => sameEvent(key, titleKey(l.title)))
    const seen = new Set<string>()
    const out: FightSiteStream[] = []
    for (const event of events) {
      if (seen.has(event.slug)) continue
      seen.add(event.slug)
      const html = await eventPage(event.slug).catch(() => '')
      links(html).forEach((link, i) => {
        if (!link.value?.startsWith('https://')) return
        const label = (link.label ?? `Link ${i + 1}`).replace(/^Link-(\d+)/i, 'Link $1')
        out.push({
          id: `meth:${event.slug}:${i}`,
          site: 'Methstreams',
          label: label.replace(/\s*\bHD\b/i, ''),
          hd: /\bHD\b/i.test(label),
          english: true,
          embedUrl: link.value,
          referer: `${SITE}/`
        })
      })
    }
    return out
  }
}
