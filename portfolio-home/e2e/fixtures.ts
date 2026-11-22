import { test as base, expect } from '@playwright/test'

/**
 * Every test gets a page that stays on localhost (the status console's pings to the
 * live apps are aborted, so results never depend on Render) and fails on any
 * uncaught error thrown by the app.
 */
export const test = base.extend<{ errors: Error[] }>({
  errors: [
    async ({ page }, use) => {
      const errors: Error[] = []
      page.on('pageerror', (e) => errors.push(e))
      await page.route(
        (url) => url.hostname !== 'localhost',
        (route) => route.abort(),
      )
      await use(errors)
      expect(errors, 'uncaught errors on the page').toEqual([])
    },
    { auto: true },
  ],
})

export { expect }
