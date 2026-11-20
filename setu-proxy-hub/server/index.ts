import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createApp } from './app.ts'
import { defaultGuard } from './guard.ts'
import { ProxyPool } from './pool.ts'
import { sourcesFromEnv } from './sources.ts'
import { TunnelServer } from './tunnelServer.ts'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const env = process.env

// Render sets RENDER=true. On a public host the relay only runs with a token,
// and the local tunnel is off (it's meant for your own machine).
const isPublicHost = env.RENDER === 'true' || env.SETU_PUBLIC === '1'
const token = env.SETU_TOKEN?.trim() || null
const guard = defaultGuard()

const pool = new ProxyPool({
  sources: sourcesFromEnv(),
  ...(env.SETU_TARGET_SIZE ? { targetSize: Number(env.SETU_TARGET_SIZE) } : {}),
  ...(env.SETU_MAX_CANDIDATES ? { maxCandidates: Number(env.SETU_MAX_CANDIDATES) } : {}),
  ...(env.SETU_JUDGE_URL ? { judgeUrl: env.SETU_JUDGE_URL } : {}),
})
// Bring your own proxies (e.g. a paid one): SETU_SEED="1.2.3.4:8080,5.6.7.8:3128"
if (env.SETU_SEED) {
  pool.seed(
    env.SETU_SEED.split(',')
      .map((s) => s.trim().split(':'))
      .filter(([h, p]) => h && Number(p) > 0)
      .map(([host, port]) => ({ host, port: Number(port) })),
    'manual',
    true,
  )
}
if (env.SETU_NO_REFRESH !== '1') pool.startAuto()

const tunnelPort = Number(env.SETU_TUNNEL_PORT ?? 8899)
const tunnelEnabled = env.SETU_TUNNEL ? env.SETU_TUNNEL === '1' : !isPublicHost
let tunnel: TunnelServer | null = null // stays set if listen fails; stats.listening tells the UI
if (tunnelEnabled) {
  tunnel = new TunnelServer(pool, { port: tunnelPort, guard })
  tunnel
    .listen()
    .then((p) => console.log(`setu tunnel (VPN-like proxy) on http://127.0.0.1:${p}`))
    .catch((e: Error) => {
      console.error(`setu tunnel failed to start: ${e.message}`)
    })
}

const app = createApp({
  pool,
  guard,
  tunnel,
  token,
  locked: isPublicHost && !token,
  distDir: path.join(__dirname, '..', 'dist'),
})

const PORT = Number(env.PORT) || 3001
app.listen(PORT, isPublicHost ? '0.0.0.0' : '127.0.0.1', () => {
  console.log(`setu-proxy-hub on http://localhost:${PORT}${token ? ' (token required)' : ''}`)
  if (isPublicHost && !token) console.warn('SETU_TOKEN not set: /api/fetch and /api/search are disabled on this public host.')
})
