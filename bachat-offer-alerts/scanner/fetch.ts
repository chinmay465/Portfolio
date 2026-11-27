import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { DEFAULT_SOURCES } from '../shared/types.ts'
import type { SourceDef } from '../shared/types.ts'

export type FetchText = (url: string) => Promise<string>

const UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Mobile Safari/537.36'
const MAX_BYTES = 3_000_000

/** GET a page as text, with a browser-like user agent, a timeout and a size cap. */
export const fetchText: FetchText = async (url) => {
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8', 'Accept-Language': 'en-IN,en;q=0.9' },
    redirect: 'follow',
    signal: AbortSignal.timeout(15_000),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const text = await res.text()
  return text.length > MAX_BYTES ? text.slice(0, MAX_BYTES) : text
}

const fixtures = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'shared', 'fixtures')

/**
 * Offline sources for CI and local demos (BACHAT_FIXTURES=1): the shared fixtures, with post
 * times moved to the last hour so they show up as offers posted now.
 */
export const fixtureFetch: FetchText = async (url) => {
  const now = Date.now()
  let n = 0
  const recent = () => new Date(now - (++n * 7 + 2) * 60_000).toISOString()
  if (/t\.me\/s\/desidime(?:\?|$)/i.test(url) && !url.includes('before=')) {
    return fs.readFileSync(path.join(fixtures, 'telegram-desidime.html'), 'utf8').replace(/datetime="[^"]+"/g, () => `datetime="${recent()}"`)
  }
  if (/reddit\.com\/r\/dealsforindia/i.test(url)) {
    return fs.readFileSync(path.join(fixtures, 'reddit-dealsforindia.xml'), 'utf8').replace(/<(published|updated)>[^<]+</g, (_m, t) => `<${t}>${recent()}<`)
  }
  return '<html><body>No such channel</body></html>'
}

export const pickFetch = (): FetchText => (process.env.BACHAT_FIXTURES === '1' ? fixtureFetch : fetchText)

/** Offline demo sources: the DesiDime channel fixture and a Reddit feed fixture (RSS path). */
export const FIXTURE_SOURCES: SourceDef[] = [
  { id: 'tg:desidime', kind: 'telegram', channel: 'desidime', name: 'DesiDime', enabled: true },
  { id: 'rss:dealsforindia', kind: 'rss', url: 'https://www.reddit.com/r/dealsforindia/new/.rss', name: 'r/dealsforindia', enabled: true },
]

export const pickSources = (): SourceDef[] => (process.env.BACHAT_FIXTURES === '1' ? FIXTURE_SOURCES : DEFAULT_SOURCES)
