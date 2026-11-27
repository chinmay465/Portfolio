import fs from 'node:fs'
import path from 'node:path'
import express from 'express'
import type { NextFunction, Request, Response } from 'express'
import { DEFAULT_SETTINGS, DEFAULT_SOURCES, PLATFORMS, normalizeSettings } from '../shared/types.ts'
import type { FetchText } from '../scanner/fetch.ts'
import { runScan } from '../scanner/scan.ts'
import type { ScanSummary } from '../scanner/scan.ts'
import type { PushSender } from './push.ts'
import type { Store } from './store.ts'

export interface AppState {
  state: 'connecting' | 'ready' | 'error'
  storage: 'postgres' | 'pglite'
  store: Store | null
  push: PushSender | null
  error?: string
}

export interface AppOptions {
  status: AppState
  fetchText: FetchText
  distDir?: string
  /** Seconds between scans someone can trigger from the app. */
  scanCooldown?: number
}

/** Browser push services only, so the server never posts to an arbitrary URL. */
const PUSH_HOSTS = [/^fcm\.googleapis\.com$/, /^android\.googleapis\.com$/, /(^|\.)push\.services\.mozilla\.com$/, /(^|\.)push\.apple\.com$/, /(^|\.)notify\.windows\.com$/]
export function isPushEndpoint(endpoint: unknown): endpoint is string {
  if (typeof endpoint !== 'string' || endpoint.length > 1000) return false
  try {
    const u = new URL(endpoint)
    return u.protocol === 'https:' && PUSH_HOSTS.some((re) => re.test(u.hostname))
  } catch {
    return false
  }
}

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

export function createApp(opts: AppOptions): express.Express {
  const { status } = opts
  const cooldown = (opts.scanCooldown ?? 90) * 1000
  let scanning: Promise<ScanSummary> | null = null
  let lastScanAt = 0

  const app = express()
  app.set('trust proxy', true)
  app.disable('x-powered-by')
  app.use(express.json({ limit: '16kb' }))

  const ready = (res: Response): Store | null => {
    if (status.store) return status.store
    res.status(503).json({ error: 'Database not ready', state: status.state, detail: status.error })
    return null
  }

  /** The caller owns subscriber :id (token from subscribe, sent as a Bearer token). */
  const owner = async (req: Request, res: Response): Promise<Store | null> => {
    const store = ready(res)
    if (!store) return null
    const token = (req.get('authorization') ?? '').replace(/^Bearer\s+/i, '')
    if (!token || !(await store.authorize(String(req.params.id), token))) {
      res.status(401).json({ error: 'Unknown subscription or wrong token' })
      return null
    }
    return store
  }

  app.get('/api/health', async (_req, res) => {
    const last = status.store ? await status.store.getMeta('lastScan').catch(() => null) : null
    res.status(status.state === 'error' ? 503 : 200).json({
      ok: status.state === 'ready',
      state: status.state,
      storage: status.storage,
      error: status.error,
      lastScan: last ? (JSON.parse(last) as ScanSummary).at : null,
    })
  })

  app.get('/api/config', (_req, res) => {
    res.json({ publicKey: status.push?.publicKey ?? null, platforms: PLATFORMS, sources: DEFAULT_SOURCES, defaults: DEFAULT_SETTINGS, storage: status.storage })
  })

  app.get('/api/deals', async (req, res) => {
    const store = ready(res)
    if (!store) return
    const hours = Math.min(168, Math.max(1, Number(req.query.hours) || 72))
    const [deals, sources, last] = await Promise.all([
      store.recentDeals({ sinceHours: hours, limit: 400 }),
      store.sourceStatus(),
      store.getMeta('lastScan'),
    ])
    res.set('Cache-Control', 'no-store').json({ deals, sources, lastScan: last ? JSON.parse(last) : null })
  })

  app.post('/api/scan', limiter(6), async (_req, res) => {
    const store = ready(res)
    if (!store) return
    if (!scanning && Date.now() - lastScanAt < cooldown) {
      const last = await store.getMeta('lastScan')
      res.json({ fresh: false, summary: last ? JSON.parse(last) : null })
      return
    }
    try {
      scanning ??= runScan(store, opts.fetchText, status.push).finally(() => {
        lastScanAt = Date.now()
        scanning = null
      })
      res.json({ fresh: true, summary: await scanning })
    } catch (err) {
      res.status(500).json({ error: (err as Error).message })
    }
  })

  // ---- push subscriptions ----

  app.post('/api/subscriptions', limiter(10), async (req, res) => {
    const store = ready(res)
    if (!store) return
    const sub = req.body?.subscription
    if (!isPushEndpoint(sub?.endpoint) || typeof sub?.keys?.p256dh !== 'string' || typeof sub?.keys?.auth !== 'string') {
      res.status(400).json({ error: 'Not a browser push subscription' })
      return
    }
    const tz = Number(req.body?.tzOffset)
    const settings = normalizeSettings(req.body?.settings)
    const { id, token } = await store.subscribe(sub.endpoint, { p256dh: sub.keys.p256dh, auth: sub.keys.auth }, settings, Number.isFinite(tz) ? tz : -330)
    res.status(201).json({ id, token, settings })
  })

  app.get('/api/subscriptions/:id', async (req, res) => {
    const store = await owner(req, res)
    if (!store) return
    const sub = await store.subscriber(String(req.params.id))
    res.json({ settings: sub?.settings })
  })

  app.put('/api/subscriptions/:id', async (req, res) => {
    const store = await owner(req, res)
    if (!store) return
    const settings = normalizeSettings(req.body?.settings)
    const tz = Number(req.body?.tzOffset)
    await store.updateSettings(String(req.params.id), settings, Number.isFinite(tz) ? tz : undefined)
    res.json({ ok: true, settings })
  })

  app.delete('/api/subscriptions/:id', async (req, res) => {
    const store = await owner(req, res)
    if (!store) return
    await store.unsubscribe(String(req.params.id))
    res.json({ ok: true })
  })

  app.post('/api/subscriptions/:id/test', limiter(5), async (req, res) => {
    const store = await owner(req, res)
    if (!store || !status.push) return
    const sub = await store.subscriber(String(req.params.id))
    if (!sub) {
      res.status(404).json({ error: 'Unknown subscription' })
      return
    }
    const result = await status.push.send(sub, {
      title: '🚨 96% off · Test alert',
      body: 'This is how Bachat alerts look. Extraordinary deals stay on screen until you open or dismiss them.',
      url: '/',
      tag: 'bachat-test',
      tier: 'test',
    })
    if (result === 'gone') await store.unsubscribe(sub.id)
    res.status(result === 'ok' ? 200 : 502).json({ result })
  })

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'Not found' })
  })

  // ---- the PWA ----

  const dist = opts.distDir
  if (dist && fs.existsSync(dist)) {
    app.get(['/sw.js', '/manifest.webmanifest'], (req, res, next) => {
      res.set('Cache-Control', 'no-cache')
      if (req.path === '/sw.js') res.set('Service-Worker-Allowed', '/')
      next()
    })
    app.use('/assets', express.static(path.join(dist, 'assets'), { immutable: true, maxAge: '1y' }))
    app.use(express.static(dist, { index: false }))
    app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')))
  }
  return app
}
