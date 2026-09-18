import { createServer, type Server } from 'node:http'
import { createReadStream, existsSync, statSync } from 'node:fs'
import { join, normalize, extname } from 'node:path'

const PINNED_PORT = 3000

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.wasm': 'application/wasm',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.map': 'application/json; charset=utf-8'
}

let server: Server | null = null

export function startRendererServer(rendererDir: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer((req, res) => {
      try {
        const url = new URL(req.url ?? '/', 'http://127.0.0.1')
        const safePath = normalize(decodeURIComponent(url.pathname)).replace(/^[/\\]+/, '')
        let abs = join(rendererDir, safePath)
        if (!abs.startsWith(rendererDir)) {
          res.statusCode = 403
          res.end('forbidden')
          return
        }
        if (!existsSync(abs) || statSync(abs).isDirectory()) {
          abs = join(rendererDir, 'index.html')
        }
        const ext = extname(abs).toLowerCase()
        res.setHeader('Content-Type', MIME[ext] ?? 'application/octet-stream')
        res.setHeader('Cache-Control', 'no-cache')
        createReadStream(abs).pipe(res)
      } catch (err) {
        res.statusCode = 500
        res.end(String(err))
      }
    })
    srv.on('error', reject)
    srv.listen(PINNED_PORT, '127.0.0.1', () => {
      server = srv
      resolve(PINNED_PORT)
    })
  })
}

export function stopRendererServer(): void {
  if (server) {
    server.close()
    server = null
  }
}

export function rendererBaseUrl(): string {
  return `http://127.0.0.1:${PINNED_PORT}`
}
