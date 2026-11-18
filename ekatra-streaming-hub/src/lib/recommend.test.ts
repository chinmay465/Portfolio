import { describe, expect, it } from 'vitest'
import { DEMO_CATALOG } from '../data/catalog.ts'
import { EMPTY_SIGNALS, type Signals } from '../types.ts'
import { buildProfile, cosine, recommend, similarTo, vectorize } from './recommend.ts'

const byId = (slug: string) => DEMO_CATALOG.find((t) => t.id === `demo:${slug}`)!
const signals = (s: Partial<Signals>): Signals => ({ ...EMPTY_SIGNALS, ...s })

describe('catalog', () => {
  it('has unique ids and at least one provider per title', () => {
    expect(new Set(DEMO_CATALOG.map((t) => t.id)).size).toBe(DEMO_CATALOG.length)
    for (const t of DEMO_CATALOG) expect(t.providers.length).toBeGreaterThan(0)
  })
})

describe('similarity', () => {
  it('scores a title as identical to itself', () => {
    const v = vectorize(byId('panchayat'))
    expect(cosine(v, v)).toBeCloseTo(1)
  })

  it('finds Gullak closer to Panchayat than to Squid Game', () => {
    const p = vectorize(byId('panchayat'))
    expect(cosine(p, vectorize(byId('gullak')))).toBeGreaterThan(cosine(p, vectorize(byId('squid-game'))))
  })

  it('recommends across services, not just the seed’s own', () => {
    const similar = similarTo(byId('scam-1992'), DEMO_CATALOG, [])
    expect(new Set(similar.slice(0, 6).flatMap((t) => t.providers)).size).toBeGreaterThan(1)
  })
})

describe('recommend', () => {
  it('cold-starts on popularity and explains it as popular', () => {
    const feed = recommend(DEMO_CATALOG, EMPTY_SIGNALS, [])
    expect(feed.length).toBeGreaterThan(10)
    expect(feed.every((p) => p.reason.type === 'popular')).toBe(true)
  })

  it('only shows titles on the chosen services', () => {
    const feed = recommend(DEMO_CATALOG, EMPTY_SIGNALS, ['sonyliv', 'zee5'])
    expect(feed.every((p) => p.title.providers.some((x) => x === 'sonyliv' || x === 'zee5'))).toBe(true)
  })

  it('hides titles the user already reacted to', () => {
    const s = signals({ liked: ['demo:mirzapur'], disliked: ['demo:the-crown'], watched: { 'demo:dark': 3 } })
    const ids = recommend(DEMO_CATALOG, s, []).map((p) => p.title.id)
    expect(ids).not.toContain('demo:mirzapur')
    expect(ids).not.toContain('demo:the-crown')
    expect(ids).not.toContain('demo:dark')
  })

  it('moves gangster dramas up after liking Mirzapur, with a reason that names it', () => {
    const s = signals({ liked: ['demo:mirzapur'] })
    const feed = recommend(DEMO_CATALOG, s, [])
    const rangbaaz = feed.findIndex((p) => p.title.id === 'demo:rangbaaz')
    const crown = feed.findIndex((p) => p.title.id === 'demo:the-crown')
    expect(rangbaaz).toBeGreaterThanOrEqual(0)
    expect(rangbaaz).toBeLessThan(crown === -1 ? Infinity : crown)
    const pick = feed[rangbaaz]
    expect(pick.reason.type).toBe('liked')
    if (pick.reason.type === 'liked') expect(pick.reason.seed.name).toBe('Mirzapur')
  })

  it('a dislike pushes similar titles down', () => {
    const neutral = recommend(DEMO_CATALOG, signals({ liked: ['demo:panchayat'] }), [], {}, 100)
    const withDislike = recommend(
      DEMO_CATALOG,
      signals({ liked: ['demo:panchayat'], disliked: ['demo:stranger-things'] }),
      [],
      {},
      100,
    )
    const pos = (feed: typeof neutral) => feed.findIndex((p) => p.title.id === 'demo:dark')
    expect(pos(withDislike)).toBeGreaterThan(pos(neutral))
  })

  it('filters by kind and genre', () => {
    const films = recommend(DEMO_CATALOG, EMPTY_SIGNALS, [], { kind: 'film' })
    expect(films.length).toBeGreaterThan(0)
    expect(films.every((p) => p.title.kind === 'film')).toBe(true)
    const comedy = recommend(DEMO_CATALOG, EMPTY_SIGNALS, [], { genre: 'Comedy' })
    expect(comedy.every((p) => p.title.genres.includes('Comedy'))).toBe(true)
  })

  it('does not put four titles from one service in a row when others are close', () => {
    const feed = recommend(DEMO_CATALOG, EMPTY_SIGNALS, [])
    for (let i = 0; i + 3 < 12; i++) {
      const run = feed.slice(i, i + 4).map((p) => p.title.providers[0])
      expect(new Set(run).size).toBeGreaterThan(1)
    }
  })

  it('ignores disliked titles when building the taste profile', () => {
    const profile = buildProfile(DEMO_CATALOG, signals({ disliked: ['demo:the-crown'] }))
    expect(profile.size).toBe(0)
  })
})
