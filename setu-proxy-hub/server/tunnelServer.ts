import http from 'node:http'
import type net from 'node:net'
import { checkHost, GuardError } from './guard.ts'
import type { GuardOptions } from './guard.ts'
import type { PoolEntry, ProxyPool } from './pool.ts'
import { openTunnel } from './tunnel.ts'

export interface TunnelOptions {
  port: number
  /** Loopback only by design — an open proxy on your LAN or the internet gets abused fast. */
  host?: '127.0.0.1' | '::1'
  guard: GuardOptions
  /** Ports clients may CONNECT to. */
  allowedPorts?: number[]
  /** Keep a hostname on the same upstream proxy for this long (logins/cookies survive). */
  stickyMs?: number
}

export interface TunnelStats {
  enabled: boolean
  listening: boolean
  address: string | null
  active: number
  total: number
  failed: number
  bytesUp: number
  bytesDown: number
  recent: Array<{ host: string; proxy: string; at: number; ok: boolean }>
}

/**
 * "VPN-like" mode: a local HTTP proxy on 127.0.0.1 that chains every
 * connection through a pool proxy. Point your browser / OS / curl at it and all
 * that traffic exits from a free proxy's IP instead of yours.
 */
export class TunnelServer {
  readonly opts: Required<Omit<TunnelOptions, 'host'>> & { host: string }
  private server: http.Server
  private pool: ProxyPool
  stats: TunnelStats

  constructor(pool: ProxyPool, opts: TunnelOptions) {
    this.pool = pool
    this.opts = {
      host: opts.host ?? '127.0.0.1',
      port: opts.port,
      guard: opts.guard,
      allowedPorts: opts.allowedPorts ?? (opts.guard.allowHttp ? [443, 80, 8443] : [443, 8443]),
      stickyMs: opts.stickyMs ?? 10 * 60 * 1000,
    }
    this.stats = { enabled: true, listening: false, address: null, active: 0, total: 0, failed: 0, bytesUp: 0, bytesDown: 0, recent: [] }
    this.server = http.createServer((req, res) => void this.onRequest(req, res))
    this.server.on('connect', (req: http.IncomingMessage, socket: net.Socket, head: Buffer) => void this.onConnect(req, socket, head))
  }

  listen(): Promise<number> {
    return new Promise((resolve, reject) => {
      this.server.once('error', reject)
      this.server.listen(this.opts.port, this.opts.host, () => {
        const addr = this.server.address()
        const port = typeof addr === 'object' && addr ? addr.port : this.opts.port
        this.stats.listening = true
        this.stats.address = `${this.opts.host}:${port}`
        resolve(port)
      })
    })
  }

  close(): Promise<void> {
    this.stats.listening = false
    return new Promise((resolve) => this.server.close(() => resolve()))
  }

  pacFile(): string {
    return `function FindProxyForURL(url, host) {\n  if (isPlainHostName(host) || shExpMatch(host, "localhost") || isInNet(dnsResolve(host), "127.0.0.0", "255.0.0.0")) return "DIRECT";\n  return "PROXY ${this.stats.address ?? `127.0.0.1:${this.opts.port}`}";\n}\n`
  }

  private log(host: string, proxy: string, ok: boolean): void {
    this.stats.recent.unshift({ host, proxy, at: Date.now(), ok })
    if (this.stats.recent.length > 30) this.stats.recent.pop()
  }

  /** Try up to 3 pool proxies to reach host:port; sticky per host. */
  private async dial(host: string, port: number): Promise<{ socket: net.Socket; proxy: PoolEntry }> {
    const tried = new Set<string>()
    let lastErr: Error | null = null
    for (let i = 0; i < 3; i++) {
      const proxy = i === 0 ? this.pool.pickSticky(host, this.opts.stickyMs, tried) : this.pool.pick(tried)
      if (!proxy) break
      tried.add(proxy.id)
      const t0 = Date.now()
      try {
        const socket = await openTunnel(proxy, host, port, 10000)
        this.pool.reportSuccess(proxy.id, Date.now() - t0)
        if (i > 0) this.pool.bindSticky(host, proxy.id, this.opts.stickyMs)
        return { socket, proxy }
      } catch (err) {
        lastErr = err instanceof Error ? err : new Error(String(err))
        // A proxy refusing one CONNECT may just dislike that port/host: soft.
        this.pool.reportFailure(proxy.id, !/refused CONNECT/.test(lastErr.message))
      }
    }
    throw lastErr ?? new Error(this.pool.refreshing ? 'pool warming up' : 'no working proxies')
  }

  private async onConnect(req: http.IncomingMessage, client: net.Socket, head: Buffer): Promise<void> {
    client.on('error', () => client.destroy())
    const target = req.url ?? ''
    const m = /^\[?([^\]]+?)\]?:(\d+)$/.exec(target)
    const deny = (code: number, msg: string) => {
      this.stats.failed++
      client.end(`HTTP/1.1 ${code} ${msg}\r\nContent-Type: text/plain\r\nConnection: close\r\n\r\n${msg}\n`)
    }
    if (!m) return deny(400, 'Bad CONNECT target')
    const host = m[1]
    const port = Number(m[2])
    if (!this.opts.allowedPorts.includes(port)) return deny(403, `Port ${port} not allowed through Setu`)
    try {
      checkHost(host, this.opts.guard)
    } catch (e) {
      return deny(403, e instanceof GuardError ? e.message : 'Blocked')
    }

    this.stats.total++
    let upstream: net.Socket
    let proxy: PoolEntry
    try {
      ;({ socket: upstream, proxy } = await this.dial(host, port))
    } catch (e) {
      this.log(host, '-', false)
      return deny(502, `Setu could not reach ${host} through any proxy (${e instanceof Error ? e.message : 'error'})`)
    }
    this.log(host, proxy.id, true)
    this.stats.active++
    client.write('HTTP/1.1 200 Connection Established\r\nProxy-Agent: setu\r\n\r\n')
    if (head.length) upstream.write(head)

    upstream.on('data', (c: Buffer) => (this.stats.bytesDown += c.length))
    client.on('data', (c: Buffer) => (this.stats.bytesUp += c.length))
    upstream.pipe(client)
    client.pipe(upstream)
    let closed = false
    const done = () => {
      if (closed) return
      closed = true
      this.stats.active--
      upstream.destroy()
      client.destroy()
    }
    upstream.on('error', done)
    upstream.on('close', done)
    client.on('close', done)
  }

  /** Plain-HTTP proxy requests ("GET http://..."), plus a tiny info page and PAC file. */
  private async onRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const raw = req.url ?? '/'
    if (raw.startsWith('/')) {
      if (raw === '/proxy.pac') {
        res.writeHead(200, { 'Content-Type': 'application/x-ns-proxy-autoconfig' })
        return void res.end(this.pacFile())
      }
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' })
      return void res.end(`Setu tunnel is running on ${this.stats.address}.\nSet this as the HTTP and HTTPS proxy in your browser or OS, or use the PAC file at /proxy.pac.\n`)
    }

    let url: URL
    try {
      url = new URL(raw)
    } catch {
      res.writeHead(400)
      return void res.end('Bad request')
    }
    if (url.protocol !== 'http:' || !this.opts.guard.allowHttp) {
      this.stats.failed++
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' })
      return void res.end('Setu blocks plain http:// through free proxies (they can read and modify it). Use https://, or start Setu with SETU_ALLOW_HTTP=1.\n')
    }
    try {
      checkHost(url.hostname, this.opts.guard)
    } catch (e) {
      res.writeHead(403)
      return void res.end(e instanceof Error ? e.message : 'Blocked')
    }

    this.stats.total++
    let upstream: net.Socket
    let proxy: PoolEntry
    try {
      ;({ socket: upstream, proxy } = await this.dial(url.hostname, Number(url.port) || 80))
    } catch (e) {
      this.log(url.hostname, '-', false)
      res.writeHead(502)
      return void res.end(`Setu could not reach ${url.hostname}: ${e instanceof Error ? e.message : 'error'}`)
    }
    this.log(url.hostname, proxy.id, true)
    this.stats.active++

    const headers = { ...req.headers }
    delete headers['proxy-connection']
    delete headers['proxy-authorization']
    const out = http.request({
      method: req.method,
      path: `${url.pathname}${url.search}`,
      headers,
      createConnection: () => upstream,
    })
    out.on('response', (up) => {
      res.writeHead(up.statusCode ?? 502, up.headers)
      up.on('data', (c: Buffer) => (this.stats.bytesDown += c.length))
      up.pipe(res)
    })
    out.on('error', () => {
      if (!res.headersSent) res.writeHead(502)
      res.end()
    })
    res.on('close', () => {
      this.stats.active--
      upstream.destroy()
    })
    req.pipe(out)
  }
}
