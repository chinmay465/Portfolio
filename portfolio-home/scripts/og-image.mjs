// Renders scripts/og-image.html to public/og-image.png at exactly 1200×630, the size
// LinkedIn, WhatsApp and X use for large link previews. Run with `npm run og-image`
// after changing the HTML, and commit the PNG.
import { chromium } from '@playwright/test'
import { fileURLToPath } from 'node:url'

const source = new URL('./og-image.html', import.meta.url)
const out = fileURLToPath(new URL('../public/og-image.png', import.meta.url))

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 })
await page.goto(source.href)
await page.evaluate(() => document.fonts.ready)
await page.screenshot({ path: out, type: 'png' })
await browser.close()
console.log(`wrote ${out}`)
