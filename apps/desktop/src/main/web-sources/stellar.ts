import { createHash, randomBytes, webcrypto } from 'crypto'
import { proxiedPlaylistUrl, upstreamAnswers } from '../embed-stream'
import type { WebSourceInput, WebSourceSite, WebStream } from './types'

// Stellar: one resolve call per source. Every call is gated by a small
// proof-of-work (a fresh challenge, a nonce whose SHA-256 leads with a few
// zero nibbles) and its body is AES-GCM under a key derived from a constant
// baked into the site's bundle plus today's UTC date. The answer is plain
// JSON with one master playlist. The playlist host is open; the segment
// hosts admit only requests carrying the site's origin.

const API = 'https://api.stellar.gdn/api'
const HEADERS = { Origin: 'https://stellar.gdn', Referer: 'https://stellar.gdn/' }
// From the site's bundle; rotates when they redeploy, and this is the line that stops working.
const SECRET = 'iwTL6oi-9LLc3M4a1jcQV6jciugKj1_z6dYhdSbbtlg'
const TIMEOUT_MS = 10_000
const MAX_NONCE = 5_000_000

interface Challenge {
  challenge: string
  difficulty: number
}

async function fetchChallenge(): Promise<Challenge> {
  const res = await fetch(`${API}/challenge`, { signal: AbortSignal.timeout(TIMEOUT_MS) })
  if (!res.ok) throw new Error(`challenge ${res.status}`)
  const body = (await res.json()) as { challenge?: unknown; difficulty?: unknown }
  if (typeof body.challenge !== 'string' || typeof body.difficulty !== 'number') {
    throw new Error('challenge malformed')
  }
  return { challenge: body.challenge, difficulty: body.difficulty }
}

// The smallest nonce whose hash leads with `difficulty` zero nibbles.
// Difficulty 4 lands in tens of thousands of hashes, a few tens of ms.
function solve({ challenge, difficulty }: Challenge): string {
  const prefix = '0'.repeat(difficulty)
  for (let nonce = 0; nonce < MAX_NONCE; nonce++) {
    const hex = createHash('sha256').update(`${challenge}${nonce}`).digest('hex')
    if (hex.startsWith(prefix)) return String(nonce)
  }
  throw new Error('proof of work did not converge')
}

async function encryptBody(payload: Record<string, unknown>): Promise<string> {
  const date = new Date().toISOString().slice(0, 10)
  const keyBytes = createHash('sha256').update(`${SECRET}:${date}`).digest()
  const key = await webcrypto.subtle.importKey('raw', keyBytes, { name: 'AES-GCM' }, false, [
    'encrypt'
  ])
  const iv = randomBytes(12)
  const plain = Buffer.from(JSON.stringify(payload), 'utf8')
  const sealed = Buffer.from(await webcrypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plain))
  const tag = sealed.subarray(sealed.length - 16)
  const cipher = sealed.subarray(0, sealed.length - 16)
  return JSON.stringify({
    q: cipher.toString('base64'),
    s: iv.toString('base64'),
    t: tag.toString('base64'),
    d: date
  })
}

interface Resolved {
  url: string
  source: string
  availableSources: string[]
}

async function resolve(input: WebSourceInput, source?: string): Promise<Resolved | null> {
  const params: Record<string, unknown> = {
    mediaType: input.mediaType,
    id: String(input.tmdbId)
  }
  if (input.mediaType === 'tv') {
    params.season = input.season ?? 1
    params.episode = input.episode ?? 1
  }
  if (source) params.source = source

  // One retry: a challenge is single-use and short-lived, and the server says
  // so in words when it has been spent or its store is busy.
  for (let attempt = 0; attempt < 2; attempt++) {
    const challenge = await fetchChallenge()
    const nonce = solve(challenge)
    const res = await fetch(`${API}/resolve`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: await encryptBody({ ...params, challenge: challenge.challenge, nonce }),
      signal: AbortSignal.timeout(TIMEOUT_MS)
    })
    const body = (await res.json().catch(() => ({}))) as {
      url?: unknown
      source?: unknown
      availableSources?: unknown
      error?: unknown
    }
    if (typeof body.error === 'string') {
      if (/challenge/i.test(body.error) && attempt === 0) continue
      return null
    }
    if (typeof body.url !== 'string' || !body.url.startsWith('https://')) return null
    return {
      url: body.url,
      source: typeof body.source === 'string' ? body.source : (source ?? 'Stellar'),
      availableSources: Array.isArray(body.availableSources)
        ? body.availableSources.filter((s): s is string => typeof s === 'string')
        : []
    }
  }
  return null
}

async function toRow(r: Resolved): Promise<WebStream | null> {
  if (!(await upstreamAnswers(r.url, HEADERS))) return null
  return {
    id: `stellar:${r.source}`,
    server: r.source,
    lang: 'en',
    quality: 'Auto',
    url: await proxiedPlaylistUrl(r.url, HEADERS)
  }
}

async function listStreams(
  input: WebSourceInput,
  onChunk?: (rows: WebStream[]) => void
): Promise<WebStream[]> {
  // The first call names every source the title has; the rest are asked by name.
  const first = await resolve(input)
  if (!first) return []
  const out: WebStream[] = []
  const firstRow = await toRow(first)
  if (firstRow) {
    out.push(firstRow)
    onChunk?.([firstRow])
  }
  const others = first.availableSources.filter((s) => s !== first.source)
  await Promise.all(
    others.map(async (source) => {
      try {
        const r = await resolve(input, source)
        const row = r ? await toRow(r) : null
        if (!row) return
        out.push(row)
        onChunk?.([row])
      } catch (err) {
        console.warn(`[web-sources] stellar ${source} failed:`, (err as Error).message)
      }
    })
  )
  return out
}

export const stellar: WebSourceSite = { name: 'Stellar', listStreams }
