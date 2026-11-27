/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// The dev server (5173) proxies /api to the Express backend (3000). In production
// Express serves the built `dist/` itself.
export default defineConfig({
  base: '/',
  plugins: [react()],
  server: {
    proxy: {
      '/api': { target: 'http://localhost:3000', changeOrigin: true },
    },
  },
  test: { environment: 'node', include: ['shared/**/*.test.ts', 'server/**/*.test.ts', 'scanner/**/*.test.ts', 'src/**/*.test.ts'] },
})
