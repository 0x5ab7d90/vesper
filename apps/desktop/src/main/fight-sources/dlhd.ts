import { decodeEntities, sameEvent, titleKey } from './match'
import { cached, getText, type FightSite, type FightSiteStream } from './types'

// DaddyLiveHD is a TV-channel relay: its homepage renders the day's schedule,
// every event followed by the channels carrying it, and each channel is a
// watch page. Its segments arrive packed into PNG pixels, which the header
// proxy unpacks.

const SITE = 'https://dlive.sx'

// Channels in another language, going by the country or network in the name.
const FOREIGN_RE =
  /\b(poland|russia|france|spain|portugal|italy|germany|cyprus|greece|brazil|mexico|arabia|turkey|netherlands|israel|romania|serbia|croatia|czech|hungary|bulgaria|polsat|canal\+|cosmote|rmc|tva)\b|[Ѐ-ӿ]/i

const homepage = cached(3 * 60_000, () => getText(SITE, 15_000))

interface ScheduledEvent {
  title: string
  channels: Array<{ id: string; name: string }>
}

// Today's schedule only: the page trails older days after it.
function schedule(html: string): ScheduledEvent[] {
  const start = html.indexOf('class="schedule__day"')
  if (start < 0) return []
  const next = html.indexOf('class="schedule__day"', start + 1)
  const today = html.slice(start, next < 0 ? undefined : next)
  const out: ScheduledEvent[] = []
  const eventRe =
    /<span class="schedule__eventTitle">([\s\S]*?)<\/span>[\s\S]*?<div class="schedule__channels">([\s\S]*?)<\/div>/g
  for (let m = eventRe.exec(today); m; m = eventRe.exec(today)) {
    const channels: ScheduledEvent['channels'] = []
    const chRe = /href="\/watch\.php\?id=(\d+)"[^>]*title="([^"]*)"/g
    for (let c = chRe.exec(m[2]); c; c = chRe.exec(m[2])) {
      channels.push({ id: c[1], name: decodeEntities(c[2]) })
    }
    out.push({ title: decodeEntities(m[1].trim()), channels })
  }
  return out
}

export const dlhd: FightSite = {
  name: 'DaddyLiveHD',
  async listStreams(input) {
    const key = titleKey(input.title)
    const events = schedule(await homepage(SITE)).filter((e) => sameEvent(key, titleKey(e.title)))
    // A card split into prelims and main card lists most channels twice.
    const seen = new Set<string>()
    const out: FightSiteStream[] = []
    for (const channel of events.flatMap((e) => e.channels)) {
      if (seen.has(channel.id)) continue
      seen.add(channel.id)
      out.push({
        id: `dlhd:${channel.id}`,
        site: 'DaddyLiveHD',
        label: channel.name,
        hd: !/\bSD\b/.test(channel.name),
        english: !FOREIGN_RE.test(channel.name),
        embedUrl: `${SITE}/watch.php?id=${channel.id}`
      })
    }
    return out
  }
}
