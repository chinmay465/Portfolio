import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { pickFetch } from '../scanner/fetch.ts'
import { runScan } from '../scanner/scan.ts'
import { createApp } from './app.ts'
import type { AppState } from './app.ts'
import { describeError, openDb } from './db.ts'
import type { Db } from './db.ts'
import { webPushSender } from './push.ts'
import { Store } from './store.ts'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const databaseUrl = process.env.DATABASE_URL?.trim() || undefined
const dataDir = process.env.BACHAT_DATA_DIR ?? path.join(__dirname, '..', 'data')
/** While the service is awake it also checks on its own, every this many minutes (0: never). */
const scanEvery = Number(process.env.BACHAT_SCAN_MINUTES ?? 10)

const status: AppState = { state: 'connecting', storage: databaseUrl ? 'postgres' : 'pglite', store: null, push: null }
const fetchText = pickFetch()

if (!databaseUrl) {
  console.warn('DATABASE_URL is not set: deals and subscribers go to an embedded database, which Render wipes on every deploy, and the GitHub Actions scanner cannot reach it.')
}

// Listen first so Render's health check passes while the database wakes.
const app = createApp({ status, fetchText, distDir: path.join(__dirname, '..', 'dist') })
const PORT = Number(process.env.PORT) || 3000
const server = app.listen(PORT, '0.0.0.0', () => console.log(`bachat-offer-alerts listening on http://localhost:${PORT} (${status.storage})`))

let db: Db | null = null
async function connect(attempt = 1): Promise<void> {
  try {
    db ??= await openDb(databaseUrl, dataDir)
    const store = new Store(db)
    await store.migrate()
    const push = await webPushSender(store)
    Object.assign(status, { state: 'ready', store, push, error: undefined })
    console.log(`database ready (${db.kind})`)
    if (scanEvery > 0) {
      const tick = () => runScan(store, fetchText, push).then(
        (s) => console.log(`scan: ${s.newDeals} new deals, ${s.pushes} alerts`),
        (err) => console.error('scan failed', describeError(err)),
      )
      void tick()
      setInterval(tick, scanEvery * 60_000).unref()
    }
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
