import { ElectronAPI } from '@electron-toolkit/preload'

export interface DiscordActivity {
  details: string
  state: string
  largeImage: string
  largeText: string
  startTimestamp?: number
  endTimestamp?: number
}

export interface WebStreamInput {
  title: string
  mediaType: 'movie' | 'tv'
  tmdbId: number
  imdbId?: string
  year?: number
  season?: number
  episode?: number
}

export interface WebStream {
  id: string
  server: string
  lang: string
  quality: string
  url: string
}

export interface VesperApi {
  window: {
    minimize: () => Promise<void>
    restore: () => Promise<void>
    toggleMaximize: () => Promise<void>
    close: () => Promise<void>
    setFullScreen: (flag: boolean) => Promise<void>
    isFullScreen: () => Promise<boolean>
    onFullScreenChange: (cb: (fullscreen: boolean) => void) => () => void
  }
  discord: {
    setActivity: (input: DiscordActivity) => Promise<void>
    clearActivity: () => Promise<void>
  }
  storage: {
    imageCacheSize: () => Promise<number>
    clearImageCache: () => Promise<void>
    getCacheLimit: () => Promise<{ applied: number; pending: number }>
    setCacheLimit: (bytes: number) => Promise<void>
  }
  screenshot: {
    captureToClipboard: (rect: {
      x: number
      y: number
      width: number
      height: number
    }) => Promise<void>
  }
  devtools: {
    toggle: () => Promise<void>
  }
  power: {
    /** Hold a display wake lock while playback is active; release it when it stops. */
    setPlaybackActive: (active: boolean) => Promise<void>
  }
  subtitles: {
    pickFile: () => Promise<{ name: string; bytes: Uint8Array } | null>
  }
  externalPlayer: {
    list: () => Promise<Array<{ id: 'vlc' | 'iina' | 'mpv'; name: string }>>
    open: (id: 'vlc' | 'iina' | 'mpv', url: string, positionSec: number) => Promise<void>
  }
  embed: {
    /** Playlist URL (via the local header proxy) for any https embed page. */
    resolveStream: (embedUrl: string) => Promise<string>
  }
  fights: {
    kalshiGet: (path: string) => Promise<unknown>
  }
  imdb: {
    /**
     * The `ls…` ids on a user's public IMDb lists page, read in a hidden window because IMDb's
     * API won't enumerate them. `null` when IMDb blocked the page; `[]` when it has none.
     */
    discoverLists: (imdbUserId: string) => Promise<string[] | null>
  }
  web: {
    /**
     * Every HLS stream the web source API carries for a title, playable through the local
     * proxy. Rows arrive server by server through `onChunk`; the promise carries the full list.
     */
    listStreams: (
      input: WebStreamInput,
      onChunk?: (rows: WebStream[]) => void
    ) => Promise<WebStream[]>
  }
  onOpenUrl: (cb: (route: string) => void) => () => void
  onAuthCode: (cb: (code: string) => void) => () => void
  signalMainReady: () => void
  getAppVersion: () => Promise<string>
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: VesperApi
  }
}
