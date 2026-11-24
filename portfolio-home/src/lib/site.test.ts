// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import sitemap from '../../public/sitemap.xml?raw'
import robots from '../../public/robots.txt?raw'
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
