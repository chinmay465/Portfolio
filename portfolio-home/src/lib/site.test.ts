// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import sitemap from '../../public/sitemap.xml?raw'
import robots from '../../public/robots.txt?raw'
import indexHtml from '../../index.html?raw'
import ogImage from '../../public/og-image.png?inline'
import { projects } from '../data/projects'
import { routes } from '../router'

const ORIGIN = 'https://chinmay-upare.onrender.com'

/** Every public path the router serves: static pages plus one per project. */
function sitePaths(): string[] {
  const children = routes[0].children ?? []
  const paths: string[] = []
  for (const r of children) {
    if (r.index) paths.push('/')
    else if (r.path === 'projects/:id') paths.push(...projects.map((p) => `/projects/${p.id}`))
    else if (r.path && r.path !== '*') paths.push(`/${r.path}`)
  }
  return paths
}

const locs = () => [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1])

describe('sitemap.xml', () => {
  it('lists every route and project page, and nothing else', () => {
    const expected = sitePaths().map((p) => ORIGIN + (p === '/' ? '/' : p))
    expect([...locs()].sort()).toEqual([...expected].sort())
  })
  it('has no duplicates and uses the sitemaps.org namespace', () => {
    expect(new Set(locs()).size).toBe(locs().length)
    expect(sitemap).toContain('xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"')
    expect(sitemap.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true)
  })
  it('is linked from robots.txt', () => {
    expect(robots).toContain(`Sitemap: ${ORIGIN}/sitemap.xml`)
  })
})

describe('link preview', () => {
  const doc = new DOMParser().parseFromString(indexHtml, 'text/html')
  const meta = (key: string) =>
    doc.querySelector<HTMLMetaElement>(`meta[property="${key}"], meta[name="${key}"]`)?.content

  it('points og:image and twitter:image at the PNG by absolute URL', () => {
    expect(meta('og:image')).toBe(`${ORIGIN}/og-image.png`)
    expect(meta('twitter:image')).toBe(`${ORIGIN}/og-image.png`)
    expect(meta('og:image:width')).toBe('1200')
    expect(meta('og:image:height')).toBe('630')
    expect(meta('og:image:alt')).toBeTruthy()
  })
  it('asks for the large card', () => {
    expect(meta('twitter:card')).toBe('summary_large_image')
    expect(meta('og:type')).toBe('website')
    expect(meta('og:url')).toBe(`${ORIGIN}/`)
    expect(meta('og:title')).toBeTruthy()
    expect(meta('og:description')).toBeTruthy()
  })
  it('ships an image that really is 1200×630 and small enough for WhatsApp', () => {
    const bytes = Uint8Array.from(atob(ogImage.split(',')[1]), (c) => c.charCodeAt(0))
    expect([...bytes.slice(1, 4)].map((b) => String.fromCharCode(b)).join('')).toBe('PNG')
    const view = new DataView(bytes.buffer)
    expect(view.getUint32(16)).toBe(1200)
    expect(view.getUint32(20)).toBe(630)
    expect(bytes.length).toBeLessThan(300 * 1024)
  })
})
