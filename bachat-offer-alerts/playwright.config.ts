import { defineConfig, devices } from '@playwright/test'

const PORT = 4191

/**
 * End-to-end tests against the real server (run `npm run build` first) with the
 * fixture sources (BACHAT_FIXTURES=1) and an in-memory database, so no network is needed.
 */
export default defineConfig({
  testDir: 'e2e',
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: { baseURL: `http://localhost:${PORT}`, reducedMotion: 'reduce', trace: 'on-first-retry' },
  projects: [{ name: 'phone', use: { ...devices['Pixel 7'] } }],
  webServer: {
    command: 'npx tsx server/index.ts',
    url: `http://localhost:${PORT}/api/health`,
    env: { PORT: String(PORT), BACHAT_FIXTURES: '1', BACHAT_DATA_DIR: 'memory://', BACHAT_SCAN_MINUTES: '0' },
    reuseExistingServer: false,
  },
})
