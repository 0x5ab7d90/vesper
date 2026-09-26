// Every site names the same fight its own way: "UFC Fight Night 289 Rosas Jr.
// vs Barcelos", "UFC Fight Night: Rosas Jr. vs Barcelos", "UFC Fight Night
// Main Card : Raul Rosas Jr. 🇺🇸 vs Raoni Barcelos 🇧🇷". Two titles are the same
// event when the names either side of "vs" overlap, or when both carry the
// same numbered card ("BKFC 94", "Cage Warriors 210").

// Words that say what kind of event it is, never whose.
const FILLER = new Set([
  'vs',
  'the',
  'and',
  'live',
  'stream',
  'streams',
  'free',
  'main',
  'card',
  'prelims',
  'early',
  'fight',
  'night',
  'ufc',
  'boxing',
  'mma',
  'ppv',
  'event',
  'jr',
  'sr',
  'ii',
  'iii'
])

// Numbers after these count parts of an event, not the event: "Night 2", "Week 8".
const UNNUMBERED = new Set(['night', 'day', 'week', 'season', 'part', 'round', 'episode', 'vol'])

function words(text: string): string[] {
  return text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
}

function names(text: string): string[] {
  return words(text).filter((w) => w.length > 2 && !FILLER.has(w) && !/^\d+$/.test(w))
}

export interface TitleKey {
  /** Surnames and given names on each side of "vs"; empty when there is no "vs". */
  left: string[]
  right: string[]
  /** "bkfc 94", "warriors 210": a word and the card number after it. */
  numbered: string[]
  /** Every name-like word, for events with neither ("AEW All Out"). */
  all: string[]
}

export function titleKey(title: string): TitleKey {
  // A date in the title ("9/26/26 – September 26, 2026") would read as card numbers.
  const clean = decodeEntities(title)
    .replace(/\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/g, ' ')
    .replace(
      /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{1,2}(st|nd|rd|th)?(,?\s+\d{4})?/gi,
      ' '
    )
    .replace(/\b(19|20)\d{2}\b/g, ' ')
  const numbered: string[] = []
  const all = words(clean)
  for (let i = 0; i + 1 < all.length; i++) {
    const n = Number(all[i + 1])
    if (
      /^[a-z]+$/.test(all[i]) &&
      !UNNUMBERED.has(all[i]) &&
      Number.isInteger(n) &&
      n > 0 &&
      n < 1000
    ) {
      numbered.push(`${all[i]} ${n}`)
    }
  }
  const split = /\s+vs?\.?\s+/i.exec(clean)
  if (!split) return { left: [], right: [], numbered, all: names(clean) }
  // The event's own name sits before a colon ("BKFC 94 Manchester: Till");
  // anything after the second fighter is a venue or a date.
  const before =
    clean
      .slice(0, split.index)
      .split(/:|\s[-–|]\s/)
      .pop() ?? ''
  const after = clean.slice(split.index + split[0].length).split(/[:(|@]|\s[-–]\s/)[0]
  return {
    left: names(before).slice(-2),
    right: names(after).slice(0, 2),
    numbered,
    all: names(clean)
  }
}

export function sameEvent(a: TitleKey, b: TitleKey): boolean {
  const overlap = (x: string[], y: string[]): boolean => x.some((w) => y.includes(w))
  const bout = (k: TitleKey): boolean => k.left.length > 0 && k.right.length > 0
  if (bout(a) && bout(b)) {
    if (overlap(a.left, b.left) && overlap(a.right, b.right)) return true
  }
  if (overlap(a.numbered, b.numbered)) return true
  // Neither names a bout or a card number: every word of the shorter title
  // must be in the longer, and there must be two of them.
  if (bout(a) || bout(b) || a.numbered.length > 0 || b.numbered.length > 0) return false
  const [short, long] = a.all.length <= b.all.length ? [a.all, b.all] : [b.all, a.all]
  return short.length >= 2 && short.every((w) => long.includes(w))
}

/** A few words a site's own search box will find the event by. */
export function searchTerms(key: TitleKey, title: string): string {
  if (key.left.length > 0 && key.right.length > 0) {
    return `${key.left[key.left.length - 1]} ${key.right[0]}`
  }
  return key.numbered[0] ?? names(title).slice(0, 3).join(' ')
}

export function decodeEntities(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_m, n: string) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_m, n: string) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#039;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&raquo;/g, '»')
    .replace(/&nbsp;/g, ' ')
}
