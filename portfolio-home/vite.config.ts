/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  // Absolute in production so deep links like /projects/ekatra load their assets. The
  // preview build overrides it with VITE_BASE=./ because it is served from a subpath.
  base: process.env.VITE_BASE ?? '/',
  plugins: [react()],
  test: { environment: 'node' },
})
