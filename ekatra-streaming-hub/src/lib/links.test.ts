import { describe, expect, it } from 'vitest'
import { DEMO_CATALOG } from '../data/catalog.ts'
import type { Title } from '../types.ts'
import { openLinks, whereToWatch } from './links.ts'

const base: Title = {
  id: 'demo:x',
  name: 'Scam 1992: The Harshad Mehta Story',
  kind: 'series',
  year: 2020,
  genres: ['Drama'],
  language: 'hi',
  providers: ['sonyliv'],
  overview: '',
  popularity: 1,
}
const byId = (slug: string) => DEMO_CATALOG.find((t) => t.id === `demo:${slug}`)!

describe('openLinks', () => {
  it('opens Netflix titles on their own title page', () => {
    expect(openLinks(byId('sacred-games'))).toEqual([
      { provider: 'netflix', label: 'Open in Netflix', href: 'https://www.netflix.com/title/80115328' },
    ])
  })

  it('sends JioHotstar titles to JustWatch India, which hands off to the exact title', () => {
    expect(openLinks(byId('shogun'))).toEqual([
      {
        provider: 'jiohotstar',
        label: 'Open in JioHotstar',
        href: 'https://www.justwatch.com/in/tv-show/shogun-2024',
        via: 'JustWatch',
      },
    ])
  })

  it('gives every Netflix and JioHotstar demo title a title link', () => {
    const missing = DEMO_CATALOG.filter(
      (t) => (t.providers.includes('netflix') || t.providers.includes('jiohotstar')) && !t.links,
    ).map((t) => t.name)
    expect(missing).toEqual([])
  })

  it('uses Prime Video search', () => {
    expect(openLinks({ ...base, providers: ['prime'], name: 'Panchayat' })[0]).toEqual({
      provider: 'prime',
      label: 'Open in Prime Video',
      href: 'https://www.primevideo.com/search?phrase=Panchayat',
    })
  })

  it('falls back to TMDB’s watch page in live mode, else a JustWatch search', () => {
    const live = { ...base, providers: ['netflix' as const], watchLink: 'https://www.themoviedb.org/tv/1/watch?locale=IN' }
    expect(openLinks(live)[0]).toMatchObject({ label: 'Find on Netflix', href: live.watchLink, via: 'TMDB' })
    expect(openLinks(base)[0]).toMatchObject({
      label: 'Find on SonyLIV',
      href: 'https://www.justwatch.com/in/search?q=Scam%201992%3A%20The%20Harshad%20Mehta%20Story',
      via: 'JustWatch',
    })
  })

  it('puts subscribed services first', () => {
    const t = { ...base, providers: ['sonyliv' as const, 'prime' as const] }
    expect(openLinks(t, ['prime']).map((l) => l.provider)).toEqual(['prime', 'sonyliv'])
  })
})

describe('whereToWatch', () => {
  it('prefers TMDB’s page and falls back to JustWatch search', () => {
    expect(whereToWatch({ ...base, watchLink: 'https://www.themoviedb.org/tv/1/watch?locale=IN' })).toBe(
      'https://www.themoviedb.org/tv/1/watch?locale=IN',
    )
    expect(whereToWatch(base)).toBe('https://www.justwatch.com/in/search?q=Scam%201992%3A%20The%20Harshad%20Mehta%20Story')
  })
})
