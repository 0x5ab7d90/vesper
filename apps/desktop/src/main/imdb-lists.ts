import { BrowserWindow, ipcMain, session } from 'electron'

// IMDb's API will not enumerate a user's public lists, and the lists page answers plain HTTP
// clients with a bot challenge. A hidden window is a real browser session, so it gets the
// page — and the `ls…` ids on it — most of the time. When IMDb still refuses, the caller
// hears `null` and falls back to asking the user for list links.

const PARTITION = 'persist:imdb'
const CHROME_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'
const TIMEOUT_MS = 25_000
const POLL_MS = 1_000

// Anchors first; the page's embedded JSON as a backstop, since the cards render a beat after
// the shell does. "hasNone" is IMDb's own empty state, so an empty answer is a real one.
const COLLECT = `(() => {
  const ids = new Set()
  for (const a of document.querySelectorAll('a[href*="/list/ls"]')) {
    const m = (a.getAttribute('href') || '').match(/\\/list\\/(ls\\d{6,12})/)
    if (m) ids.add(m[1])
  }
  if (ids.size === 0) {
    const next = document.getElementById('__NEXT_DATA__')
    for (const m of (next ? next.textContent : '').matchAll(/"(ls\\d{6,12})"/g)) ids.add(m[1])
  }
  const text = document.body ? document.body.innerText : ''
  return {
    ids: [...ids],
    title: document.title,
    hasNone: /(hasn't|has not|haven't) (created|made) any lists|no lists yet/i.test(text)
  }
})()`

let queue: Promise<unknown> = Promise.resolve()

async function discoverLists(imdbUserId: string): Promise<string[] | null> {
  const ses = session.fromPartition(PARTITION)
  ses.setUserAgent(CHROME_UA)
  const win = new BrowserWindow({
    show: false,
    width: 1280,
    height: 900,
    webPreferences: {
      partition: PARTITION,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false
    }
  })
  win.webContents.setAudioMuted(true)
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))

  let status = 0
  win.webContents.on('did-navigate', (_e, _url, httpResponseCode) => {
    status = httpResponseCode
  })

  const deadline = Date.now() + TIMEOUT_MS
  try {
    await win.loadURL(`https://www.imdb.com/user/${imdbUserId}/lists/`).catch(() => undefined)
    // A WAF challenge (202) solves itself and reloads; a 403 never will. Poll until the list
    // links are in the DOM or time runs out.
    while (Date.now() < deadline) {
      if (win.isDestroyed()) return null
      const found = (await win.webContents.executeJavaScript(COLLECT, true).catch(() => null)) as {
        ids: string[]
        title: string
        hasNone: boolean
      } | null
      if (found && /403|forbidden/i.test(found.title)) {
        console.log('[imdb] lists page refused', { status, title: found.title })
        return null
      }
      if (found && status === 200 && found.ids.length > 0) {
        console.log('[imdb] lists discovered', { count: found.ids.length })
        return found.ids
      }
      if (found && status === 200 && found.hasNone) return []
      await new Promise((r) => setTimeout(r, POLL_MS))
    }
    console.log('[imdb] lists discovery timed out', { status })
    // A page that loaded fine but never showed lists is treated as having none; anything
    // else is a block, and the row will ask for links.
    return status === 200 ? [] : null
  } finally {
    if (!win.isDestroyed()) win.destroy()
  }
}

export function registerImdbLists(): void {
  ipcMain.handle('imdb:discoverLists', async (_e, imdbUserId: string): Promise<string[] | null> => {
    if (typeof imdbUserId !== 'string' || !/^ur\d{5,12}$/.test(imdbUserId)) {
      throw new Error('invalid imdb user id')
    }
    const run = queue.then(() => discoverLists(imdbUserId))
    queue = run.catch(() => undefined)
    return await run
  })
}
