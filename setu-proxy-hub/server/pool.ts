import { EventEmitter } from 'node:events'
import { requestViaProxy } from './httpClient.ts'
import { fetchSource } from './sources.ts'
import type { ProxyAddress, ProxySource } from './sources.ts'

export interface PoolEntry extends ProxyAddress {
  id: string
  sources: string[]
  latencyMs: number
  successes: number
  failures: number
  consecutiveFails: number
  lastCheckedAt: number
  lastUsedAt: number | null
  exitIp: string
  /** Added by you (SETU_SEED): never dropped by refresh or eviction, only ranked. */
  pinned: boolean
}

export interface PoolOptions {
  sources: ProxySource[]
  /** HTTPS endpoint that returns JSON {"ip": "..."}; used to validate every proxy. */
  judgeUrl: string
  /** How many unseen candidates to test per refresh. */
  maxCandidates: number
  concurrency: number
  /** Stop testing once this many proxies are alive. */
  targetSize: number
  checkTimeoutMs: number
  /** Auto-refresh interval; 0 disables. */
  refreshMs: number
  /** Refill in the background when fewer than this many are alive. */
  minAlive: number
  /** Your real IP, to drop transparent proxies. undefined = look it up; null = skip the check. */
  directIp?: string | null
  /** Injectable list loader (tests). */
  loadList?: (src: ProxySource) => Promise<ProxyAddress[]>
}

export const DEFAULT_POOL_OPTIONS: Omit<PoolOptions, 'sources'> = {
  judgeUrl: 'https://api.ipify.org?format=json',
  maxCandidates: 600,
  concurrency: 80,
  targetSize: 60,
  checkTimeoutMs: 8000,
  refreshMs: 15 * 60 * 1000,
  minAlive: 8,
}

export interface SourceStat {
  name: string
  count: number
  error: string | null
}

export interface PoolSnapshot {
  refreshing: boolean
  progress: { checked: number; total: number; alive: number }
  lastRefreshAt: number | null
  nextRefreshAt: number | null
  sources: SourceStat[]
  alive: number
  proxies: Array<Omit<PoolEntry, 'host' | 'port'> & { address: string }>
}

const idOf = (a: ProxyAddress) => `${a.host}:${a.port}`

function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

/** Lower is better: latency, penalised by failure rate. */
export const score = (e: PoolEntry) => e.latencyMs * (1 + (2 * e.failures) / (e.successes + e.failures + 1))

/**
 * Pool of validated free HTTP proxies. Emits 'update' whenever the pool
 * changes (refresh progress, eviction).
 */
export class ProxyPool extends EventEmitter {
  readonly opts: PoolOptions
  private entries = new Map<string, PoolEntry>()
  private stickies = new Map<string, { id: string; until: number }>()
  private refreshPromise: Promise<void> | null = null
  private timer: ReturnType<typeof setInterval> | null = null
  private progress = { checked: 0, total: 0, alive: 0 }
  private sourceStats: SourceStat[] = []
  private lastRefreshAt: number | null = null
  private directIp: string | null | undefined

  constructor(opts: Partial<PoolOptions> & { sources: ProxySource[] }) {
    super()
    this.opts = { ...DEFAULT_POOL_OPTIONS, ...opts }
    this.directIp = opts.directIp
  }

  get size(): number {
    return this.entries.size
  }

  get refreshing(): boolean {
    return this.refreshPromise !== null
  }

  startAuto(): void {
    void this.refresh()
    if (this.opts.refreshMs > 0 && !this.timer) {
      this.timer = setInterval(() => void this.refresh(), this.opts.refreshMs)
      this.timer.unref()
    }
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }

  /** Add proxies without validation. pinned = your own proxies that refresh must never drop. */
  seed(addrs: ProxyAddress[], source = 'manual', pinned = false): void {
    for (const a of addrs) {
      const id = idOf(a)
      if (!this.entries.has(id)) this.entries.set(id, { ...this.newEntry(a, [source], 1000, ''), pinned })
    }
    this.emit('update')
  }

  refresh(): Promise<void> {
    if (!this.refreshPromise) {
      this.refreshPromise = this.doRefresh().finally(() => {
        this.refreshPromise = null
        this.lastRefreshAt = Date.now()
        this.emit('update')
      })
    }
    return this.refreshPromise
  }

  private newEntry(a: ProxyAddress, sources: string[], latencyMs: number, exitIp: string): PoolEntry {
    return {
      id: idOf(a),
      host: a.host,
      port: a.port,
      sources,
      latencyMs,
      successes: 0,
      failures: 0,
      consecutiveFails: 0,
      lastCheckedAt: Date.now(),
      lastUsedAt: null,
      exitIp,
      pinned: false,
    }
  }

  private async lookupDirectIp(): Promise<string | null> {
    try {
      const res = await fetch(this.opts.judgeUrl, { signal: AbortSignal.timeout(8000) })
      const data = (await res.json()) as { ip?: unknown }
      return typeof data.ip === 'string' ? data.ip : null
    } catch {
      return null
    }
  }

  private async doRefresh(): Promise<void> {
    const load = this.opts.loadList ?? ((s: ProxySource) => fetchSource(s))
    if (this.directIp === undefined) this.directIp = await this.lookupDirectIp()

    const results = await Promise.allSettled(this.opts.sources.map((s) => load(s)))
    const found = new Map<string, { addr: ProxyAddress; sources: string[] }>()
    this.sourceStats = results.map((r, i) => {
      const name = this.opts.sources[i].name
      if (r.status === 'rejected') {
        return { name, count: 0, error: r.reason instanceof Error ? r.reason.message : String(r.reason) }
      }
      for (const addr of r.value) {
        const id = idOf(addr)
        const hit = found.get(id)
        if (hit) hit.sources.push(name)
        else found.set(id, { addr, sources: [name] })
      }
      return { name, count: r.value.length, error: null }
    })

    // Re-check what we already have, then try fresh candidates. Proxies listed
    // by several sources go first — they tend to be the ones still alive.
    const known = [...this.entries.values()].filter((e) => !e.pinned).map((e) => ({ addr: { host: e.host, port: e.port }, sources: e.sources }))
    const fresh = shuffle([...found.values()].filter((f) => !this.entries.has(idOf(f.addr))))
      .sort((a, b) => b.sources.length - a.sources.length)
      .slice(0, this.opts.maxCandidates)
    const queue = [...known, ...fresh]

    const alive = new Map<string, PoolEntry>()
    this.progress = { checked: 0, total: queue.length, alive: 0 }
    this.emit('update')

    let next = 0
    const worker = async () => {
      while (next < queue.length && alive.size < this.opts.targetSize) {
        const item = queue[next++]
        const checked = await this.check(item.addr)
        this.progress.checked++
        if (checked) {
          const prev = this.entries.get(idOf(item.addr))
          const entry = prev ?? this.newEntry(item.addr, item.sources, checked.latencyMs, checked.exitIp)
          entry.latencyMs = checked.latencyMs
          entry.exitIp = checked.exitIp
          entry.lastCheckedAt = Date.now()
          entry.consecutiveFails = 0
          alive.set(entry.id, entry)
          // Publish as we go so the pool is usable while a refresh runs.
          this.entries.set(entry.id, entry)
          this.progress.alive = alive.size
        } else {
          this.entries.delete(idOf(item.addr))
        }
        if (this.progress.checked % 25 === 0) this.emit('update')
      }
    }
    await Promise.all(Array.from({ length: Math.min(this.opts.concurrency, queue.length) }, worker))
    for (const e of this.entries.values()) if (e.pinned) alive.set(e.id, e)
    this.entries = alive
  }

  /** Validate one proxy: it must tunnel HTTPS, return a sane judge response and hide our IP. */
  async check(addr: ProxyAddress): Promise<{ latencyMs: number; exitIp: string } | null> {
    const t0 = Date.now()
    try {
      const res = await requestViaProxy(addr, new URL(this.opts.judgeUrl), {
        timeoutMs: this.opts.checkTimeoutMs,
        maxBytes: 4096,
        headers: { Accept: 'application/json' },
      })
      if (res.status !== 200) return null
      const data = JSON.parse(res.body.toString('utf8')) as { ip?: unknown }
      const ip = typeof data.ip === 'string' ? data.ip.trim() : ''
      if (!/^[\d.]+$|^[\da-f:]+$/i.test(ip)) return null
      if (this.directIp && ip === this.directIp) return null // transparent proxy: leaks our IP
      return { latencyMs: Date.now() - t0, exitIp: ip }
    } catch {
      return null
    }
  }

  /** Pick a good proxy, randomised among the best few so load spreads out. */
  pick(exclude: Set<string> = new Set()): PoolEntry | null {
    const ranked = [...this.entries.values()].filter((e) => !exclude.has(e.id)).sort((a, b) => score(a) - score(b))
    if (!ranked.length) {
      this.maybeRefill()
      return null
    }
    const top = ranked.slice(0, Math.min(6, ranked.length))
    const choice = top[Math.floor(Math.random() * top.length)]
    choice.lastUsedAt = Date.now()
    return choice
  }

  /** Same proxy for the same key for `ttlMs` — keeps a site session on one IP. */
  pickSticky(key: string, ttlMs = 10 * 60 * 1000, exclude: Set<string> = new Set()): PoolEntry | null {
    const s = this.stickies.get(key)
    if (s && s.until > Date.now() && !exclude.has(s.id)) {
      const e = this.entries.get(s.id)
      if (e) {
        s.until = Date.now() + ttlMs
        e.lastUsedAt = Date.now()
        return e
      }
    }
    const e = this.pick(exclude)
    if (e) this.stickies.set(key, { id: e.id, until: Date.now() + ttlMs })
    return e
  }

  bindSticky(key: string, id: string, ttlMs = 10 * 60 * 1000): void {
    this.stickies.set(key, { id, until: Date.now() + ttlMs })
  }

  reportSuccess(id: string, ms: number): void {
    const e = this.entries.get(id)
    if (!e) return
    e.successes++
    e.consecutiveFails = 0
    e.latencyMs = Math.round(e.latencyMs * 0.7 + ms * 0.3)
  }

  /** hard = network-level failure (counts toward eviction); soft = the target blocked this IP. */
  reportFailure(id: string, hard: boolean): void {
    const e = this.entries.get(id)
    if (!e) return
    e.failures++
    if (hard) e.consecutiveFails++
    if (e.consecutiveFails >= 3 && !e.pinned) {
      this.entries.delete(id)
      this.emit('update')
      this.maybeRefill()
    }
  }

  private maybeRefill(): void {
    if (!this.refreshing && this.entries.size < this.opts.minAlive && this.opts.sources.length) void this.refresh()
  }

  snapshot(limit = 100): PoolSnapshot {
    const proxies = [...this.entries.values()]
      .sort((a, b) => score(a) - score(b))
      .slice(0, limit)
      .map(({ host, port, ...rest }) => ({ ...rest, address: `${host}:${port}` }))
    return {
      refreshing: this.refreshing,
      progress: { ...this.progress },
      lastRefreshAt: this.lastRefreshAt,
      nextRefreshAt: this.timer && this.lastRefreshAt ? this.lastRefreshAt + this.opts.refreshMs : null,
      sources: this.sourceStats,
      alive: this.entries.size,
      proxies,
    }
  }
}
