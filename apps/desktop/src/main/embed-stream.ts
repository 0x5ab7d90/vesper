import { BrowserWindow, ipcMain, session } from 'electron'
import {
  createServer,
  request as httpRequest,
  type IncomingMessage,
  type Server,
  type ServerResponse
} from 'http'
import { request as httpsRequest } from 'https'
import { randomBytes } from 'crypto'
import { URL } from 'url'

// Embed pages — the fights source (ADR-0017) and the web players that carry
// titles debrid refuses (ADR-0018) — only ever expose a playable URL by
// requesting it themselves. A hidden window loads the embed, we catch the
// playlist request it makes, and playback then flows through a local proxy
// that attaches the headers the stream hosts demand — the renderer's hls.js
// only ever talks to 127.0.0.1. Each proxied URL carries the header map its
// host wants (a Referer for most, an Origin for some), so one proxy serves
// every source site.

const CHROME_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
const EMBED_TIMEOUT_MS = 25_000
const EMBED_PARTITION = 'embed-intercept'
const M3U8_RE = /\.m3u8(\?|$)/i
const HLS_CONTENT_TYPE_RE = /mpegurl/i
const MAX_REDIRECTS = 3

let proxyServer: Server | null = null
let proxyPort = 0
let proxyToken = ''

/** Request headers a stream host demands, carried inside each proxied URL. */
export type UpstreamHeaders = Record<string, string>

function upstreamHeaders(headers: UpstreamHeaders): Record<string, string> {
  return {
    'Icy-MetaData': '1',
    'User-Agent': CHROME_UA,
    ...headers
  }
}

// The header map rides in the query as base64url JSON: opaque to hls.js,
// round-trips any header name, and stays short for the usual one or two.
function encodeHeaders(headers: UpstreamHeaders): string {
  return Buffer.from(JSON.stringify(headers)).toString('base64url')
}

function decodeHeaders(raw: string | null): UpstreamHeaders {
  if (!raw) return {}
  try {
    const parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) as unknown
    if (!parsed || typeof parsed !== 'object') return {}
    const out: UpstreamHeaders = {}
    for (const [k, v] of Object.entries(parsed)) if (typeof v === 'string') out[k] = v
    return out
  } catch {
    return {}
  }
}

function fetchUpstream(
  rawUrl: string,
  headers: UpstreamHeaders,
  redirectsLeft = MAX_REDIRECTS
): Promise<IncomingMessage> {
  return new Promise((resolve, reject) => {
    let target: URL
    try {
      target = new URL(rawUrl)
    } catch {
      reject(new Error('bad upstream url'))
      return
    }
    if (target.protocol !== 'https:' && target.protocol !== 'http:') {
      reject(new Error('unsupported upstream protocol'))
      return
    }
    const doRequest = target.protocol === 'https:' ? httpsRequest : httpRequest
    const req = doRequest(target, { headers: upstreamHeaders(headers) }, (res) => {
      const status = res.statusCode ?? 0
      const location = res.headers.location
      if (status >= 300 && status < 400 && location && redirectsLeft > 0) {
        res.resume()
        fetchUpstream(new URL(location, target).toString(), headers, redirectsLeft - 1).then(
          resolve,
          reject
        )
        return
      }
      resolve(res)
    })
    req.on('error', reject)
    req.setTimeout(20_000, () => req.destroy(new Error('upstream timed out')))
    req.end()
  })
}

function proxyUrlFor(absUrl: string, headers: UpstreamHeaders, kind: 'playlist' | 'seg'): string {
  const q = `t=${proxyToken}&h=${encodeHeaders(headers)}&u=${encodeURIComponent(absUrl)}`
  return `http://127.0.0.1:${proxyPort}/${kind}?${q}`
}

function isMasterPlaylist(text: string): boolean {
  return /^#EXT-X-STREAM-INF/m.test(text)
}

// URI lines and URI="..." attributes both get rerouted through the proxy so
// every follow-up request (variant playlists, init maps, segments on whatever
// host the playlist names) carries the required headers. Tokenized proxies
// don't put .m3u8 in their URLs, so a reference's kind comes from where it
// sits: a master's bare lines are variant playlists, a media playlist's are
// segments. Attribute URIs follow their tag: a rendition (EXT-X-MEDIA) or
// I-frame stream is always a playlist; keys and init maps are raw unless
// named outright.
const PLAYLIST_TAG_RE = /^#EXT-X-(MEDIA|I-FRAME-STREAM-INF):/
function rewritePlaylist(text: string, baseUrl: string, headers: UpstreamHeaders): string {
  const master = isMasterPlaylist(text)
  const rewriteRef = (ref: string, playlist: boolean): string => {
    try {
      const abs = new URL(ref, baseUrl).toString()
      const kind = playlist || M3U8_RE.test(abs) ? 'playlist' : 'seg'
      return proxyUrlFor(abs, headers, kind)
    } catch {
      return ref
    }
  }
  return text
    .split('\n')
    .map((line) => {
      const trimmed = line.trim()
      if (!trimmed) return line
      if (trimmed.startsWith('#')) {
        const playlist = PLAYLIST_TAG_RE.test(trimmed)
        return line.replace(
          /URI="([^"]+)"/g,
          (_m, uri: string) => `URI="${rewriteRef(uri, playlist)}"`
        )
      }
      return rewriteRef(trimmed, master)
    })
    .join('\n')
}

function readBody(res: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    res.on('data', (c: Buffer) => chunks.push(c))
    res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    res.on('error', reject)
  })
}

function baseResponseHeaders(): Record<string, string> {
  return {
    'access-control-allow-origin': '*',
    'cache-control': 'no-store'
  }
}

async function handleProxyRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? '/', 'http://127.0.0.1')
  if (url.searchParams.get('t') !== proxyToken) {
    res.writeHead(403).end()
    return
  }
  const target = url.searchParams.get('u') ?? ''
  const headers = decodeHeaders(url.searchParams.get('h'))
  if (url.pathname === '/playlist') {
    const upstream = await fetchUpstream(target, headers)
    if ((upstream.statusCode ?? 0) >= 400) {
      upstream.resume()
      res.writeHead(502, baseResponseHeaders()).end()
      return
    }
    const body = await readBody(upstream)
    res
      .writeHead(200, {
        ...baseResponseHeaders(),
        'content-type': 'application/vnd.apple.mpegurl'
      })
      .end(rewritePlaylist(body, target, headers))
    return
  }
  if (url.pathname === '/seg') {
    const upstream = await fetchUpstream(target, headers)
    // A reference we took for a segment can still turn out to be a playlist
    // (a proxy URL with nothing telling in it). The content type says so;
    // rewrite it rather than pipe it, or its own references escape the proxy.
    if (HLS_CONTENT_TYPE_RE.test(upstream.headers['content-type'] ?? '')) {
      const body = await readBody(upstream)
      res
        .writeHead(200, {
          ...baseResponseHeaders(),
          'content-type': 'application/vnd.apple.mpegurl'
        })
        .end(rewritePlaylist(body, target, headers))
      return
    }
    res.writeHead(upstream.statusCode ?? 502, {
      ...baseResponseHeaders(),
      'content-type': upstream.headers['content-type'] ?? 'application/octet-stream'
    })
    upstream.pipe(res)
    upstream.on('error', () => res.destroy())
    return
  }
  res.writeHead(404).end()
}

function ensureProxy(): Promise<void> {
  if (proxyServer) return Promise.resolve()
  proxyToken = randomBytes(16).toString('hex')
  const server = createServer((req, res) => {
    handleProxyRequest(req, res).catch(() => {
      if (!res.headersSent) res.writeHead(502, baseResponseHeaders())
      res.end()
    })
  })
  proxyServer = server
  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address()
      if (addr && typeof addr === 'object') proxyPort = addr.port
      resolve()
    })
  })
}

// One hidden embed at a time: the intercept listeners are session-wide, so
// concurrent loads would race for them.
let embedQueue: Promise<unknown> = Promise.resolve()

// Ad networks load alongside the real player on every embed page; nothing
// they serve is ever the stream.
const AD_HOST_RE = /doubleclick|adnxs|exoclick|propeller|popads|juicyads|gammaplatform|vcmdiawe/i

function interceptPlaylist(embedUrl: string): Promise<string> {
  const ses = session.fromPartition(EMBED_PARTITION)
  ses.setUserAgent(CHROME_UA)
  const win = new BrowserWindow({
    show: false,
    width: 1280,
    height: 720,
    webPreferences: {
      partition: EMBED_PARTITION,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false
    }
  })
  win.webContents.setAudioMuted(true)
  // Embed pages are dense with popup/ad scripts — nothing they open may
  // surface, and the window itself never shows.
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))

  return new Promise((resolve, reject) => {
    let settled = false
    const finish = (err: Error | null, playlistUrl?: string): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      ses.webRequest.onBeforeRequest(null)
      ses.webRequest.onHeadersReceived(null)
      if (!win.isDestroyed()) win.destroy()
      if (err) reject(err)
      else resolve(playlistUrl ?? '')
    }
    const timer = setTimeout(
      () => finish(new Error('timed out waiting for the stream')),
      EMBED_TIMEOUT_MS
    )
    // Two tells for the playlist: most hosts name it .m3u8; tokenized proxies
    // don't, and only give themselves away by the content-type they answer with.
    ses.webRequest.onBeforeRequest({ urls: ['*://*/*'] }, (details, callback) => {
      if (M3U8_RE.test(details.url) && !AD_HOST_RE.test(details.url)) {
        callback({ cancel: true })
        finish(null, details.url)
        return
      }
      callback({})
    })
    ses.webRequest.onHeadersReceived({ urls: ['*://*/*'] }, (details, callback) => {
      const type = Object.entries(details.responseHeaders ?? {})
        .find(([k]) => k.toLowerCase() === 'content-type')?.[1]
        ?.join(';')
      if (type && HLS_CONTENT_TYPE_RE.test(type) && !AD_HOST_RE.test(details.url)) {
        callback({ cancel: true })
        finish(null, details.url)
        return
      }
      callback({})
    })
    win.webContents.on('did-fail-load', (_e, _code, desc, _url, isMainFrame) => {
      if (isMainFrame) finish(new Error(`embed failed to load (${desc})`))
    })
    win.loadURL(embedUrl).catch((err: Error) => finish(err))
  })
}

export function registerEmbedStreams(): void {
  ipcMain.handle('embed:resolveStream', async (_e, embedUrl: string): Promise<string> => {
    if (typeof embedUrl !== 'string' || !embedUrl.startsWith('https://')) {
      throw new Error('invalid embed url')
    }
    const headers = { Referer: `${new URL(embedUrl).origin}/` }
    const run = embedQueue.then(() => interceptPlaylist(embedUrl))
    embedQueue = run.catch(() => undefined)
    const playlistUrl = await run
    await ensureProxy()
    return proxyUrlFor(playlistUrl, headers, 'playlist')
  })
}

// Whether a playlist answers at all, with the same headers playback will send.
// Web sources list whatever their API hands out, and a host Cloudflare has
// switched off still gets listed unless someone asks it first; the body is
// dropped unread, so this costs one round trip and no bandwidth.
export async function upstreamAnswers(
  playlistUrl: string,
  headers: UpstreamHeaders
): Promise<boolean> {
  try {
    const res = await fetchUpstream(playlistUrl, headers)
    res.destroy()
    const status = res.statusCode ?? 0
    return status >= 200 && status < 300
  } catch {
    return false
  }
}

// A playlist whose URL is already known (web sources, ADR-0019) skips the
// hidden window and only needs the header proxy in front of it.
export async function proxiedPlaylistUrl(
  playlistUrl: string,
  headers: UpstreamHeaders
): Promise<string> {
  await ensureProxy()
  return proxyUrlFor(playlistUrl, headers, 'playlist')
}

export function stopEmbedProxy(): void {
  proxyServer?.close()
  proxyServer = null
}
