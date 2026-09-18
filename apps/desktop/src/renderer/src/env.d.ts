/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_TMDB_API_KEY: string
  readonly VITE_TMDB_API_KEYS?: string
  readonly VITE_TMDB_IMAGE_BASE: string
  readonly VITE_TMDB_API_BASE: string
  readonly VITE_FANART_API_KEY: string
  readonly VITE_FANART_API_BASE: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

declare module 'virtual:ort-loader' {
  const source: string
  export default source
}

declare module '*.mdx' {
  import type { ComponentType } from 'react'
  const Component: ComponentType<{ components?: Record<string, unknown> }>
  export default Component
}
