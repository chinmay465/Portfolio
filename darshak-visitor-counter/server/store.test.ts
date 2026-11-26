import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { openDb } from './db.ts'
import type { Db } from './db.ts'
import { VisitorStore } from './store.ts'

const A = '3f2b8c1e-6d4a-4b7e-9c2f-1a2b3c4d5e6f'
const B = '7a1d2e3f-4b5c-4d6e-8f70-819203a4b5c6'
const C = 'c0ffee00-1111-4222-8333-444455556666'

let db: Db
let store: VisitorStore

beforeAll(async () => {
  db = await openDb(undefined, 'memory://')
  store = new VisitorStore(db)
  await store.migrate()
})
afterAll(() => db.close())

describe('VisitorStore', () => {
  it('keeps one row per visitor however many times the same id comes back', async () => {
    const day1 = new Date('2026-11-20T06:00:00Z')
    expect(await store.record({ id: A, path: '/', referrer: 'linkedin.com', device: 'mobile' }, day1)).toBe(true)
    expect(await store.record({ id: A, path: '/projects', referrer: null, device: 'mobile' }, day1)).toBe(false)
    expect(await store.record({ id: A, path: '/about', referrer: null, device: 'mobile' }, new Date('2026-11-25T06:00:00Z'))).toBe(false)

    const { rows } = await db.query<{ n: number; sessions: number; landing_path: string }>(
      'SELECT count(*) OVER ()::int AS n, sessions, landing_path FROM visitors',
    )
    expect(rows).toEqual([{ n: 1, sessions: 3, landing_path: '/' }])
  })

  it('counts unique visitors by IST day', async () => {
    // 20:00 UTC on the 25th is 01:30 IST on the 26th.
    await store.record({ id: B, path: '/projects/rail', referrer: null, device: 'desktop' }, new Date('2026-11-25T20:00:00Z'))
    await store.record({ id: C, path: '/', referrer: 'google.com', device: 'desktop' }, new Date('2026-11-26T03:00:00Z'))

    const s = await store.stats(7, new Date('2026-11-26T04:00:00Z'))
    expect(s).toMatchObject({ storage: 'pglite', total: 3, today: 2, last7: 3, last30: 3, returning: 1, days: 7 })
    expect(s.daily).toHaveLength(7)
    expect(s.daily.at(-1)).toEqual({ date: '2026-11-26', visitors: 2 })
    expect(s.daily.find((d) => d.date === '2026-11-20')).toEqual({ date: '2026-11-20', visitors: 1 })
    expect(s.pages[0]).toEqual({ label: '/', visitors: 2 })
    expect(s.referrers).toContainEqual({ label: 'Direct', visitors: 1 })
    expect(s.devices).toEqual([
      { label: 'desktop', visitors: 2 },
      { label: 'mobile', visitors: 1 },
    ])
  })
})
