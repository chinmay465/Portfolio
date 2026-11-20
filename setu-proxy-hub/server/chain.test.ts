// End-to-end: real sockets on localhost. A tiny CONNECT proxy plays the role
// of a "free proxy", a local HTTP server plays the target site.
import http from 'node:http'
import net from 'node:net'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from './app.ts'
import { proxiedFetch } from './fetcher.ts'
import { ProxyPool } from './pool.ts'
import { TunnelServer } from './tunnelServer.ts'

const open = { allowHttp: true, allowPrivate: true }
const port = (s: net.Server) => (s.address() as AddressInfo).port
const listen = (s: net.Server) => new Promise<void>((r) => s.listen(0, '127.0.0.1', () => r()))

let connects = 0
let target: http.Server
let judge: http.Server
let upstream: http.Server
let deadPort: number

beforeAll(async () => {
  target = http.createServer((req, res) => {
    if (req.url === '/redirect') {
      res.writeHead(302, { Location: '/page' })
      return res.end()
    }
    if (req.url === '/blocked') {
      res.writeHead(429)
      return res.end('slow down')
    }
    res.writeHead(200, { 'Content-Type': 'text/html' })
    res.end(`<html><head><title>Target</title></head><body><p>hello via ${req.headers['user-agent']?.slice(0, 7)}</p></body></html>`)
  })
  judge = http.createServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end('{"ip":"198.51.100.7"}')
  })
  upstream = http.createServer()
  upstream.on('connect', (req: http.IncomingMessage, sock: net.Socket, head: Buffer) => {
    connects++
    const [h, p] = (req.url ?? '').split(':')
    const up = net.connect(Number(p), h, () => {
      sock.write('HTTP/1.1 200 Connection Established\r\n\r\n')
      if (head.length) up.write(head)
      up.pipe(sock)
      sock.pipe(up)
    })
    up.on('error', () => sock.destroy())
    sock.on('error', () => up.destroy())
  })
  await Promise.all([listen(target), listen(judge), listen(upstream)])
  const tmp = net.createServer()
  await listen(tmp)
  deadPort = port(tmp)
  await new Promise<void>((r) => tmp.close(() => r()))
})

afterAll(() => {
  target.close()
  judge.close()
  upstream.close()
})

function makePool() {
  return new ProxyPool({
    sources: [{ name: 'test', url: 'https://unused.test' }],
    judgeUrl: `http://127.0.0.1:${port(judge)}/`,
    directIp: null,
    checkTimeoutMs: 2000,
    refreshMs: 0,
    minAlive: 0,
    loadList: async () => [
      { host: '127.0.0.1', port: port(upstream) },
      { host: '127.0.0.1', port: deadPort },
    ],
  })
}

describe('proxy chain', () => {
  it('refresh keeps only proxies that pass the judge', async () => {
    const pool = makePool()
    await pool.refresh()
    const snap = pool.snapshot()
    expect(snap.alive).toBe(1)
    expect(snap.proxies[0].address).toBe(`127.0.0.1:${port(upstream)}`)
    expect(snap.proxies[0].exitIp).toBe('198.51.100.7')
    expect(snap.sources).toEqual([{ name: 'test', count: 2, error: null }])
  })

  it('drops transparent proxies that reveal our own IP', async () => {
    const pool = new ProxyPool({ ...makePool().opts, directIp: '198.51.100.7' })
    await pool.refresh()
    expect(pool.size).toBe(0)
  })

  it('never drops pinned (your own) proxies on refresh or failure', async () => {
    const pool = makePool()
    pool.seed([{ host: '127.0.0.1', port: deadPort }], 'manual', true)
    await pool.refresh()
    expect(pool.snapshot().proxies.map((p) => p.address)).toContain(`127.0.0.1:${deadPort}`)
    for (let i = 0; i < 4; i++) pool.reportFailure(`127.0.0.1:${deadPort}`, true)
    expect(pool.size).toBe(2)
  })

  it('fetches through a proxy, follows redirects, and rotates past dead proxies', async () => {
    const pool = makePool()
    pool.seed([{ host: '127.0.0.1', port: deadPort }, { host: '127.0.0.1', port: port(upstream) }])
    const before = connects
    for (let i = 0; i < 5; i++) {
      const r = await proxiedFetch(pool, `http://127.0.0.1:${port(target)}/redirect`, { guard: open, timeoutMs: 3000 })
      expect(r.status).toBe(200)
      expect(r.finalUrl).toMatch(/\/page$/)
      expect(r.body.toString()).toContain('hello via Mozilla')
      expect(r.proxy).toBe(`127.0.0.1:${port(upstream)}`)
    }
    expect(connects - before).toBeGreaterThanOrEqual(10) // 2 hops x 5 fetches
    // Dead proxy accumulates hard failures and is evicted after 3.
    for (let i = 0; i < 5 && pool.size > 1; i++) {
      await proxiedFetch(pool, `http://127.0.0.1:${port(target)}/page`, { guard: open, timeoutMs: 3000 })
    }
    expect(pool.size).toBe(1)
  })

  it('returns the last response when every proxy is blocked', async () => {
    const pool = makePool()
    pool.seed([{ host: '127.0.0.1', port: port(upstream) }])
    const r = await proxiedFetch(pool, `http://127.0.0.1:${port(target)}/blocked`, { guard: open })
    expect(r.status).toBe(429)
    expect(pool.size).toBe(1) // soft failure — not evicted
  })

  it('local tunnel chains CONNECT through the pool', async () => {
    const pool = makePool()
    pool.seed([{ host: '127.0.0.1', port: port(upstream) }])
    const tunnel = new TunnelServer(pool, { port: 0, guard: open, allowedPorts: [port(target)] })
    const tport = await tunnel.listen()
    const before = connects

    const body = await new Promise<string>((resolve, reject) => {
      const req = http.request({ host: '127.0.0.1', port: tport, method: 'CONNECT', path: `127.0.0.1:${port(target)}` })
      req.on('connect', (res, socket) => {
        expect(res.statusCode).toBe(200)
        socket.write(`GET /page HTTP/1.1\r\nHost: x\r\nUser-Agent: curl/8\r\nConnection: close\r\n\r\n`)
        let data = ''
        socket.on('data', (c) => (data += c))
        socket.on('end', () => resolve(data))
      })
      req.on('error', reject)
      req.end()
    })
    expect(body).toContain('hello via curl/8')
    expect(connects - before).toBe(1)
    expect(tunnel.stats.total).toBe(1)
    expect(tunnel.stats.recent[0]).toMatchObject({ host: '127.0.0.1', ok: true })

    // Disallowed port is refused before touching the pool.
    const code = await new Promise<number>((resolve) => {
      const req = http.request({ host: '127.0.0.1', port: tport, method: 'CONNECT', path: '127.0.0.1:25' })
      req.on('connect', (res, s) => {
        s.destroy()
        resolve(res.statusCode ?? 0)
      })
      req.end()
    })
    expect(code).toBe(403)
    await tunnel.close()
  })

  it('tunnel blocks plain http by default', async () => {
    const pool = makePool()
    const tunnel = new TunnelServer(pool, { port: 0, guard: { allowHttp: false, allowPrivate: true } })
    const tport = await tunnel.listen()
    const status = await new Promise<number>((resolve) => {
      http.get({ host: '127.0.0.1', port: tport, path: 'http://example.com/' }, (res) => {
        res.resume()
        resolve(res.statusCode ?? 0)
      })
    })
    expect(status).toBe(403)
    await tunnel.close()
  })
})

describe('HTTP API', () => {
  let server: http.Server
  let base: string
  beforeAll(async () => {
    const pool = makePool()
    pool.seed([{ host: '127.0.0.1', port: port(upstream) }])
    server = createApp({ pool, guard: open, tunnel: null, token: 's3cret', locked: false }).listen(0, '127.0.0.1')
    await new Promise((r) => server.once('listening', r))
    base = `http://127.0.0.1:${port(server)}`
  })
  afterAll(() => server.close())

  it('requires the token', async () => {
    expect((await fetch(`${base}/api/pool`)).status).toBe(401)
    expect((await fetch(`${base}/api/config`)).status).toBe(200)
  })

  it('serves reader and raw formats', async () => {
    const auth = { Authorization: 'Bearer s3cret' }
    const url = encodeURIComponent(`http://127.0.0.1:${port(target)}/page`)
    const reader = (await (await fetch(`${base}/api/fetch?format=reader&url=${url}`, { headers: auth })).json()) as {
      meta: { status: number }
      page: { title: string }
    }
    expect(reader.meta.status).toBe(200)
    expect(reader.page.title).toBe('Target')

    const raw = await fetch(`${base}/api/fetch?format=raw&url=${url}`, { headers: auth })
    expect(raw.status).toBe(200)
    expect(raw.headers.get('content-security-policy')).toContain('sandbox')
    expect(raw.headers.get('x-setu-proxy')).toBe(`127.0.0.1:${port(upstream)}`)
    expect(await raw.text()).toContain('<title>Target</title>')
  })

  it('locked public deploy refuses to relay', async () => {
    const s = createApp({ pool: makePool(), guard: open, tunnel: null, token: null, locked: true }).listen(0, '127.0.0.1')
    await new Promise((r) => s.once('listening', r))
    const r = await fetch(`http://127.0.0.1:${port(s)}/api/fetch?url=https://example.com`)
    expect(r.status).toBe(403)
    s.close()
  })
})
