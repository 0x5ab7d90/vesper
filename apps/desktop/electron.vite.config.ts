import { resolve } from 'path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { tanstackRouter } from '@tanstack/router-plugin/vite'
import mdx from '@mdx-js/rollup'

export default defineConfig({
  main: {},
  preload: {
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/preload/index.ts'),
          splash: resolve(__dirname, 'src/preload/splash.ts')
        }
      }
    }
  },
  renderer: {
    envDir: resolve(__dirname, '../..'),
    resolve: {
      alias: {
        '@renderer': resolve(__dirname, 'src/renderer/src'),
        '@convex': resolve(__dirname, '../../convex')
      }
    },
    plugins: [
      { enforce: 'pre', ...mdx({ jsxImportSource: 'react' }) },
      tanstackRouter({
        target: 'react',
        autoCodeSplitting: true,
        routesDirectory: resolve('src/renderer/src/routes'),
        generatedRouteTree: resolve('src/renderer/src/routeTree.gen.ts')
      }),
      react({ include: /\.(jsx|js|mdx|md|tsx|ts)$/ }),
      tailwindcss()
    ],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/renderer/index.html'),
          splash: resolve(__dirname, 'src/renderer/splash.html'),
          'mascot-lab': resolve(__dirname, 'src/renderer/mascot-lab.html')
        }
      }
    }
  }
})
