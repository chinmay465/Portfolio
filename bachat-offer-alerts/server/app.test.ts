import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { fixtureFetch } from '../scanner/fetch.ts'
import { runScan, sourcesFor } from '../scanner/scan.ts'
import { DEFAULT_SETTINGS, normalizeSettings } from '../shared/types.ts'
import { createApp, isPushEndpoint } from './app.ts'
import type { AppState } from './app.ts'
import { openDb } from './db.ts'
import type { Db } from './db.ts'
import type { PushPayload, PushSender } from './push.ts'
import { vapidKeys } from './push.ts'
import { Store } from './store.ts'

const sent: { sub: string; payload: PushPayload }[] = []
const fakePush: PushSender = {
  publicKey: 'test-key',
  async send(sub, payload) {
    sent.push({ sub: sub.id, payload })
    return sub.endpoint.includes('gone') ? 'gone' : 'ok'
  },
}

let db: Db
let store: Store
let server: Server
let base: string

beforeAll(async () => {
  db = await openDb(undefined, 'memory://')
  store = new Store(db)
  await store.migrate()
  const status: AppState = { state: 'ready', storage: 'pglite', store, push: fakePush }
  server = createApp({ status, fetchText: fixtureFetch, scanCooldown: 0 }).listen(0)
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
}, 60_000)

afterAll(async () => {
  server?.close()
  await db?.close()
})

const api = (p: string, init: RequestInit = {}) =>
  fetch(base + p, { ...init, headers: { 'Content-Type': 'application/json', ...init.headers } })
// oxlint-disable-next-line no-explicit-any
const j = async (r: Response | Promise<Response>): Promise<any> => (await r).json()
const subscription = (name: string) => ({ endpoint: `https://fcm.googleapis.com/fcm/send/${name}`, keys: { p256dh: 'p', auth: 'a' } })

describe('Bachat server', () => {
  it('only accepts browser push endpoints', () => {
    expect(isPushEndpoint('https://fcm.googleapis.com/fcm/send/abc')).toBe(true)
    expect(isPushEndpoint('https://web.push.apple.com/QK')).toBe(true)
    expect(isPushEndpoint('https://evil.example/fcm.googleapis.com')).toBe(false)
    expect(isPushEndpoint('http://fcm.googleapis.com/x')).toBe(false)
  })

  it('keeps one set of VAPID keys', async () => {
    const a = await vapidKeys(store)
    const b = await vapidKeys(store)
    expect(a.publicKey).toBe(b.publicKey)
    expect(a.publicKey.length).toBeGreaterThan(60)
  })

  it('subscribes, scans and alerts by the settings', async () => {
    const res = await api('/api/subscriptions', {
      method: 'POST',
      body: JSON.stringify({ subscription: subscription('one'), settings: { ...DEFAULT_SETTINGS, minDiscount: 50 }, tzOffset: -330 }),
    })
    expect(res.status).toBe(201)
    const { id, token } = await j(res)

    const scan = await j(api('/api/scan', { method: 'POST' }))
    expect(scan.summary.newDeals).toBe(7)
    const mine = sent.filter((s) => s.sub === id).map((s) => s.payload)
    // 96% Zepto, ₹1 Instamart and the Blinkit glitch are extraordinary; Bosch 58%, Zomato 75% pass 50%.
    expect(mine.map((p) => p.tier)).toEqual(['extraordinary', 'extraordinary', 'extraordinary', 'normal', 'normal'])
    expect(mine[0].title).toMatch(/^🚨/)
    expect(mine.some((p) => p.title.includes('23%'))).toBe(false)

    // Nothing is sent twice.
    const before = sent.length
    await api('/api/scan', { method: 'POST' })
    expect(sent.length).toBe(before)

    // Settings round-trip with the token, and not without it.
    expect((await api(`/api/subscriptions/${id}`)).status).toBe(401)
    const put = await api(`/api/subscriptions/${id}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ settings: { minDiscount: 20 } }),
    })
    expect((await j(put)).settings.minDiscount).toBe(20)

    // Lowering the bar picks up the 23% monitor on the next scan, but not the 5% Paytm offer.
    await api('/api/scan', { method: 'POST' })
    const after = sent.filter((s) => s.sub === id).map((s) => s.payload.title)
    expect(after.some((t) => t.includes('23% off'))).toBe(true)
    expect(after.some((t) => t.startsWith('5% off'))).toBe(false)
  })

  it('lists deals newest first with source health', async () => {
    const body = await j(api('/api/deals'))
    expect(body.deals.length).toBe(7)
    expect(body.sources.map((s: { name: string; lastError: string | null }) => [s.name, s.lastError])).toEqual([
      ['DesiDime', null],
      ['r/dealsforindia', null],
    ])
    const times = body.deals.map((d: { postedAt: string }) => d.postedAt)
    expect([...times].sort().reverse()).toEqual(times)
  })

  it('caps alerts per scan and sends one summary for the rest', async () => {
    const res = await api('/api/subscriptions', {
      method: 'POST',
      body: JSON.stringify({ subscription: subscription('many'), settings: { minDiscount: 0, includeNoDiscount: true, platforms: { other: true } } }),
    })
    const { id } = await j(res)
    await api('/api/scan', { method: 'POST' })
    const mine = sent.filter((s) => s.sub === id).map((s) => s.payload)
    expect(mine).toHaveLength(6)
    expect(mine[5]).toMatchObject({ tier: 'summary', title: '2 more offers match your alerts' })
  })

  it('drops subscriptions the push service says are gone', async () => {
    const res = await api('/api/subscriptions', { method: 'POST', body: JSON.stringify({ subscription: subscription('gone'), settings: {} }) })
    const { id } = await j(res)
    await api('/api/scan', { method: 'POST' })
    expect(await store.subscriber(id)).toBeNull()
  })

  it('adds subscribers\' own channels as sources, once each', () => {
    const subs = [{ settings: normalizeSettings({ channels: ['LootChannel', 'desidime'] }) }, { settings: normalizeSettings({ channels: ['lootchannel'] }) }]
    expect(sourcesFor(subs).map((s) => s.id)).toEqual(['tg:desidime', 'rss:dealsforindia', 'tg:lootchannel'])
  })

  it('reports a channel that is not public', async () => {
    const summary = await runScan(store, async () => '<html>nothing</html>', null)
    expect(summary.sources.every((s) => !s.ok)).toBe(true)
    expect(summary.sources[0].error).toMatch(/not a public channel|no title|nothing/)
  })
})
