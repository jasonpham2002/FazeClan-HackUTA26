import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

const previewApi = 'http://127.0.0.1:3001'

export default defineConfig({
  plugins: [react(), tailwindcss()],
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
