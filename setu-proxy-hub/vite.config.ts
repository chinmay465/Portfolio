/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Dev: the Vite server (5174) proxies /api to the Express backend (3001).
// Production: Express serves dist/ itself.
export default defineConfig({
  base: './',
  plugins: [react()],
  server: {
    port: 5174,
    proxy: { '/api': { target: 'http://localhost:3001', changeOrigin: true } },
  },
  test: { environment: 'node', testTimeout: 15000 },
})
