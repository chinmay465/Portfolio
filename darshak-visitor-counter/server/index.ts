import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createApp } from './app.ts'
import type { DbStatus } from './app.ts'
import { describeError, openDb } from './db.ts'
import type { Db } from './db.ts'
import { VisitorStore } from './store.ts'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const databaseUrl = process.env.DATABASE_URL?.trim() || undefined
const dataDir = process.env.DARSHAK_DATA_DIR ?? path.join(__dirname, '..', 'data')
const statsToken = process.env.STATS_TOKEN ?? ''
const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? '')
  .split(',')
  .map((o) => o.trim().replace(/\/$/, ''))
  .filter(Boolean)

const status: DbStatus = { state: 'connecting', storage: databaseUrl ? 'postgres' : 'pglite', store: null }

if (!databaseUrl) {
  console.warn('DATABASE_URL is not set: visitors go to an embedded database, which Render wipes on every deploy.')
}
if (!statsToken) console.log('Dashboard and /api/stats are open (no STATS_TOKEN set).')

// Listen first so Render's health check passes even while the database is waking or
// misconfigured; /api/health then says what's wrong instead of the service crash-looping.
const app = createApp({ status, statsToken, allowedOrigins, distDir: path.join(__dirname, '..', 'dist') })
const PORT = Number(process.env.PORT) || 3000
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`darshak-visitor-counter listening on http://localhost:${PORT} (${status.storage})`)
})

let db: Db | null = null

async function connect(attempt = 1): Promise<void> {
  try {
    db ??= await openDb(databaseUrl, dataDir)
    const store = new VisitorStore(db)
    await store.migrate()
    Object.assign(status, { state: 'ready', store, error: undefined })
    console.log(`database ready (${db.kind})`)
  } catch (err) {
    const error = describeError(err)
    Object.assign(status, { state: 'error', error })
    const wait = Math.min(60, 5 * attempt)
    console.error(`database not ready (attempt ${attempt}): ${error}. Retrying in ${wait}s.`)
    setTimeout(() => void connect(attempt + 1), wait * 1000)
  }
}
void connect()

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    server.close()
    void (db?.close() ?? Promise.resolve()).finally(() => process.exit(0))
  })
}
