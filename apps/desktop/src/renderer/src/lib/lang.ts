const ISO3_TO_ISO1: Record<string, string> = {
  eng: 'en',
  spa: 'es',
  fre: 'fr',
  fra: 'fr',
  ger: 'de',
  deu: 'de',
  ita: 'it',
  por: 'pt',
  jpn: 'ja',
  kor: 'ko',
  chi: 'zh',
  zho: 'zh',
  rus: 'ru',
  ara: 'ar',
  hin: 'hi',
  dut: 'nl',
  nld: 'nl',
  pol: 'pl',
  swe: 'sv',
  tur: 'tr',
  dan: 'da',
  fin: 'fi',
  nor: 'no',
  cze: 'cs',
  ces: 'cs',
  hun: 'hu',
  rum: 'ro',
  ron: 'ro',
  bul: 'bg',
  hrv: 'hr',
  srp: 'sr',
  scc: 'sr',
  slo: 'sk',
  slk: 'sk',
  slv: 'sl',
  ukr: 'uk',
  heb: 'he',
  vie: 'vi',
  tha: 'th',
  ind: 'id',
  may: 'ms',
  msa: 'ms',
  fil: 'tl',
  ben: 'bn',
  urd: 'ur',
  per: 'fa',
  fas: 'fa',
  cat: 'ca',
  baq: 'eu',
  eus: 'eu',
  glg: 'gl',
  geo: 'ka',
  kat: 'ka',
  arm: 'hy',
  hye: 'hy',
  mac: 'mk',
  mkd: 'mk',
  alb: 'sq',
  sqi: 'sq',
  lit: 'lt',
  lav: 'lv',
  est: 'et',
  ice: 'is',
  isl: 'is',
  gle: 'ga',
  wel: 'cy',
  cym: 'cy',
  mlt: 'mt',
  gre: 'el',
  ell: 'el',
  bos: 'bs'
}

const LANG_TO_COUNTRY: Record<string, string> = {
  en: 'us',
  es: 'es',
  fr: 'fr',
  de: 'de',
  it: 'it',
  pt: 'br',
  ja: 'jp',
  ko: 'kr',
  zh: 'cn',
  ru: 'ru',
  ar: 'sa',
  hi: 'in',
  // India's other film languages share its flag.
  ta: 'in',
  te: 'in',
  kn: 'in',
  ml: 'in',
  mr: 'in',
  gu: 'in',
  pa: 'in',
  nl: 'nl',
  pl: 'pl',
  sv: 'se',
  tr: 'tr',
  da: 'dk',
  fi: 'fi',
  no: 'no',
  cs: 'cz',
  hu: 'hu',
  ro: 'ro',
  bg: 'bg',
  hr: 'hr',
  sr: 'rs',
  sk: 'sk',
  sl: 'si',
  uk: 'ua',
  he: 'il',
  vi: 'vn',
  th: 'th',
  id: 'id',
  ms: 'my',
  tl: 'ph',
  bn: 'bd',
  ur: 'pk',
  fa: 'ir',
  ca: 'es',
  eu: 'es',
  gl: 'es',
  ka: 'ge',
  hy: 'am',
  mk: 'mk',
  sq: 'al',
  lt: 'lt',
  lv: 'lv',
  et: 'ee',
  is: 'is',
  ga: 'ie',
  cy: 'gb',
  mt: 'mt',
  el: 'gr',
  bs: 'ba'
}

const COUNTRY_OVERRIDE: Record<string, string> = {
  pob: 'br',
  pb: 'br',
  spl: 'mx'
}

const LABEL_OVERRIDE: Record<string, string> = {
  pob: 'Portuguese (Brazil)',
  pb: 'Portuguese (Brazil)',
  spl: 'Spanish (Latin America)'
}

const LANG_NAMES_DISPLAY = new Intl.DisplayNames(['en'], { type: 'language' })

/** A two- or three-letter language code as its two-letter form ("jpn" → "ja"). */
export function toIso1(lang: string): string | undefined {
  const k = lang.toLowerCase()
  if (k.length === 2) return k
  return ISO3_TO_ISO1[k]
}

export function langLabel(lang: string): string {
  const override = LABEL_OVERRIDE[lang.toLowerCase()]
  if (override) return override
  const iso1 = toIso1(lang)
  if (iso1) {
    try {
      const name = LANG_NAMES_DISPLAY.of(iso1)
      if (name && name !== iso1) return name
    } catch {
      /* noop */
    }
  }
  return lang.toUpperCase()
}

export function langToCountry(lang: string): string | undefined {
  const k = lang.toLowerCase()
  if (COUNTRY_OVERRIDE[k]) return COUNTRY_OVERRIDE[k]
  const iso1 = toIso1(k)
  return iso1 ? LANG_TO_COUNTRY[iso1] : undefined
}
