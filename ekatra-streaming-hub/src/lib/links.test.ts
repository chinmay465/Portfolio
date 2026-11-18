import { describe, expect, it } from 'vitest'
import type { Title } from '../types.ts'
import { openLinks, whereToWatch } from './links.ts'

const title: Title = {
  id: 'demo:x',
  name: 'Scam 1992: The Harshad Mehta Story',
  kind: 'series',
  year: 2020,
  genres: ['Drama'],
  language: 'hi',
  providers: ['sonyliv', 'netflix'],
  overview: '',
  popularity: 1,
}

describe('openLinks', () => {
  it('searches services that support it and opens the home page otherwise', () => {
    const [netflix, sony] = openLinks(title, ['netflix'])
    expect(netflix).toEqual({
      provider: 'netflix',
      label: 'Open in Netflix',
      href: 'https://www.netflix.com/search?q=Scam%201992%3A%20The%20Harshad%20Mehta%20Story',
    })
    expect(sony).toEqual({ provider: 'sonyliv', label: 'Go to SonyLIV', href: 'https://www.sonyliv.com/' })
  })

  it('puts subscribed services first', () => {
    expect(openLinks(title, ['sonyliv']).map((l) => l.provider)).toEqual(['sonyliv', 'netflix'])
  })

  it('builds Prime Video search links', () => {
    expect(openLinks({ ...title, providers: ['prime'], name: 'Panchayat' })[0].href).toBe(
      'https://www.primevideo.com/search?phrase=Panchayat',
    )
  })
})

describe('whereToWatch', () => {
  it('prefers TMDB’s page and falls back to JustWatch search', () => {
    expect(whereToWatch({ ...title, watchLink: 'https://www.themoviedb.org/tv/1/watch?locale=IN' })).toBe(
      'https://www.themoviedb.org/tv/1/watch?locale=IN',
    )
    expect(whereToWatch(title)).toBe('https://www.justwatch.com/in/search?q=Scam%201992%3A%20The%20Harshad%20Mehta%20Story')
  })
})
