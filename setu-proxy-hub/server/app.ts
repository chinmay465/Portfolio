import fs from 'node:fs'
import path from 'node:path'
import express from 'express'
import type { NextFunction, Request, Response } from 'express'
import { proxiedFetch, NoProxyError } from './fetcher.ts'
import { GuardError } from './guard.ts'
import type { GuardOptions } from './guard.ts'
import type { ProxyPool } from './pool.ts'
import { toReader } from './reader.ts'
import { ENGINES, proxiedSearch } from './search.ts'
import type { Engine } from './search.ts'
import type { TunnelServer } from './tunnelServer.ts'

export interface AppDeps {
  pool: ProxyPool
  guard: GuardOptions
  tunnel: TunnelServer | null
  /** Bearer token required for every API call except /api/config. null = open (local use only). */
  token: string | null
  /** Public deploy with no token: refuse to relay anything. */
  locked: boolean
  distDir?: string
  rateLimitPerMin?: number
}

/** Tiny fixed-window per-IP limiter — enough to stop one client hammering the pool. */
function rateLimiter(perMin: number) {
  const hits = new Map<string, { n: number; reset: number }>()
  return (req: Request, res: Response, next: NextFunction) => {
    const key = req.ip ?? 'unknown'
    const now = Date.now()
    const h = hits.get(key)
    if (!h || h.reset < now) {
      hits.set(key, { n: 1, reset: now + 60000 })
      if (hits.size > 5000) hits.clear()
      return next()
    }
    if (++h.n > perMin) return res.status(429).json({ error: 'Too many requests — slow down.' })
    next()
  }
}

function fileTitle(u: string): string {
  const last = new URL(u).pathname.split('/').filter(Boolean).pop()
  try {
    return last ? decodeURIComponent(last) : u
  } catch {
    return last ?? u
  }
}

function errorStatus(err: unknown): number {
  if (err instanceof GuardError) return 400
  if (err instanceof NoProxyError) return 503
  return 502
}

export function createApp(deps: AppDeps): express.Express {
  const { pool, guard, tunnel, token, locked } = deps
  const app = express()
  app.set('trust proxy', 1)
  app.use(express.json({ limit: '256kb' }))

  app.get('/api/config', (_req, res) => {
    res.json({
      authRequired: Boolean(token),
      locked,
      allowHttp: guard.allowHttp,
      tunnel: tunnel ? { address: tunnel.stats.address } : null,
      engines: ENGINES,
    })
  })

  app.use('/api', (req: Request, res: Response, next: NextFunction) => {
    if (!token) return next()
    const header = req.get('authorization') ?? ''
    const given = header.startsWith('Bearer ') ? header.slice(7) : String(req.query.token ?? '')
    if (given !== token) return res.status(401).json({ error: 'Missing or wrong token.' })
    next()
  })

  app.get('/api/pool', (_req, res) => res.json(pool.snapshot()))
  app.post('/api/pool/refresh', (_req, res) => {
    void pool.refresh()
    res.json({ ok: true, ...pool.snapshot() })
  })
  app.get('/api/tunnel', (_req, res) => res.json(tunnel ? tunnel.stats : { enabled: false }))

  const relay = express.Router()
  relay.use((_req, res, next) => {
    if (locked) {
      return res.status(403).json({ error: 'Relay disabled: this is a public deployment without SETU_TOKEN. Set SETU_TOKEN to enable /api/fetch and /api/search.' })
    }
    next()
  })
  relay.use(rateLimiter(deps.rateLimitPerMin ?? 60))

  /**
   * GET  /api/fetch?url=...&format=raw|reader|json[&sticky=1]
   * POST /api/fetch { url, method, headers, body, format }
   *
   * raw    → the upstream body with its status + content-type (drop-in for fetch()).
   * reader → { meta, page: { title, blocks, links } } — script-free view for the UI.
   * json   → { meta, body } as text.
   */
  relay.all('/fetch', async (req: Request, res: Response) => {
    const src = (req.method === 'POST' ? req.body : req.query) as Record<string, unknown>
    const url = String(src.url ?? '')
    const format = String(src.format ?? 'json')
    if (!url) return res.status(400).json({ error: 'url is required' })

    const headers: Record<string, string> = {}
    if (src.headers && typeof src.headers === 'object') {
      for (const [k, v] of Object.entries(src.headers as Record<string, unknown>)) {
        if (/^(host|connection|proxy-.*|content-length|transfer-encoding)$/i.test(k)) continue
        headers[k] = String(v)
      }
    }
    try {
      const r = await proxiedFetch(pool, url, {
        guard,
        method: src.method === 'POST' ? 'POST' : 'GET',
        body: typeof src.body === 'string' ? src.body : undefined,
        headers,
        stickyKey: src.sticky ? URL.parse(url)?.hostname : undefined,
      })
      const meta = { status: r.status, finalUrl: r.finalUrl, proxy: r.proxy, exitIp: r.exitIp, ms: r.ms, attempts: r.attempts, contentType: String(r.headers['content-type'] ?? '') }
      res.set({ 'X-Setu-Proxy': r.proxy, 'X-Setu-Exit-Ip': r.exitIp, 'X-Setu-Final-Url': r.finalUrl })

      if (format === 'raw') {
        // Never let a fetched page execute on Setu's own origin.
        res.set({
          'Content-Type': meta.contentType || 'application/octet-stream',
          'Content-Security-Policy': "sandbox; default-src 'none'",
          'X-Content-Type-Options': 'nosniff',
        })
        return res.status(r.status).send(r.body)
      }
      const text = r.body.toString('utf8')
      if (format === 'reader') {
        const isHtml = /html|xml/i.test(meta.contentType) || /^\s*</.test(text)
        const page = isHtml ? toReader(text, r.finalUrl) : { title: fileTitle(r.finalUrl), description: '', blocks: [{ kind: 'pre' as const, text: text.slice(0, 200000) }], links: [] }
        return res.json({ meta, page })
      }
      return res.json({ meta, body: text })
    } catch (err) {
      return res.status(errorStatus(err)).json({ error: err instanceof Error ? err.message : String(err) })
    }
  })

  relay.get('/search', async (req: Request, res: Response) => {
    const q = String(req.query.q ?? '').trim()
    if (!q) return res.status(400).json({ error: 'q is required' })
    const engine = ENGINES.includes(req.query.engine as Engine) ? (req.query.engine as Engine) : undefined
    try {
      res.json(await proxiedSearch(pool, q.slice(0, 300), guard, engine))
    } catch (err) {
      res.status(errorStatus(err)).json({ error: err instanceof Error ? err.message : String(err), tried: (err as { tried?: unknown }).tried ?? [] })
    }
  })

  app.use('/api', relay)

  if (deps.distDir && fs.existsSync(deps.distDir)) {
    app.use(express.static(deps.distDir))
    app.get('*', (_req: Request, res: Response) => res.sendFile(path.join(deps.distDir!, 'index.html')))
  }
  return app
}
