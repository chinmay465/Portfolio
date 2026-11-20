import * as cheerio from 'cheerio'
import { proxiedFetch } from './fetcher.ts'
import type { GuardOptions } from './guard.ts'
import type { ProxyPool } from './pool.ts'

export type Engine = 'duckduckgo' | 'ddg-lite' | 'bing' | 'yahoo' | 'mojeek'
export const ENGINES: Engine[] = ['duckduckgo', 'ddg-lite', 'bing', 'yahoo', 'mojeek']

/** Free-proxy IPs get bot-checked a lot, so each engine gets several different proxies. */
const PROXIES_PER_ENGINE = 5

export interface SearchResult {
  title: string
  url: string
  snippet: string
}

export interface SearchResponse {
  engine: Engine
  query: string
  results: SearchResult[]
  proxy: string
  exitIp: string
  ms: number
  tried: Array<{ engine: Engine; error: string }>
}

const squash = (s: string) => s.replace(/\s+/g, ' ').trim()
const isWeb = (u: string | null | undefined): u is string => Boolean(u && /^https?:\/\//.test(u))

// ---- link decoders: engines wrap result links in their own redirectors ----

export function unwrapDdg(href: string): string | null {
  try {
    const u = new URL(href, 'https://duckduckgo.com')
    const real = u.searchParams.get('uddg')
    if (real) return isWeb(real) ? real : null
    return u.hostname.endsWith('duckduckgo.com') ? null : u.toString()
  } catch {
    return null
  }
}

export function unwrapBing(href: string): string | null {
  try {
    const u = new URL(href, 'https://www.bing.com')
    if (u.hostname.endsWith('bing.com') && u.pathname.startsWith('/ck/')) {
      const enc = u.searchParams.get('u') ?? ''
      const real = enc.startsWith('a1') ? Buffer.from(enc.slice(2), 'base64url').toString('utf8') : ''
      return isWeb(real) ? real : null
    }
    return u.hostname.endsWith('bing.com') ? null : u.toString()
  } catch {
    return null
  }
}

export function unwrapYahoo(href: string): string | null {
  const m = /\/RU=([^/]+)\//.exec(href)
  if (m) {
    try {
      const real = decodeURIComponent(m[1])
      return isWeb(real) ? real : null
    } catch {
      return null
    }
  }
  return isWeb(href) && !/\.yahoo\.com\//.test(href) ? href : null
}

// ---- parsers ----

export function parseDuckDuckGo(html: string): SearchResult[] {
  const $ = cheerio.load(html)
  const out: SearchResult[] = []
  $('.result').each((_, el) => {
    const r = $(el)
    if (r.hasClass('result--ad')) return
    const a = r.find('a.result__a').first()
    const url = unwrapDdg(a.attr('href') ?? '')
    if (!url) return
    out.push({ title: squash(a.text()), url, snippet: squash(r.find('.result__snippet').first().text()) })
  })
  return out
}

export function parseDdgLite(html: string): SearchResult[] {
  const $ = cheerio.load(html)
  const out: SearchResult[] = []
  $('a.result-link').each((_, el) => {
    const a = $(el)
    const url = unwrapDdg(a.attr('href') ?? '')
    if (!url) return
    // Lite lays results out as table rows: title row, then a snippet row.
    const snippet = a.closest('tr').nextAll('tr').find('td.result-snippet').first().text()
    out.push({ title: squash(a.text()), url, snippet: squash(snippet) })
  })
  return out
}

export function parseBing(html: string): SearchResult[] {
  const $ = cheerio.load(html)
  const out: SearchResult[] = []
  $('li.b_algo').each((_, el) => {
    const r = $(el)
    const a = r.find('h2 a').first()
    const url = unwrapBing(a.attr('href') ?? '')
    if (!url) return
    const snippet = r.find('.b_caption p, p.b_lineclamp2, p.b_lineclamp3, p.b_lineclamp4').first().text()
    out.push({ title: squash(a.text()), url, snippet: squash(snippet) })
  })
  return out
}

export function parseYahoo(html: string): SearchResult[] {
  const $ = cheerio.load(html)
  const out: SearchResult[] = []
  $('div.algo').each((_, el) => {
    const r = $(el)
    const a = r.find('h3 a, .compTitle a').first()
    const url = unwrapYahoo(a.attr('href') ?? '')
    if (!url) return
    // Yahoo puts the display URL inside the title link; the real title is in the aria-label or the last span.
    const title = a.attr('aria-label') || r.find('h3 a span').last().text() || a.text()
    out.push({ title: squash(title), url, snippet: squash(r.find('.compText').first().text()) })
  })
  return out
}

export function parseMojeek(html: string): SearchResult[] {
  const $ = cheerio.load(html)
  const out: SearchResult[] = []
  $('ul.results-standard > li').each((_, el) => {
    const r = $(el)
    const a = r.find('h2 a').first()
    const url = a.attr('href') ?? ''
    if (!isWeb(url)) return
    out.push({ title: squash(a.text()), url, snippet: squash(r.find('p.s').first().text()) })
  })
  return out
}

interface EngineSpec {
  request: (q: string) => { url: string; method: 'GET' | 'POST'; body?: string; headers?: Record<string, string> }
  parse: (html: string) => SearchResult[]
}

const SPECS: Record<Engine, EngineSpec> = {
  // DuckDuckGo's HTML endpoints expect a form POST; GETs are bot-checked (HTTP 202) much more often.
  duckduckgo: {
    request: (q) => ({ url: 'https://html.duckduckgo.com/html/', method: 'POST', body: `q=${encodeURIComponent(q)}&kl=in-en`, headers: { Referer: 'https://html.duckduckgo.com/' } }),
    parse: parseDuckDuckGo,
  },
  'ddg-lite': {
    request: (q) => ({ url: 'https://lite.duckduckgo.com/lite/', method: 'POST', body: `q=${encodeURIComponent(q)}&kl=in-en`, headers: { Referer: 'https://lite.duckduckgo.com/' } }),
    parse: parseDdgLite,
  },
  bing: {
    request: (q) => ({ url: `https://www.bing.com/search?q=${encodeURIComponent(q)}&setlang=en&cc=IN`, method: 'GET' }),
    parse: parseBing,
  },
  yahoo: {
    request: (q) => ({ url: `https://search.yahoo.com/search?p=${encodeURIComponent(q)}`, method: 'GET' }),
    parse: parseYahoo,
  },
  mojeek: {
    request: (q) => ({ url: `https://www.mojeek.com/search?q=${encodeURIComponent(q)}`, method: 'GET' }),
    parse: parseMojeek,
  },
}

class EngineError extends Error {
  readonly engine: Engine
  constructor(engine: Engine, message: string) {
    super(message)
    this.engine = engine
  }
}

/** Try one engine on up to `max` different proxies until a page parses into results. */
async function runEngine(pool: ProxyPool, engine: Engine, query: string, guard: GuardOptions, max: number, stop: { done: boolean }): Promise<SearchResponse> {
  const spec = SPECS[engine]
  const used = new Set<string>()
  const errors: string[] = []
  for (let i = 0; i < max && !stop.done; i++) {
    const req = spec.request(query)
    try {
      const res = await proxiedFetch(pool, req.url, { guard, method: req.method, body: req.body, headers: req.headers, attempts: 1, timeoutMs: 15000, exclude: used })
      if (res.status !== 200) {
        errors.push(`HTTP ${res.status}`)
        continue
      }
      const results = spec.parse(res.body.toString('utf8'))
      if (!results.length) {
        errors.push('bot check / no results')
        continue
      }
      return { engine, query, results, proxy: res.proxy, exitIp: res.exitIp, ms: res.ms, tried: [] }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      errors.push(msg)
      if (/warming up|No working proxies/.test(msg)) break
    }
  }
  const summary = [...new Set(errors)].join(', ') || 'no proxies'
  throw new EngineError(engine, `${errors.length} ${errors.length === 1 ? 'try' : 'tries'}: ${summary}`)
}

/**
 * Search through the proxy pool. With a preferred engine, that engine goes
 * first; otherwise every engine races in parallel (each on its own proxies)
 * and the first page that parses into results wins.
 */
export async function proxiedSearch(pool: ProxyPool, query: string, guard: GuardOptions, preferred?: Engine): Promise<SearchResponse> {
  const tried: SearchResponse['tried'] = []
  const stop = { done: false }
  const record = (e: unknown, fallback: Engine) => {
    const engine = e instanceof EngineError ? e.engine : fallback
    tried.push({ engine, error: e instanceof Error ? e.message : String(e) })
  }

  if (preferred) {
    try {
      return await runEngine(pool, preferred, query, guard, PROXIES_PER_ENGINE + 2, stop)
    } catch (e) {
      record(e, preferred)
    }
  }

  const rest = ENGINES.filter((e) => e !== preferred)
  const races = rest.map((engine) =>
    runEngine(pool, engine, query, guard, PROXIES_PER_ENGINE, stop).catch((e: unknown) => {
      record(e, engine)
      throw e
    }),
  )
  try {
    const win = await Promise.any(races)
    stop.done = true
    return { ...win, tried: [...tried] }
  } catch {
    throw Object.assign(new Error(`Search failed on every engine — free proxies are often bot-checked by search engines. Try again or refresh the pool. (${tried.map((t) => `${t.engine}: ${t.error}`).join('; ')})`), { tried })
  }
}
