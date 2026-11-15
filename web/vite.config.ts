import { rmSync } from 'node:fs'
import { resolve } from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import type { Plugin } from 'vite'
import { defineConfig } from 'vitest/config'

const previewApi = 'http://127.0.0.1:3001'

/**
 * public/players/private holds third-party test portraits that are not cleared
 * for publishing. The dev server serves them; a production build must not ship
 * them, so they are removed from the output after every build.
 */
function excludePrivatePortraits(): Plugin {
  let outDir = 'dist'
  return {
    name: 'exclude-private-portraits',
    apply: 'build',
    configResolved(config) { outDir = resolve(config.root, config.build.outDir) },
    closeBundle() { rmSync(resolve(outDir, 'players/private'), { recursive: true, force: true }) },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), excludePrivatePortraits()],
  preview: {
    proxy: {
      // Better Auth already mounts under /api/auth on the backend.
      '/api/auth/': previewApi,
      '/api/': {
        target: previewApi,
        rewrite: path => path.slice('/api'.length),
      },
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
