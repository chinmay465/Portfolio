/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// The dev server (5173) proxies API + calls to the Express backend (3000).
// In production the Express server serves the built `dist/` itself, so no proxy
// is involved.
export default defineConfig({
  base: './',
  plugins: [react()],
  server: {
    proxy: {
      '/api': { target: 'http://localhost:3000', changeOrigin: true },
    },
  },
  test: { environment: 'node' },
})
