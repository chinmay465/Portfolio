import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from './app.ts'
import { openDb } from './db.ts'
import type { Db } from './db.ts'
import { VisitorStore } from './store.ts'

const CHROME = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36'
const SITE = 'https://chinmay-upare.onrender.com'
const ID = '3f2b8c1e-6d4a-4b7e-9c2f-1a2b3c4d5e6f'

let db: Db
let server: Server
let base: string

beforeAll(async () => {
  db = await openDb(undefined, 'memory://')
  const store = new VisitorStore(db)
  await store.migrate()
  server = createApp({ status: { state: 'ready', storage: 'pglite', store }, statsToken: 'secret', allowedOrigins: [SITE], rateLimit: 5 }).listen(0)
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})
afterAll(async () => {
  server.close()
  await db.close()
})

function visit(body: unknown, headers: Record<string, string> = {}) {
  return fetch(`${base}/api/visit`, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain', 'User-Agent': CHROME, Origin: SITE, ...headers },
    body: JSON.stringify(body),
  })
}

describe('API', () => {
  it('records a visitor once and answers with CORS for the site', async () => {
    const first = await visit({ id: ID, path: '/', referrer: 'https://www.linkedin.com/feed' })
    expect(first.headers.get('access-control-allow-origin')).toBe(SITE)
    expect(await first.json()).toEqual({ counted: true, new: true })
    expect(await (await visit({ id: ID, path: '/about' })).json()).toEqual({ counted: true, new: false })
  })

  it('rejects other origins, bad ids and bots', async () => {
    expect((await visit({ id: ID }, { Origin: 'https://evil.example' })).status).toBe(403)
    expect((await visit({ id: 'not-a-uuid' })).status).toBe(400)
    expect(await (await visit({ id: ID }, { 'User-Agent': 'Googlebot/2.1' })).json()).toMatchObject({ counted: false })
  })

  it('needs the token for stats', async () => {
    expect((await fetch(`${base}/api/stats`)).status).toBe(401)
    expect((await fetch(`${base}/api/stats`, { headers: { Authorization: 'Bearer wrong' } })).status).toBe(401)
    const res = await fetch(`${base}/api/stats?days=7`, { headers: { Authorization: 'Bearer secret' } })
    expect(await res.json()).toMatchObject({ total: 1, today: 1, returning: 1, referrers: [{ label: 'linkedin.com', visitors: 1 }] })
  })

  it('rate-limits visits per IP', async () => {
    const statuses = []
    for (let i = 0; i < 4; i++) statuses.push((await visit({ id: ID })).status)
    expect(statuses.at(-1)).toBe(429)
  })
})

describe('open dashboard (no STATS_TOKEN)', () => {
  it('serves stats and config without a token', async () => {
    const openDbConn = await openDb(undefined, 'memory://')
    const store = new VisitorStore(openDbConn)
    await store.migrate()
    const open = createApp({ status: { state: 'ready', storage: 'pglite', store }, statsToken: '', allowedOrigins: [SITE] }).listen(0)
    const url = `http://127.0.0.1:${(open.address() as AddressInfo).port}`
    try {
      expect(await (await fetch(`${url}/api/config`)).json()).toEqual({ needsToken: false })
      const res = await fetch(`${url}/api/stats`)
      expect(res.status).toBe(200)
      expect(await res.json()).toMatchObject({ total: 0 })
    } finally {
      open.close()
      await openDbConn.close()
    }
  })
})

describe('database not ready', () => {
  it('stays up, reports the error and refuses visits with 503', async () => {
    const down = createApp({
      status: { state: 'error', storage: 'postgres', store: null, error: 'ECONNREFUSED: connect failed' },
      statsToken: '',
      allowedOrigins: [],
    }).listen(0)
    const url = `http://127.0.0.1:${(down.address() as AddressInfo).port}`
    try {
      expect(await (await fetch(`${url}/api/health`)).json()).toEqual({
        ok: true,
        database: 'error',
        storage: 'postgres',
        error: 'ECONNREFUSED: connect failed',
      })
      const res = await fetch(`${url}/api/visit`, {
        method: 'POST',
        headers: { 'User-Agent': CHROME },
        body: JSON.stringify({ id: ID }),
      })
      expect(res.status).toBe(503)
    } finally {
      down.close()
    }
  })
})
