import { createHash, timingSafeEqual } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import express from 'express'
import type { NextFunction, Request, Response } from 'express'
import type { VisitorStore } from './store.ts'
import { isBot, parseVisit } from './visit.ts'

/** Shared with index.ts, which connects the database after the server is listening. */
export interface DbStatus {
  state: 'connecting' | 'ready' | 'error'
  storage: 'postgres' | 'pglite'
  store: VisitorStore | null
  error?: string
}

export interface AppOptions {
  status: DbStatus
  /** Bearer token for /api/stats. Empty means the stats are open (local runs only). */
  statsToken: string
  /** Sites allowed to send visits. Empty allows any origin. */
  allowedOrigins: string[]
  distDir?: string
  /** Visits accepted per IP per minute. */
  rateLimit?: number
}

/** Fixed one-minute window per IP. IPs are only held in memory, never stored. */
function limiter(max: number) {
  const hits = new Map<string, number>()
  setInterval(() => hits.clear(), 60_000).unref()
  return (req: Request, res: Response, next: NextFunction) => {
    const key = req.ip ?? 'unknown'
    const count = (hits.get(key) ?? 0) + 1
    hits.set(key, count)
    if (count > max) {
      res.status(429).json({ error: 'Too many requests' })
      return
    }
    next()
  }
}

function sameToken(given: string, expected: string): boolean {
  const a = createHash('sha256').update(given).digest()
  const b = createHash('sha256').update(expected).digest()
  return timingSafeEqual(a, b)
}

export function createApp(opts: AppOptions): express.Express {
  const { status, statsToken, allowedOrigins } = opts

  function notReady(res: Response): boolean {
    if (status.store) return false
    res.status(503).json({ error: 'Database not ready', state: status.state, detail: status.error })
    return true
  }
  const app = express()
  app.set('trust proxy', true)
  app.disable('x-powered-by')

  // ---- visit beacon (cross-origin, from the portfolio site) ----

  app.use('/api/visit', (req, res, next) => {
    const origin = req.get('origin')
    if (origin && allowedOrigins.length && !allowedOrigins.includes(origin)) {
      res.status(403).json({ error: 'Origin not allowed' })
      return
    }
    if (origin) {
      res.set('Access-Control-Allow-Origin', origin)
      res.set('Vary', 'Origin')
    }
    if (req.method === 'OPTIONS') {
      res.set('Access-Control-Allow-Methods', 'POST')
      res.set('Access-Control-Allow-Headers', 'Content-Type')
      res.set('Access-Control-Max-Age', '86400')
      res.sendStatus(204)
      return
    }
    next()
  })

  app.post(
    '/api/visit',
    limiter(opts.rateLimit ?? 30),
    express.text({ type: '*/*', limit: '2kb' }),
    async (req: Request, res: Response) => {
      const ua = req.get('user-agent')
      if (isBot(ua)) {
        res.status(202).json({ counted: false, reason: 'bot' })
        return
      }
      const visit = parseVisit(req.body, ua ?? '')
      if (!visit) {
        res.status(400).json({ error: 'Invalid visit' })
        return
      }
      if (notReady(res)) return
      try {
        const isNew = await status.store!.record(visit)
        res.json({ counted: true, new: isNew })
      } catch (err) {
        console.error('record failed', err)
        res.status(500).json({ error: 'Could not record visit' })
      }
    },
  )

  // ---- stats (dashboard) ----

  app.get('/api/config', (_req, res) => {
    res.json({ needsToken: Boolean(statsToken) })
  })

  app.get('/api/stats', async (req: Request, res: Response) => {
    if (statsToken) {
      const given = (req.get('authorization') ?? '').replace(/^Bearer\s+/i, '')
      if (!given || !sameToken(given, statsToken)) {
        res.status(401).json({ error: 'Wrong or missing token' })
        return
      }
    }
    const days = Math.min(Math.max(Number(req.query.days) || 30, 1), 365)
    if (notReady(res)) return
    try {
      res.set('Cache-Control', 'no-store')
      res.json(await status.store!.stats(days))
    } catch (err) {
      console.error('stats failed', err)
      res.status(500).json({ error: 'Could not load stats' })
    }
  })

  // Always 200 so Render keeps the service up; `database` says whether visits are saved.
  app.get('/api/health', (_req, res) => {
    res.set('Cache-Control', 'no-store')
    res.json({ ok: true, database: status.state, storage: status.storage, ...(status.error ? { error: status.error } : {}) })
  })

  // ---- dashboard (production build) ----

  const distDir = opts.distDir
  if (distDir && fs.existsSync(distDir)) {
    app.use(express.static(distDir))
    app.get(/^(?!\/api\/).*/, (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'))
    })
  }

  return app
}
