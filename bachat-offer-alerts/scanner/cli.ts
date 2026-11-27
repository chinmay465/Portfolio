// One scan from the command line. GitHub Actions runs this every ten minutes
// (.github/workflows/bachat-scan.yml) against the same Postgres as the web service.
import { openDb, describeError } from '../server/db.ts'
import { webPushSender } from '../server/push.ts'
import { Store } from '../server/store.ts'
import { pickFetch } from './fetch.ts'
import { runScan } from './scan.ts'

const url = process.env.DATABASE_URL?.trim()
if (!url && process.env.CI) {
  console.log('::notice::DATABASE_URL secret is not set, so there is nowhere to keep deals or subscribers. Skipping the scan.')
  process.exit(0)
}

try {
  const db = await openDb(url, process.env.BACHAT_DATA_DIR ?? 'memory://')
  const store = new Store(db)
  await store.migrate()
  const summary = await runScan(store, pickFetch(), await webPushSender(store))
  for (const s of summary.sources) {
    console.log(`${s.ok ? 'ok ' : 'ERR'} ${s.name.padEnd(22)} ${String(s.posts).padStart(3)} posts, ${String(s.fresh).padStart(3)} new${s.error ? `  (${s.error})` : ''}`)
  }
  console.log(`${summary.newDeals} new deals, ${summary.pushes} alerts sent to ${summary.subscribers} subscribers`)
  await db.close()
  if (summary.sources.length && summary.sources.every((s) => !s.ok)) process.exit(1)
} catch (err) {
  console.error(`scan failed: ${describeError(err)}`)
  process.exit(1)
}
