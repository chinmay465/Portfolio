import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import express from 'express'
import type { Request, Response } from 'express'
import { Monitor } from './monitor.ts'
import type { MatchRecord, Stats } from './monitor.ts'
import { buildProviders } from './providers/index.ts'
import type { SourceSpec } from './providers/index.ts'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const distDir = path.join(__dirname, '..', 'dist')

const app = express()
app.use(express.json())

const monitor = new Monitor()
const clients = new Set<Response>()

function broadcast(type: string, payload: Record<string, unknown>): void {
  const line = `data: ${JSON.stringify({ type, ...payload })}\n\n`
  for (const res of clients) {
    try {
      res.write(line)
    } catch {
      clients.delete(res)
    }
  }
}

monitor.on('match', (match: MatchRecord) => broadcast('match', { match }))
monitor.on('scan', (s: { stats: Stats }) => broadcast('scan', s))
monitor.on('status', (s: Record<string, unknown>) => broadcast('status', s))
monitor.on('provider_error', (e: { provider: string; message: string }) => broadcast('provider_error', e))

// ---- API ----

// Server-Sent Events stream powering the live feed.
app.get('/api/stream', (req: Request, res: Response) => {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  })
  res.flushHeaders()
  res.write(`data: ${JSON.stringify({ type: 'status', ...monitor.snapshot() })}\n\n`)
  clients.add(res)

  const ping = setInterval(() => {
    try {
      res.write(': ping\n\n')
    } catch {
      /* ignore */
    }
  }, 20000)

  req.on('close', () => {
    clearInterval(ping)
    clients.delete(res)
  })
})

interface StartRequest {
  keywords?: unknown[]
  mode?: string
  intervalMs?: number
  sources?: SourceSpec[]
  matchOptions?: { wholeWord?: boolean; caseSensitive?: boolean }
}

app.post('/api/start', (req: Request, res: Response) => {
  const body = (req.body ?? {}) as StartRequest
  const keywords = (body.keywords ?? []).map((k) => String(k).trim()).filter(Boolean)
  if (!keywords.length) {
    return res.status(400).json({ error: 'At least one keyword is required.' })
  }

  const interval = Math.max(2000, Number(body.intervalMs) || 10000)
  const sources: SourceSpec[] = body.sources?.length ? body.sources : [{ type: 'mock' }]

  let providers
  try {
    providers = buildProviders(sources, { keywords })
  } catch (e) {
    return res.status(400).json({ error: e instanceof Error ? e.message : 'Invalid sources.' })
  }

  monitor.configure({
    providers,
    keywords,
    mode: body.mode === 'all' ? 'all' : 'any',
    intervalMs: interval,
    matchOptions: {
      wholeWord: Boolean(body.matchOptions?.wholeWord),
      caseSensitive: Boolean(body.matchOptions?.caseSensitive),
    },
  })
  monitor.start()
  return res.json({ ok: true, ...monitor.snapshot() })
})

app.post('/api/stop', (_req: Request, res: Response) => {
  monitor.stop()
  res.json({ ok: true, ...monitor.snapshot() })
})

app.get('/api/status', (_req: Request, res: Response) => {
  res.json(monitor.snapshot())
})

// ---- static frontend (production build) ----
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir))
  app.get('*', (_req: Request, res: Response) => {
    res.sendFile(path.join(distDir, 'index.html'))
  })
}

const PORT = Number(process.env.PORT) || 3000
app.listen(PORT, '0.0.0.0', () => {
  console.log(`shodh-paste-monitor listening on http://localhost:${PORT}`)
})
