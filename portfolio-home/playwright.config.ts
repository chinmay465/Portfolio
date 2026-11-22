import { defineConfig, devices } from '@playwright/test'

const PORT = 4179

/**
 * End-to-end tests run against the production build served by `vite preview`, so
 * run `npm run build` first. `vite preview` falls back to index.html for unknown
 * paths, the same way the Render rewrite does, so deep links behave as they do live.
 */
export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    // Headings decode from noise; reduced motion renders the final text straight away.
    reducedMotion: 'reduce',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `npx vite preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
  },
})
