import {
  app,
  shell,
  BrowserWindow,
  ipcMain,
  session,
  screen,
  clipboard,
  dialog,
  nativeImage
} from 'electron'
import { join, basename, extname, resolve } from 'path'
import { promises as fsp, existsSync, readFileSync, writeFileSync } from 'fs'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import windowStateKeeper from 'electron-window-state'
import { setDiscordActivity, clearDiscordActivity, disconnectDiscord } from './discord'
import { registerUpdater } from './updater'
import { startRendererServer, stopRendererServer, rendererBaseUrl } from './renderer-server'
import {
  listExternalPlayers,
  openInExternalPlayer,
  type ExternalPlayerId
} from './external-players'
import icon from '../../resources/icon.png?asset'
import iconMac from '../../resources/icon-mac.png?asset'
import { registerEmbedStreams, stopEmbedProxy } from './embed-stream'
import { registerKalshi } from './kalshi'
import { registerWebSources } from './web-sources'
import { registerPower } from './power'

app.commandLine.appendSwitch('enable-features', 'PlatformHEVCDecoderSupport')

// Opt-in DevTools protocol endpoint for profiling: VESPER_CDP=<port> pnpm dev
if (!app.isPackaged && process.env['VESPER_CDP']) {
  app.commandLine.appendSwitch('remote-debugging-port', process.env['VESPER_CDP'])
}

const CACHE_LIMIT_DEFAULT_BYTES = 8 * 1024 * 1024 * 1024
const CACHE_LIMIT_MIN_BYTES = 4 * 1024 * 1024 * 1024
const CACHE_LIMIT_FILE = join(app.getPath('userData'), 'cache-limit')

function readCacheLimitFile(): number {
  try {
    const raw = readFileSync(CACHE_LIMIT_FILE, 'utf8').trim()
    const n = parseInt(raw, 10)
    if (Number.isFinite(n) && n >= CACHE_LIMIT_MIN_BYTES) return n
  } catch {
    /* missing or invalid */
  }
  return CACHE_LIMIT_DEFAULT_BYTES
}

const ZOOM_STEP_FILE = join(app.getPath('userData'), 'zoom-step')
// Zoom levels the user steps through with Ctrl/Cmd +/-, as multipliers of the
// display-derived base zoom. Ctrl/Cmd 0 returns to ZOOM_BASE_STEP.
const ZOOM_STEPS = [0.7, 0.8, 0.9, 1, 1.1, 1.25, 1.4, 1.6]
const ZOOM_BASE_STEP = 3

function readZoomStep(): number {
  try {
    const n = parseInt(readFileSync(ZOOM_STEP_FILE, 'utf8').trim(), 10)
    if (Number.isInteger(n) && n >= 0 && n < ZOOM_STEPS.length) return n
  } catch {
    /* missing or invalid */
  }
  return ZOOM_BASE_STEP
}

function writeZoomStep(step: number): void {
  try {
    writeFileSync(ZOOM_STEP_FILE, String(step))
  } catch {
    /* the level still applies to this session, it just will not survive a restart */
  }
}

const APPLIED_CACHE_LIMIT_BYTES = readCacheLimitFile()
app.commandLine.appendSwitch('disk-cache-size', String(APPLIED_CACHE_LIMIT_BYTES))

// Earlier releases let users pick an icon by repointing their Start Menu,
// desktop, and pinned-taskbar shortcuts at a variant .ico under resources.
// Those files no longer ship, so a shortcut still aimed there would draw a
// blank; point it back at the exe, whose embedded icon is the current one.
function resetLegacyShortcutIcons(): void {
  if (process.platform !== 'win32' || !app.isPackaged) return
  const appData = app.getPath('appData')
  const names = [...new Set([basename(process.execPath, extname(process.execPath)), app.getName()])]
  const dirs = [
    join(appData, 'Microsoft', 'Windows', 'Start Menu', 'Programs'),
    app.getPath('desktop'),
    join(appData, 'Microsoft', 'Internet Explorer', 'Quick Launch', 'User Pinned', 'TaskBar')
  ]
  for (const dir of dirs) {
    for (const name of names) {
      const link = join(dir, `${name}.lnk`)
      if (!existsSync(link)) continue
      try {
        const details = shell.readShortcutLink(link)
        if (!details.icon || !/[\\/]resources[\\/]icons[\\/]/i.test(details.icon)) continue
        shell.writeShortcutLink(link, 'update', {
          ...details,
          icon: process.execPath,
          iconIndex: 0
        })
      } catch {
        /* a shortcut the user moved or locked is not worth failing launch over */
      }
    }
  }
}

// Packaged builds carry the icon in the bundle; in dev the Dock shows
// Electron's own until told otherwise.
if (process.platform === 'darwin' && app.dock && !app.isPackaged) {
  app.dock.setIcon(nativeImage.createFromPath(iconMac))
}

const PROTOCOL = 'vesper'
const WEB_HOST = 'vespr.dev'

// track pending deep link url captured before the renderer is ready.
let pendingOpenUrl: string | null = null
let mainWindowRef: BrowserWindow | null = null

function rewriteForEpisode(path: string): string {
  // /tv/123/4/5  →  /tv/123?focusSeason=4&focusEpisode=5
  const epDeep = path.match(/^\/tv\/(\d+)\/(\d+)\/(\d+)$/)
  if (epDeep) return `/tv/${epDeep[1]}?focusSeason=${epDeep[2]}&focusEpisode=${epDeep[3]}`
  // /tv/123/s4e5  →  /tv/123?focusSeason=4&focusEpisode=5
  const epWeb = path.match(/^\/tv\/(\d+)\/s(\d+)e(\d+)$/i)
  if (epWeb) return `/tv/${epWeb[1]}?focusSeason=${epWeb[2]}&focusEpisode=${epWeb[3]}`
  return path
}

function extractRoute(raw: string): string | null {
  try {
    const u = new URL(raw)
    if (u.protocol === `${PROTOCOL}:`) {
      // vesper://movie/123  →  pathname = "//movie/123" or "/movie/123" depending on parser
      const path = u.pathname.replace(/^\/+/, '')
      const host = u.host
      const joined = `/${[host, path].filter(Boolean).join('/')}`.replace(/\/+$/, '') || '/'
      return rewriteForEpisode(joined)
    }
    if (u.protocol === 'https:' && u.host === WEB_HOST) {
      return rewriteForEpisode(u.pathname || '/')
    }
  } catch {
    /* not a parseable URL */
  }
  return null
}

let pendingAuthCode: string | null = null

function extractAuthCode(raw: string): string | null {
  try {
    const u = new URL(raw)
    if (u.protocol !== `${PROTOCOL}:`) return null
    if (u.host !== 'auth' && u.pathname !== '/auth' && u.pathname !== '//auth') return null
    return u.searchParams.get('code')
  } catch {
    return null
  }
}

function dispatchOpenUrl(raw: string): void {
  const authCode = extractAuthCode(raw)
  if (authCode) {
    if (mainWindowRef && !mainWindowRef.isDestroyed()) {
      mainWindowRef.webContents.send('auth:code', authCode)
      if (mainWindowRef.isMinimized()) mainWindowRef.restore()
      mainWindowRef.focus()
    } else {
      pendingAuthCode = authCode
    }
    return
  }
  const route = extractRoute(raw)
  if (!route) return
  if (mainWindowRef && !mainWindowRef.isDestroyed()) {
    mainWindowRef.webContents.send('app:open-url', route)
    if (mainWindowRef.isMinimized()) mainWindowRef.restore()
    mainWindowRef.focus()
  } else {
    pendingOpenUrl = route
  }
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
}
app.on('second-instance', (_event, argv) => {
  for (const arg of argv) {
    if (extractRoute(arg)) {
      dispatchOpenUrl(arg)
      break
    }
  }
})
app.on('open-url', (event, url) => {
  event.preventDefault()
  dispatchOpenUrl(url)
})

if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient(PROTOCOL, process.execPath, [resolve(process.argv[1]!)])
  }
} else {
  app.setAsDefaultProtocolClient(PROTOCOL)
}

const SPLASH_WIDTH = 360
const SPLASH_HEIGHT = 300
const MIN_SPLASH_MS = 1200
const MAIN_READY_FALLBACK_MS = 12_000

function createSplashWindow(): BrowserWindow {
  const { workArea } = screen.getPrimaryDisplay()
  const x = Math.round(workArea.x + (workArea.width - SPLASH_WIDTH) / 2)
  const y = Math.round(workArea.y + (workArea.height - SPLASH_HEIGHT) / 2)
  const splash = new BrowserWindow({
    width: SPLASH_WIDTH,
    height: SPLASH_HEIGHT,
    x,
    y,
    useContentSize: true,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    show: false,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: join(__dirname, '../preload/splash.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      devTools: !app.isPackaged
    }
  })
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    splash.loadURL(process.env['ELECTRON_RENDERER_URL'] + '/splash.html')
  } else {
    splash.loadFile(join(__dirname, '../renderer/splash.html'))
  }
  splash.once('ready-to-show', () => splash.show())
  return splash
}

function runSplashSimulator(splash: BrowserWindow): void {
  const send = (channel: string, payload?: unknown): void => {
    if (splash.isDestroyed()) return
    splash.webContents.send(channel, payload)
  }
  splash.webContents.once('did-finish-load', () => {
    const start = Date.now()
    const step = (): void => {
      const t = Date.now() - start
      if (t < 600) send('updater:checking')
      else if (t < 1200) send('updater:available', { version: '0.5.7' })
      else if (t < 5200) {
        const pct = Math.min(100, ((t - 1200) / 4000) * 100)
        send('updater:progress', { percent: pct })
      } else if (t < 6400) send('updater:downloaded', { version: '0.5.7' })
      else {
        send('updater:checking')
        // restart cycle
        setTimeout(() => runSplashSimulator(splash), 800)
        return
      }
      setTimeout(step, 80)
    }
    step()
  })
}

function createWindow(): BrowserWindow {
  const windowState = windowStateKeeper({
    defaultWidth: 1440,
    defaultHeight: 900
  })

  const mainWindow = new BrowserWindow({
    x: windowState.x,
    y: windowState.y,
    width: windowState.width,
    height: windowState.height,
    minWidth: 1000,
    minHeight: 640,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#000000',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'hidden',
    trafficLightPosition: { x: 18, y: 15 },
    frame: process.platform === 'win32' ? false : undefined,
    ...(process.platform !== 'darwin' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      // The playback engine drives decode and canvas mirroring from renderer timers; throttling
      // them when the window is hidden stalls picture-in-picture and background playback.
      backgroundThrottling: false
    }
  })

  if (process.platform === 'darwin') {
    mainWindow.setWindowButtonPosition({ x: 18, y: 15 })
  }

  windowState.manage(mainWindow)

  mainWindow.on('enter-full-screen', () => {
    mainWindow.webContents.send('window:fullscreen-changed', true)
  })
  mainWindow.on('leave-full-screen', () => {
    mainWindow.webContents.send('window:fullscreen-changed', false)
  })

  mainWindowRef = mainWindow
  mainWindow.on('closed', () => {
    if (mainWindowRef === mainWindow) mainWindowRef = null
  })

  mainWindow.webContents.once('did-finish-load', () => {
    if (pendingAuthCode) {
      mainWindow.webContents.send('auth:code', pendingAuthCode)
      pendingAuthCode = null
    }
    if (pendingOpenUrl) {
      mainWindow.webContents.send('app:open-url', pendingOpenUrl)
      pendingOpenUrl = null
    }
    // Windows/Linux: check argv at startup for protocol URL.
    if (process.platform !== 'darwin') {
      for (const arg of process.argv) {
        if (extractRoute(arg)) {
          mainWindow.webContents.send('app:open-url', extractRoute(arg))
          break
        }
      }
    }
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  const { width: screenWidth } = screen.getPrimaryDisplay().workAreaSize
  const REFERENCE_WIDTH = 2560
  const MIN_ZOOM = 0.8
  const MAX_ZOOM = 1
  const raw = screenWidth / REFERENCE_WIDTH
  const clamped = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, raw))
  const autoZoom = Math.round(clamped * 20) / 20

  let zoomStep = readZoomStep()
  const applyZoom = (): void => {
    mainWindow.webContents.setZoomFactor(autoZoom * ZOOM_STEPS[zoomStep])
  }
  const stepZoom = (next: number): void => {
    const clamped = Math.min(ZOOM_STEPS.length - 1, Math.max(0, next))
    if (clamped === zoomStep) return
    zoomStep = clamped
    applyZoom()
    writeZoomStep(zoomStep)
  }

  mainWindow.webContents.setVisualZoomLevelLimits(1, 1)
  mainWindow.webContents.on('did-finish-load', applyZoom)

  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return
    // Handle F11 ourselves so window fullscreen stays in sync with the renderer UI.
    if (input.key === 'F11') {
      event.preventDefault()
      mainWindow.setFullScreen(!mainWindow.isFullScreen())
      return
    }
    const mod = process.platform === 'darwin' ? input.meta : input.control
    if (!mod) return
    if (input.key === '=' || input.key === '+') {
      event.preventDefault()
      stepZoom(zoomStep + 1)
    } else if (input.key === '-' || input.key === '_') {
      event.preventDefault()
      stepZoom(zoomStep - 1)
    } else if (input.key === '0') {
      event.preventDefault()
      stepZoom(ZOOM_BASE_STEP)
    }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadURL(rendererBaseUrl() + '/')
  }

  return mainWindow
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('sh.mirae.app')

  session.defaultSession.webRequest.onHeadersReceived(
    {
      urls: [
        'https://webservice.fanart.tv/*',
        'https://assets.fanart.tv/*',
        'https://api.introdb.app/*',
        'https://*.r2.cloudflarestorage.com/*',
        'https://*.download.real-debrid.com/*',
        'https://*.elfhosted.cc/*',
        'https://*.strem.fun/*',
        'https://comet.vespr.dev/*',
        'https://*.midnightignite.me/*',
        'https://sooti.click/*',
        'https://*.sooti.click/*'
      ]
    },
    (details, callback) => {
      const headers = { ...(details.responseHeaders ?? {}) }
      let foundAllow = false
      for (const key of Object.keys(headers)) {
        const lower = key.toLowerCase()
        if (lower === 'access-control-allow-origin') {
          headers[key] = ['*']
          foundAllow = true
        } else if (lower === 'access-control-allow-credentials') {
          delete headers[key]
        }
      }
      if (!foundAllow) headers['access-control-allow-origin'] = ['*']
      if (details.method === 'OPTIONS') {
        headers['access-control-allow-methods'] = ['GET,POST,PUT,DELETE,HEAD,OPTIONS']
        headers['access-control-allow-headers'] = ['*']
        headers['access-control-max-age'] = ['600']
      }
      // Never disk-cache the debrid stream — Chromium would otherwise copy every streamed
      // byte into its HTTP cache, filling the disk with multi-GB duplicates.
      if (details.url.includes('.download.real-debrid.com/')) {
        for (const key of Object.keys(headers)) {
          if (key.toLowerCase() === 'cache-control') delete headers[key]
        }
        headers['cache-control'] = ['no-store']
      }
      callback({ responseHeaders: headers })
    }
  )

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  ipcMain.on('ping', () => console.log('pong'))

  resetLegacyShortcutIcons()
  registerEmbedStreams()
  registerKalshi()
  registerWebSources()
  registerPower()

  ipcMain.handle(
    'subtitles:pickFile',
    async (event): Promise<{ name: string; bytes: Uint8Array } | null> => {
      const win = BrowserWindow.fromWebContents(event.sender)
      const opts: Electron.OpenDialogOptions = {
        title: 'Choose subtitle file',
        properties: ['openFile'],
        filters: [
          { name: 'Subtitles', extensions: ['srt', 'vtt', 'ass', 'ssa'] },
          { name: 'All Files', extensions: ['*'] }
        ]
      }
      const res = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts)
      if (res.canceled || res.filePaths.length === 0) return null
      const filePath = res.filePaths[0]
      const buf = await fsp.readFile(filePath)
      return { name: basename(filePath), bytes: new Uint8Array(buf) }
    }
  )

  ipcMain.handle('window:minimize', (event) => {
    BrowserWindow.fromWebContents(event.sender)?.minimize()
  })
  ipcMain.handle('window:toggleMaximize', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return
    if (win.isMaximized()) win.unmaximize()
    else win.maximize()
  })
  // Restoring a minimized window keeps the bounds the OS already had, so a window that was sent
  // away during picture-in-picture comes back exactly where and how the viewer left it.
  ipcMain.handle('window:restore', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return
    if (win.isMinimized()) win.restore()
    win.show()
  })
  ipcMain.handle('window:close', (event) => {
    BrowserWindow.fromWebContents(event.sender)?.close()
  })
  ipcMain.handle('window:setFullScreen', (event, flag: boolean) => {
    BrowserWindow.fromWebContents(event.sender)?.setFullScreen(Boolean(flag))
  })
  ipcMain.handle('window:isFullScreen', (event) => {
    return BrowserWindow.fromWebContents(event.sender)?.isFullScreen() ?? false
  })

  ipcMain.handle('devtools:toggle', (event) => {
    event.sender.toggleDevTools()
  })

  ipcMain.handle('externalPlayer:list', () => listExternalPlayers())
  ipcMain.handle(
    'externalPlayer:open',
    (_e, id: ExternalPlayerId, url: string, positionSec: number) =>
      openInExternalPlayer(id, url, positionSec)
  )

  ipcMain.handle('discord:setActivity', (_e, input) => setDiscordActivity(input))
  ipcMain.handle('discord:clearActivity', () => clearDiscordActivity())
  ipcMain.handle('storage:imageCacheSize', () => computeWebCacheSize())
  ipcMain.handle('storage:clearImageCache', async () => {
    await session.defaultSession.clearCache()
    await session.defaultSession.clearStorageData({
      storages: ['cachestorage', 'serviceworkers', 'shadercache']
    })
  })
  ipcMain.handle('storage:getCacheLimit', () => ({
    applied: APPLIED_CACHE_LIMIT_BYTES,
    pending: readCacheLimitFile()
  }))
  ipcMain.handle('storage:setCacheLimit', (_e, bytes: number) => {
    if (!Number.isFinite(bytes) || bytes < CACHE_LIMIT_MIN_BYTES) {
      throw new Error('cache limit below minimum')
    }
    writeFileSync(CACHE_LIMIT_FILE, String(Math.floor(bytes)), 'utf8')
  })

  ipcMain.handle(
    'screenshot:captureToClipboard',
    async (event, rect: { x: number; y: number; width: number; height: number }): Promise<void> => {
      const win = BrowserWindow.fromWebContents(event.sender)
      if (!win) throw new Error('no window')
      const img = await win.webContents.capturePage({
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height)
      })
      if (img.isEmpty()) throw new Error('capture returned empty image')
      clipboard.writeImage(img)
    }
  )

  const splashOnly =
    process.env['VESPER_SPLASH_ONLY'] === '1' || process.argv.includes('--splash-only')

  if (splashOnly) {
    const splash = createSplashWindow()
    runSplashSimulator(splash)
    splash.on('closed', () => app.quit())
    return
  }

  if (!(is.dev && process.env['ELECTRON_RENDERER_URL'])) {
    const rendererDir = join(__dirname, '..', 'renderer')
    startRendererServer(rendererDir).catch((e) =>
      console.error('[renderer-server] failed to start', e)
    )
  }

  const splash = createSplashWindow()
  const mainWindow = createWindow()
  const { gateReady } = registerUpdater(mainWindow, splash)

  const startedAt = Date.now()
  const mainReady = new Promise<void>((resolve) => {
    let resolved = false
    const done = (): void => {
      if (resolved) return
      resolved = true
      resolve()
    }
    ipcMain.once('main:ready', done)
    setTimeout(done, MAIN_READY_FALLBACK_MS)
  })

  void (async () => {
    await Promise.all([gateReady, mainReady])
    const remaining = MIN_SPLASH_MS - (Date.now() - startedAt)
    setTimeout(
      () => {
        if (!mainWindow.isDestroyed()) mainWindow.show()
        if (splash && !splash.isDestroyed()) splash.close()
      },
      Math.max(remaining, 0)
    )
  })()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

const CACHE_DIRS = [
  'Cache',
  'Code Cache',
  'GPUCache',
  'DawnGraphiteCache',
  'DawnWebGPUCache',
  join('Service Worker', 'CacheStorage'),
  join('Shared Dictionary', 'cache'),
  join('WebStorage', '3', 'CacheStorage')
]

async function dirSize(dir: string): Promise<number> {
  let total = 0
  let entries: import('fs').Dirent[]
  try {
    entries = await fsp.readdir(dir, { withFileTypes: true })
  } catch {
    return 0
  }
  for (const ent of entries) {
    const full = join(dir, ent.name)
    if (ent.isDirectory()) {
      total += await dirSize(full)
    } else if (ent.isFile()) {
      try {
        const s = await fsp.stat(full)
        total += s.size
      } catch {
        /* skip */
      }
    }
  }
  return total
}

async function computeWebCacheSize(): Promise<number> {
  const userData = app.getPath('userData')
  const sizes = await Promise.all(CACHE_DIRS.map((d) => dirSize(join(userData, d))))
  return sizes.reduce((a, b) => a + b, 0)
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  stopRendererServer()
  stopEmbedProxy()
  void disconnectDiscord()
})
