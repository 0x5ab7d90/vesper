import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type { VesperApi } from './index.d'

const api = {
  window: {
    minimize: () => ipcRenderer.invoke('window:minimize'),
    restore: () => ipcRenderer.invoke('window:restore'),
    toggleMaximize: () => ipcRenderer.invoke('window:toggleMaximize'),
    close: () => ipcRenderer.invoke('window:close'),
    setFullScreen: (flag: boolean) => ipcRenderer.invoke('window:setFullScreen', flag),
    isFullScreen: () => ipcRenderer.invoke('window:isFullScreen') as Promise<boolean>,
    onFullScreenChange: (cb: (fullscreen: boolean) => void): (() => void) => {
      const listener = (_e: unknown, fullscreen: boolean): void => cb(fullscreen)
      ipcRenderer.on('window:fullscreen-changed', listener)
      return () => ipcRenderer.removeListener('window:fullscreen-changed', listener)
    }
  },
  discord: {
    setActivity: (input: {
      details: string
      state: string
      largeImage: string
      largeText: string
      startTimestamp?: number
      endTimestamp?: number
    }) => ipcRenderer.invoke('discord:setActivity', input),
    clearActivity: () => ipcRenderer.invoke('discord:clearActivity')
  },
  storage: {
    imageCacheSize: () => ipcRenderer.invoke('storage:imageCacheSize') as Promise<number>,
    clearImageCache: () => ipcRenderer.invoke('storage:clearImageCache') as Promise<void>,
    getCacheLimit: () =>
      ipcRenderer.invoke('storage:getCacheLimit') as Promise<{
        applied: number
        pending: number
      }>,
    setCacheLimit: (bytes: number) =>
      ipcRenderer.invoke('storage:setCacheLimit', bytes) as Promise<void>
  },
  screenshot: {
    captureToClipboard: (rect: { x: number; y: number; width: number; height: number }) =>
      ipcRenderer.invoke('screenshot:captureToClipboard', rect) as Promise<void>
  },
  devtools: {
    toggle: () => ipcRenderer.invoke('devtools:toggle') as Promise<void>
  },
  power: {
    setPlaybackActive: (active: boolean) =>
      ipcRenderer.invoke('power:setPlaybackActive', active) as Promise<void>
  },
  subtitles: {
    pickFile: () =>
      ipcRenderer.invoke('subtitles:pickFile') as Promise<{
        name: string
        bytes: Uint8Array
      } | null>
  },
  externalPlayer: {
    list: () =>
      ipcRenderer.invoke('externalPlayer:list') as Promise<
        Array<{ id: 'vlc' | 'iina' | 'mpv'; name: string }>
      >,
    open: (id: 'vlc' | 'iina' | 'mpv', url: string, positionSec: number) =>
      ipcRenderer.invoke('externalPlayer:open', id, url, positionSec) as Promise<void>
  },
  embed: {
    resolveStream: (embedUrl: string, options?: { referer?: string; strict?: boolean }) =>
      ipcRenderer.invoke('embed:resolveStream', embedUrl, options) as Promise<string>
  },
  fights: {
    kalshiGet: (path: string) => ipcRenderer.invoke('fights:kalshiGet', path) as Promise<unknown>,
    listStreams: (input: unknown) =>
      ipcRenderer.invoke('fights:listStreams', input) as Promise<unknown[]>
  },
  imdb: {
    discoverLists: (imdbUserId: string) =>
      ipcRenderer.invoke('imdb:discoverLists', imdbUserId) as Promise<string[] | null>
  },
  web: {
    // Rows arrive server by server as chunk events tagged with this call's id;
    // the invoke resolves with the complete list once every server has answered.
    listStreams: (input: unknown, onChunk?: (rows: unknown[]) => void) => {
      const requestId = Math.random().toString(36).slice(2)
      const listener = (_e: unknown, id: string, rows: unknown[]): void => {
        if (id === requestId) onChunk?.(rows)
      }
      ipcRenderer.on('web:streamsChunk', listener)
      return ipcRenderer
        .invoke('web:listStreams', input, requestId)
        .finally(() => ipcRenderer.removeListener('web:streamsChunk', listener))
    }
  },
  onOpenUrl: (cb: (route: string) => void): (() => void) => {
    const listener = (_e: unknown, route: string): void => cb(route)
    ipcRenderer.on('app:open-url', listener)
    return () => ipcRenderer.removeListener('app:open-url', listener)
  },
  onAuthCode: (cb: (code: string) => void): (() => void) => {
    const listener = (_e: unknown, code: string): void => cb(code)
    ipcRenderer.on('auth:code', listener)
    return () => ipcRenderer.removeListener('auth:code', listener)
  },
  signalMainReady: (): void => {
    ipcRenderer.send('main:ready')
  },
  getAppVersion: () => ipcRenderer.invoke('updater:getVersion') as Promise<string>
} as unknown as VesperApi

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
