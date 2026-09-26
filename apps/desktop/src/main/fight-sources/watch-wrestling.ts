import { decodeEntities, sameEvent, searchTerms, titleKey } from './match'
import { getText, type FightSite, type FightSiteStream } from './types'

// Watch-Wrestling posts one WordPress article per event, found through the
// site's REST search. The article's buttons open encrypted links, but the site
// publishes an embed scheme for the same buttons (its "Embed API for
// developers"): category, show date, post, source and button, in that order.

const SITE = 'https://watch-wrestling.eu'
const EMBED = 'https://dailywrestling.cc/embed'
const DAY_MS = 86_400_000

interface Post {
  link?: string
  title?: { rendered?: string }
}

/** "9/26/2026" or "9-26-26" in a post title, as unix ms at UTC midnight. */
function titleDay(title: string): { ms: number; path: string } | null {
  const m = /(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/.exec(title)
  if (!m) return null
  const year = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])
  return { ms: Date.UTC(year, Number(m[1]) - 1, Number(m[2])), path: m[0].replace(/\//g, '-') }
}

function embedUrls(html: string, day: string): FightSiteStream[] {
  const crumbs = /data-secondary-catname="([^"]*)"\s+data-select-post="(\d+)"/.exec(html)
  if (!crumbs) return []
  const category = crumbs[1].toLowerCase().replace(/ /g, '').split('').reverse().join('')
  const base = `${EMBED}/${category}/${day}/select-post-${crumbs[2]}`
  const out: FightSiteStream[] = []
  let sourceName = ''
  let sourceIndex = 0
  let button = 0
  let counted = false
  const re =
    /<div class="src-name">([^<]*)<\/div>|<button class="srcbtn"[^>]*\bdata-src="[^"]*"[^>]*>([^<]*)<\/button>/g
  for (let m = re.exec(html); m; m = re.exec(html)) {
    if (m[1] !== undefined) {
      sourceName = decodeEntities(m[1])
        .replace(/^Source\s*\d+\s*[–-]\s*/i, '')
        .trim()
      button = 0
      counted = false
      continue
    }
    // Only sources with buttons are numbered, the way the site's embed codes are.
    if (!counted) {
      sourceIndex++
      counted = true
    }
    button++
    const text = decodeEntities(m[2]).trim()
    if (/\bSD\b/i.test(text)) continue
    const quality = /\bFHD\b/i.test(text) ? 'FHD' : /\bHD\b/i.test(text) ? 'HD' : 'Backup'
    out.push({
      id: `ww:${base}/${sourceIndex}/${button}`,
      site: 'Watch-Wrestling',
      label: `${sourceName} · ${quality}`,
      hd: quality !== 'Backup',
      english: true,
      embedUrl: `${base}/${sourceIndex}/${button}`
    })
  }
  return out
}

export const watchWrestling: FightSite = {
  name: 'Watch-Wrestling',
  async listStreams(input) {
    const key = titleKey(input.title)
    const q = encodeURIComponent(searchTerms(key, input.title))
    const posts = JSON.parse(
      await getText(`${SITE}/wp-json/wp/v2/posts?search=${q}&_fields=link,title&per_page=10`)
    ) as Post[]
    const out: FightSiteStream[] = []
    for (const post of posts) {
      const title = decodeEntities(post.title?.rendered ?? '')
      const day = titleDay(title)
      if (!post.link || !day || !sameEvent(key, titleKey(title))) continue
      // Titles carry the US date; the start time is UTC, up to a day ahead.
      if (Math.abs(input.date - day.ms) > 2 * DAY_MS) continue
      const html = await getText(post.link).catch(() => '')
      out.push(...embedUrls(html, day.path))
    }
    return out
  }
}
