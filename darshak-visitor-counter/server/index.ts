import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createApp } from './app.ts'
import { openDb } from './db.ts'
import { VisitorStore } from './store.ts'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const db = await openDb(process.env.DATABASE_URL, process.env.DARSHAK_DATA_DIR ?? path.join(__dirname, '..', 'data'))
const store = new VisitorStore(db)
await store.migrate()

const statsToken = process.env.STATS_TOKEN ?? ''
const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? '')
  .split(',')
  .map((o) => o.trim().replace(/\/$/, ''))
  .filter(Boolean)

if (db.kind === 'pglite') {
  console.warn('DATABASE_URL is not set: visitors go to an embedded database, which Render wipes on every deploy.')
}
if (!statsToken) console.warn('STATS_TOKEN is not set: anyone can read /api/stats.')

const app = createApp({ store, statsToken, allowedOrigins, distDir: path.join(__dirname, '..', 'dist') })

const PORT = Number(process.env.PORT) || 3000
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`darshak-visitor-counter listening on http://localhost:${PORT} (${db.kind})`)
})

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    server.close()
    void db.close().finally(() => process.exit(0))
  })
}
