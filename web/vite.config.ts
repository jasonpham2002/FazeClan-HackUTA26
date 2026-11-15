import { rmSync } from 'node:fs'
import { resolve } from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import type { Plugin } from 'vite'
import { defineConfig } from 'vitest/config'

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

const apiTarget = 'http://127.0.0.1:3001'
const apiPaths = ['/api', '/health', '/players', '/events', '/me', '/admin', '/applications', '/predictions', '/rewards', '/esports']
/** These prefixes are both API routes and website pages. A browser navigation must stay on the site. */
const pagePaths = new Set(['/players', '/events', '/admin', '/applications', '/rewards'])

function apiProxy(path: string) {
  return {
    target: apiTarget,
    bypass(req: { headers: { accept?: string | string[] }; url?: string }) {
      const accept = req.headers.accept
      const header = Array.isArray(accept) ? accept.join(',') : accept ?? ''
      if (pagePaths.has(path) && header.includes('text/html')) return req.url
    },
  }
}

/** Send www to the apex so the sign-in cookie and the page share one host. */
function canonicalHost(): Plugin {
  return {
    name: 'canonical-host',
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => {
        const host = req.headers.host?.split(':')[0]
        if (host === 'www.manilovefaze.club') {
          res.statusCode = 308
          res.setHeader('Location', `http://manilovefaze.club${req.url ?? '/'}`)
          res.end()
          return
        }
        next()
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), excludePrivatePortraits(), canonicalHost()],
  preview: {
    allowedHosts: ['manilovefaze.club', 'www.manilovefaze.club', '104.238.146.107'],
    proxy: Object.fromEntries(apiPaths.map(path => [path, apiProxy(path)])),
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
