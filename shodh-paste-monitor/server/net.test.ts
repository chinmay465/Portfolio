import http from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createSetuFetch } from './net.ts'

// A stand-in for Setu's /api/fetch.
let server: http.Server
let base: string
let lastBody: Record<string, unknown> = {}
let lastAuth = ''

beforeAll(async () => {
  server = http.createServer((req, res) => {
    let raw = ''
    req.on('data', (c) => (raw += c))
    req.on('end', () => {
      lastBody = JSON.parse(raw) as Record<string, unknown>
      lastAuth = req.headers.authorization ?? ''
      if (lastBody.url === 'https://down.test/') {
        res.writeHead(503, { 'Content-Type': 'application/json' })
        return res.end('{"error":"No working proxies in the pool."}')
      }
      res.writeHead(404, { 'Content-Type': 'text/html', 'X-Setu-Proxy': '1.2.3.4:8080' })
      res.end('<p>not here</p>')
    })
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/`
})
afterAll(() => server.close())

describe('createSetuFetch', () => {
  it('passes the target status/body through and sends the token', async () => {
    const get = createSetuFetch({ SETU_URL: base, SETU_TOKEN: 'tok' })
    const r = await get('https://site.test/x', { headers: { 'User-Agent': 'shodh' } })
    expect(r).toEqual({ ok: false, status: 404, text: '<p>not here</p>', via: '1.2.3.4:8080' })
    expect(lastBody).toMatchObject({ url: 'https://site.test/x', format: 'raw', headers: { 'User-Agent': 'shodh' } })
    expect(lastAuth).toBe('Bearer tok')
  })

  it('throws on Setu-level errors instead of treating them as target responses', async () => {
    const get = createSetuFetch({ SETU_URL: base })
    await expect(get('https://down.test/')).rejects.toThrow('Setu: No working proxies in the pool.')
  })

  it('requires SETU_URL', () => {
    expect(() => createSetuFetch({})).toThrow(/SETU_URL/)
  })
})
