import { expect, test } from './fixtures.ts'

const ORIGIN = 'https://chinmay-upare.onrender.com'

// Crawlers fetch these as files, so the build must serve them as-is rather than
// falling back to index.html the way app routes do.
test('the build serves sitemap.xml, robots.txt and the preview image as real files', async ({ request }) => {
  const sitemap = await request.get('/sitemap.xml')
  expect(sitemap.ok()).toBe(true)
  const xml = await sitemap.text()
  expect(xml).toContain('<urlset')
  expect(xml).not.toContain('<div id="root">')

  const robots = await request.get('/robots.txt')
  expect(await robots.text()).toContain(`Sitemap: ${ORIGIN}/sitemap.xml`)

  const image = await request.get('/og-image.png')
  expect(image.ok()).toBe(true)
  expect(image.headers()['content-type']).toBe('image/png')
  const png = await image.body()
  expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([1200, 630])
})

test('every page carries the link preview tags', async ({ page }) => {
  await page.goto('/projects/ekatra')
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute('content', `${ORIGIN}/og-image.png`)
  await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute('content', 'summary_large_image')
})
