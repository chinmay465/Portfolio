import { afterEach, describe, expect, it, vi } from 'vitest'
import { authorise, loadPool, mapGenres, mapProviderList, mergeTitles, rankPopularity, toTitle } from './tmdb.ts'

describe('TMDB mapping', () => {
  it('maps genre ids, merging TV combo genres', () => {
    expect(mapGenres([80, 18])).toEqual(['Crime', 'Drama'])
    expect(mapGenres([10765, 878])).toEqual(['Sci-Fi', 'Fantasy'])
    expect(mapGenres([99, 10764])).toEqual([])
  })

  it('maps India provider names to our services', () => {
    const ids = mapProviderList([
      { provider_id: 8, provider_name: 'Netflix' },
      { provider_id: 119, provider_name: 'Amazon Prime Video' },
      { provider_id: 122, provider_name: 'JioHotstar' },
      { provider_id: 237, provider_name: 'Sony Liv' },
      { provider_id: 232, provider_name: 'Zee5' },
      { provider_id: 1796, provider_name: 'Netflix basic with Ads' },
    ])
    expect(ids).toEqual({ netflix: [8], prime: [119], jiohotstar: [122], sonyliv: [237], zee5: [232] })
  })

  it('normalises a TV result', () => {
    const t = toTitle(
      {
        id: 42,
        name: 'Panchayat',
        first_air_date: '2020-04-03',
        genre_ids: [35, 18],
        original_language: 'hi',
        vote_average: 8.9,
        backdrop_path: '/b.jpg',
      },
      'tv',
      ['prime'],
    )
    expect(t).toMatchObject({
      id: 'tmdb:tv:42',
      kind: 'series',
      year: 2020,
      genres: ['Comedy', 'Drama'],
      providers: ['prime'],
      poster: 'https://image.tmdb.org/t/p/w780/b.jpg',
      watchLink: 'https://www.themoviedb.org/tv/42/watch?locale=IN',
    })
  })

  it('sends a v4 token as Bearer and a v3 key as a query param', () => {
    const u1 = new URL('https://api.themoviedb.org/3/x')
    expect(authorise('eyJabc.def', u1)).toMatchObject({ Authorization: 'Bearer eyJabc.def' })
    expect(u1.searchParams.has('api_key')).toBe(false)
    const u2 = new URL('https://api.themoviedb.org/3/x')
    authorise('0123abcd', u2)
    expect(u2.searchParams.get('api_key')).toBe('0123abcd')
  })

  it('merges a title found on two services and ranks popularity 0–1', () => {
    const a = toTitle({ id: 1, title: 'A', popularity: 50 }, 'movie', ['netflix'])
    const b = toTitle({ id: 1, title: 'A', popularity: 50 }, 'movie', ['prime'])
    const c = toTitle({ id: 2, title: 'C', popularity: 10 }, 'movie', ['prime'])
    const merged = rankPopularity(mergeTitles([a, b, c]))
    expect(merged.find((t) => t.id === 'tmdb:movie:1')).toMatchObject({ providers: ['netflix', 'prime'], popularity: 1 })
    expect(merged.find((t) => t.id === 'tmdb:movie:2')?.popularity).toBe(0)
  })
})

describe('loadPool', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('discovers each chosen service for films and series and tags results with the service', async () => {
    const calls: string[] = []
    vi.stubGlobal('fetch', async (url: URL) => {
      calls.push(url.pathname + url.search)
      const body = url.pathname.includes('/watch/providers/')
        ? { results: [{ provider_id: 8, provider_name: 'Netflix' }] }
        : { results: [{ id: url.pathname.endsWith('/tv') ? 7 : 9, name: 'X', title: 'X', popularity: 1 }] }
      return new Response(JSON.stringify(body), { status: 200 })
    })
    const pool = await loadPool('eyJtoken', ['netflix', 'zee5'], 1)
    expect(pool.map((t) => t.id).sort()).toEqual(['tmdb:movie:9', 'tmdb:tv:7'])
    expect(pool.every((t) => t.providers.includes('netflix'))).toBe(true)
    const discover = calls.filter((c) => c.includes('/discover/'))
    expect(discover).toHaveLength(2)
    expect(discover[0]).toContain('with_watch_providers=8')
    expect(discover[0]).toContain('watch_region=IN')
  })

  it('reports a bad key clearly', async () => {
    vi.stubGlobal('fetch', async () => new Response('{}', { status: 401 }))
    await expect(loadPool('bad', ['netflix'])).rejects.toThrow('TMDB rejected the API key.')
  })
})
