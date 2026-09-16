// Bakes the metadata the hero mock needs into src/data/hero-demo.json so the
// site builds without any API keys and the hero never changes under us.
//
//   node scripts/gen-hero-data.mjs
//
// Mirrors what the desktop app's home screen does on launch: this week's
// trending movies in the featured carousel with OMDb ratings and fanart.tv
// logos, plus a Continue Watching row, Trending Now, a library, and friends.
// Reads VITE_TMDB_API_KEY, VITE_OMDB_API_KEY and VITE_FANART_API_KEY from
// ../../.env.local (or the environment).

import { readFileSync, writeFileSync, mkdirSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const here = dirname(fileURLToPath(import.meta.url))
const out = resolve(here, "../src/data/hero-demo.json")

const env = (() => {
  try {
    return readFileSync(resolve(here, "../../../.env.local"), "utf8")
  } catch {
    return ""
  }
})()
function key(name) {
  if (process.env[name]) return process.env[name]
  const m = env.match(new RegExp(`^${name}=(.+)$`, "m"))
  if (m) return m[1].trim().replace(/^"|"$/g, "")
  throw new Error(`${name} not found`)
}
const TMDB_KEY = key("VITE_TMDB_API_KEY")
const OMDB_KEY = key("VITE_OMDB_API_KEY")
const FANART_KEY = key("VITE_FANART_API_KEY")

async function tmdb(path, params = {}) {
  const url = new URL(`https://api.themoviedb.org/3${path}`)
  url.searchParams.set("api_key", TMDB_KEY)
  for (const [k, v] of Object.entries(params))
    url.searchParams.set(k, String(v))
  const r = await fetch(url)
  if (!r.ok) throw new Error(`${path}: ${r.status}`)
  return r.json()
}

async function omdb(imdbId) {
  if (!imdbId) return {}
  const r = await fetch(
    `https://www.omdbapi.com/?apikey=${OMDB_KEY}&i=${encodeURIComponent(imdbId)}`
  )
  if (!r.ok) return {}
  const b = await r.json()
  if (b.Response !== "True") return {}
  const num = (s) =>
    s && s !== "N/A" ? Number(s.replace(/,/g, "")) : undefined
  return { imdb: num(b.imdbRating), metacritic: num(b.Metascore) }
}

async function fanart(path) {
  const url = new URL(`https://webservice.fanart.tv/v3${path}`)
  url.searchParams.set("api_key", FANART_KEY)
  const r = await fetch(url, { headers: { accept: "application/json" } })
  if (!r.ok) return null
  return r.json()
}

// Same pick as the app: English first, most liked first.
function pickFanartLogo(images) {
  if (!images?.length) return undefined
  const en = images
    .filter((i) => i.lang === "en")
    .sort((a, b) => Number(b.likes) - Number(a.likes))
  return (en[0] ?? images[0])?.url
}

function tmdbLogo(details) {
  const logos = details.images?.logos ?? []
  const en = logos.find((l) => l.iso_639_1 === "en")
  return en ? `https://image.tmdb.org/t/p/w500${en.file_path}` : undefined
}

function certification(details) {
  const us = details.release_dates?.results?.find((r) => r.iso_3166_1 === "US")
  return us?.release_dates?.find((d) => d.certification)?.certification || "NR"
}

function runtime(min) {
  if (!min) return ""
  const h = Math.floor(min / 60)
  const m = min % 60
  return h ? `${h} hr ${m} min` : `${m} min`
}

const detailsCache = new Map()
function details(type, id) {
  const k = `${type}/${id}`
  if (!detailsCache.has(k)) {
    detailsCache.set(
      k,
      tmdb(`/${type}/${id}`, {
        append_to_response: "images,release_dates,credits,external_ids",
        include_image_language: "en,null",
      })
    )
  }
  return detailsCache.get(k)
}

async function movieLogo(d) {
  const fa = d.imdb_id ? await fanart(`/movies/${d.imdb_id}`) : null
  return pickFanartLogo(fa?.hdmovielogo ?? fa?.movielogo) ?? tmdbLogo(d) ?? null
}

async function tvLogo(d) {
  const tvdb = d.external_ids?.tvdb_id
  const fa = tvdb ? await fanart(`/tv/${tvdb}`) : null
  return pickFanartLogo(fa?.hdtvlogo ?? fa?.clearlogo) ?? tmdbLogo(d) ?? null
}

// ---- featured: the app's own pick, this week's trending movies ----
const trendingMovies = await tmdb("/trending/movie/week")
const featured = []
for (const m of trendingMovies.results.slice(0, 8)) {
  const d = await details("movie", m.id)
  const [logo, ratings] = await Promise.all([movieLogo(d), omdb(d.imdb_id)])
  featured.push({
    id: d.id,
    title: d.title,
    logo,
    backdrop: d.backdrop_path,
    poster: d.poster_path,
    tags: ["Movie", ...d.genres.map((g) => g.name).slice(0, 3)],
    rating: certification(d),
    description: d.overview,
    year: Number((d.release_date ?? "0").slice(0, 4)),
    runtime: runtime(d.runtime),
    metacritic: ratings.metacritic,
    imdb: ratings.imdb ? ratings.imdb.toFixed(1) : undefined,
    starring: d.credits.cast
      .slice(0, 3)
      .map((c) => c.name)
      .join(", "),
    director: d.credits.crew.find((c) => c.job === "Director")?.name ?? "",
  })
}

// ---- fake people, real titles. Progress is position/duration in seconds ----
// Statuses match the app's: watching draws a progress bar, paused draws its own
// line, idle and offline just carry a timestamp.
const FRIENDS = [
  { name: "maya", type: "tv", id: 95396, season: 2, episode: 4, status: "watching", positionSec: 1260, durationSec: 3120 },
  { name: "desmond", type: "tv", id: 83867, season: 2, episode: 3, status: "watching", positionSec: 600, durationSec: 2760 },
  { name: "sofia", type: "movie", id: 1064213, status: "paused", positionSec: 3180, durationSec: 8280 },
  { name: "theo", type: "movie", id: 693134, status: "idle", ago: "3h ago" },
  { name: "ren", type: "tv", id: 30991, season: 1, episode: 12, status: "idle", ago: "6h ago" },
  { name: "june", type: "tv", id: 136315, season: 3, episode: 1, status: "idle", ago: "1d ago" },
  { name: "arlo", type: "movie", id: 872585, status: "offline", ago: "2d ago" },
  { name: "omar", type: "tv", id: 60059, season: 4, episode: 9, status: "offline", ago: "2d ago" },
  { name: "nadia", type: "tv", id: 94605, season: 2, episode: 7, status: "offline", ago: "5d ago" },
  { name: "iris", type: "movie", id: 933260, status: "offline", ago: "9d ago" },
  { name: "wren", type: "tv", id: 126308, season: 1, episode: 6, status: "offline", ago: "12d ago" },
]
const friends = []
for (const f of FRIENDS) {
  const d = await details(f.type, f.id)
  friends.push({
    name: f.name,
    status: f.status,
    title: f.type === "tv" ? d.name : d.title,
    season: f.season,
    episode: f.episode,
    poster: d.poster_path,
    positionSec: f.positionSec,
    durationSec: f.durationSec,
    ago: f.ago,
  })
}

// ---- library. Pinned lists sort above the rest, as they do in the app ----
const LISTS = [
  { name: "Anime", pinned: true, count: 42, items: [["tv", 209867], ["tv", 95479], ["tv", 88803], ["tv", 114410]] },
  { name: "Rewatch", pinned: true, count: 18, items: [["movie", 129], ["tv", 30991], ["tv", 1398], ["movie", 949]] },
  { name: "Movies", count: 63, items: [["movie", 157336], ["movie", 244786], ["movie", 496243], ["movie", 120467]] },
  { name: "TV", count: 27, items: [["tv", 95396], ["tv", 1396], ["tv", 76331], ["tv", 67070]] },
  { name: "Korean", count: 11, items: [["movie", 496243], ["tv", 93405], ["movie", 670], ["movie", 705996]] },
  { name: "Sci-Fi", count: 24, items: [["movie", 693134], ["movie", 335984], ["tv", 83867], ["tv", 100088]] },
  { name: "Horror", count: 9, items: [["movie", 493922], ["movie", 530385], ["movie", 503919], ["movie", 933260]] },
  { name: "Thrillers", count: 16, items: [["movie", 6977], ["movie", 949], ["movie", 11423], ["movie", 670]] },
  { name: "Letterboxd 250", count: 250, items: [["movie", 545611], ["movie", 372058], ["movie", 10494], ["movie", 290098]] },
]
const lists = []
for (const l of LISTS) {
  const posters = []
  for (const [type, id] of l.items)
    posters.push((await details(type, id)).poster_path)
  lists.push({ name: l.name, pinned: !!l.pinned, count: l.count, posters })
}

// ---- continue watching ----
const CONTINUE = [
  {
    type: "tv",
    id: 95396,
    season: 2,
    episode: 5,
    positionSec: 1440,
    durationSec: 3180,
  },
  { type: "movie", id: 693134, positionSec: 4620, durationSec: 10020 },
  {
    type: "tv",
    id: 136315,
    season: 3,
    episode: 2,
    positionSec: 300,
    durationSec: 1980,
  },
  {
    type: "tv",
    id: 94605,
    season: 2,
    episode: 8,
    positionSec: 2100,
    durationSec: 2520,
  },
  { type: "movie", id: 872585, positionSec: 6000, durationSec: 10860 },
]
const continueWatching = []
for (const c of CONTINUE) {
  const d = await details(c.type, c.id)
  continueWatching.push({
    title: c.type === "tv" ? d.name : d.title,
    backdrop: d.backdrop_path,
    logo: c.type === "tv" ? await tvLogo(d) : await movieLogo(d),
    season: c.season,
    episode: c.episode,
    positionSec: c.positionSec,
    durationSec: c.durationSec,
  })
}

// ---- trending now ----
const trendingAll = await tmdb("/trending/all/week")
const trending = trendingAll.results
  .filter(
    (t) => t.poster_path && (t.media_type === "movie" || t.media_type === "tv")
  )
  .slice(0, 20)
  .map((t) => ({ title: t.title ?? t.name, poster: t.poster_path }))

mkdirSync(dirname(out), { recursive: true })
writeFileSync(
  out,
  JSON.stringify(
    { featured, friends, lists, continueWatching, trending },
    null,
    2
  ) + "\n"
)
console.log(`wrote ${out}: ${featured.map((f) => f.title).join(", ")}`)
