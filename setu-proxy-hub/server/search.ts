import * as cheerio from 'cheerio'
import { proxiedFetch } from './fetcher.ts'
import type { GuardOptions } from './guard.ts'
import type { ProxyPool } from './pool.ts'

export type Engine = 'duckduckgo' | 'mojeek'
export const ENGINES: Engine[] = ['duckduckgo', 'mojeek']

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

// Both engines serve plain, script-free HTML result pages that work well
// through a proxy. Selectors are kept in one place so they're easy to fix if
// an engine changes its markup.

function ddgTarget(href: string): string | null {
  try {
    const u = new URL(href, 'https://duckduckgo.com')
    const real = u.searchParams.get('uddg')
    const out = real ?? (u.hostname.endsWith('duckduckgo.com') ? null : u.toString())
    return out && /^https?:/.test(out) ? out : null
  } catch {
    return null
  }
}

export function parseDuckDuckGo(html: string): SearchResult[] {
  const $ = cheerio.load(html)
  const out: SearchResult[] = []
  $('.result').each((_, el) => {
    const r = $(el)
    if (r.hasClass('result--ad')) return
    const a = r.find('a.result__a').first()
    const url = ddgTarget(a.attr('href') ?? '')
    if (!url) return
    out.push({
      title: a.text().trim(),
      url,
      snippet: r.find('.result__snippet').first().text().replace(/\s+/g, ' ').trim(),
    })
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
    if (!/^https?:/.test(url)) return
    out.push({ title: a.text().trim(), url, snippet: r.find('p.s').first().text().replace(/\s+/g, ' ').trim() })
  })
  return out
}

const ENGINE_URL: Record<Engine, (q: string) => string> = {
  duckduckgo: (q) => `https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}&kl=in-en`,
  mojeek: (q) => `https://www.mojeek.com/search?q=${encodeURIComponent(q)}`,
}
const PARSER: Record<Engine, (html: string) => SearchResult[]> = { duckduckgo: parseDuckDuckGo, mojeek: parseMojeek }

/** Search through the proxy pool; falls back to the next engine if one blocks or returns nothing. */
export async function proxiedSearch(pool: ProxyPool, query: string, guard: GuardOptions, preferred?: Engine): Promise<SearchResponse> {
  const order = preferred ? [preferred, ...ENGINES.filter((e) => e !== preferred)] : ENGINES
  const tried: SearchResponse['tried'] = []
  for (const engine of order) {
    try {
      const res = await proxiedFetch(pool, ENGINE_URL[engine](query), { guard, attempts: 3, timeoutMs: 20000 })
      if (res.status !== 200) {
        tried.push({ engine, error: `HTTP ${res.status}` })
        continue
      }
      const results = PARSER[engine](res.body.toString('utf8'))
      if (!results.length) {
        tried.push({ engine, error: 'no results (blocked or captcha)' })
        continue
      }
      return { engine, query, results, proxy: res.proxy, exitIp: res.exitIp, ms: res.ms, tried }
    } catch (err) {
      tried.push({ engine, error: err instanceof Error ? err.message : String(err) })
    }
  }
  throw Object.assign(new Error(`Search failed on every engine: ${tried.map((t) => `${t.engine}: ${t.error}`).join('; ')}`), { tried })
}
