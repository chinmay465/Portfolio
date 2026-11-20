import type { IncomingHttpHeaders } from 'node:http'
import { checkTarget, GuardError } from './guard.ts'
import type { GuardOptions } from './guard.ts'
import { requestViaProxy } from './httpClient.ts'
import type { ProxyPool } from './pool.ts'

export const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

export interface ProxiedFetchOptions {
  method?: 'GET' | 'POST'
  headers?: Record<string, string>
  body?: string
  /** Different proxies to try before giving up. */
  attempts?: number
  timeoutMs?: number
  maxBytes?: number
  maxRedirects?: number
  /** Keep the same proxy per key (e.g. a hostname) so a site sees one IP. */
  stickyKey?: string
  guard: GuardOptions
}

export interface ProxiedResponse {
  status: number
  headers: IncomingHttpHeaders
  body: Buffer
  finalUrl: string
  proxy: string
  exitIp: string
  ms: number
  attempts: number
}

export class NoProxyError extends Error {}

/** Statuses that usually mean "this IP is blocked/throttled" — worth another proxy. */
const RETRY_STATUS = new Set([403, 407, 429, 502, 503, 504])

/**
 * Fetch a URL through the pool, rotating to a new proxy on network errors and
 * block-ish statuses. Redirects are followed manually so every hop passes the
 * guard (no sneaking from https to http, or to a private address).
 */
export async function proxiedFetch(pool: ProxyPool, rawUrl: string, opts: ProxiedFetchOptions): Promise<ProxiedResponse> {
  const attempts = opts.attempts ?? 4
  const maxRedirects = opts.maxRedirects ?? 5
  const tried = new Set<string>()
  let lastError: Error | null = null
  let lastResponse: ProxiedResponse | null = null

  checkTarget(rawUrl, opts.guard)

  for (let attempt = 1; attempt <= attempts; attempt++) {
    const proxy = opts.stickyKey && attempt === 1 ? pool.pickSticky(opts.stickyKey, undefined, tried) : pool.pick(tried)
    if (!proxy) break
    tried.add(proxy.id)

    const t0 = Date.now()
    try {
      let url = checkTarget(rawUrl, opts.guard)
      let method = opts.method ?? 'GET'
      let body = opts.body
      let res = null
      for (let hop = 0; ; hop++) {
        res = await requestViaProxy(proxy, url, {
          method,
          body,
          timeoutMs: opts.timeoutMs ?? 20000,
          maxBytes: opts.maxBytes,
          headers: {
            'User-Agent': BROWSER_UA,
            Accept: 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-IN,en;q=0.9',
            ...(body ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
            ...opts.headers,
          },
        })
        const loc = res.headers.location
        if (res.status >= 300 && res.status < 400 && loc && hop < maxRedirects) {
          url = checkTarget(new URL(loc, url).toString(), opts.guard)
          if (res.status !== 307 && res.status !== 308) {
            method = 'GET'
            body = undefined
          }
          continue
        }
        break
      }

      const ms = Date.now() - t0
      lastResponse = {
        status: res.status,
        headers: res.headers,
        body: res.body,
        finalUrl: url.toString(),
        proxy: proxy.id,
        exitIp: proxy.exitIp,
        ms,
        attempts: attempt,
      }
      if (RETRY_STATUS.has(res.status)) {
        pool.reportFailure(proxy.id, res.status === 407 || res.status >= 502)
        continue
      }
      pool.reportSuccess(proxy.id, ms)
      if (opts.stickyKey && attempt > 1) pool.bindSticky(opts.stickyKey, proxy.id)
      return lastResponse
    } catch (err) {
      // A guard failure on a redirect is the caller's problem, not the proxy's.
      if (err instanceof GuardError) throw err
      lastError = err instanceof Error ? err : new Error(String(err))
      pool.reportFailure(proxy.id, true)
    }
  }

  if (lastResponse) return lastResponse
  if (!tried.size) {
    throw new NoProxyError(pool.refreshing ? 'Proxy pool is still warming up — try again in a few seconds.' : 'No working proxies in the pool. Refresh it.')
  }
  throw new Error(`All ${tried.size} proxies failed. Last error: ${lastError?.message ?? 'unknown'}`)
}
