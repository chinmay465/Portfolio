import * as cheerio from 'cheerio'
import type { Paste, Provider } from '../monitor.ts'
import { pickFetcher } from '../net.ts'

// Generic provider for any paste/forum site that publishes a public "archive"
// or "recent" page of links. You supply CSS selectors; it fetches the archive,
// extracts item links, then fetches each item and pulls out its text.
//
// Use this ONLY on sites whose terms of service and robots.txt permit it, and
// keep the poll interval polite. It is a monitoring tool, not a bulk harvester.

export interface HtmlArchiveOptions {
  name: string
  archiveUrl: string
  linkSelector: string
  baseUrl?: string
  contentSelector?: string
  maxItemsPerPoll?: number
  userAgent?: string
  /** Fetch through the Setu free-proxy hub (needs SETU_URL on the server). */
  viaSetu?: boolean
}

export function createHtmlArchiveProvider(opts: HtmlArchiveOptions): Provider {
  const {
    name,
    archiveUrl,
    linkSelector,
    baseUrl,
    contentSelector = 'body',
    maxItemsPerPoll = 20,
    userAgent = 'shodh-paste-monitor',
    viaSetu = false,
  } = opts

  if (!name || !archiveUrl || !linkSelector) {
    throw new Error('html source needs: name, archiveUrl, linkSelector')
  }
  const get = pickFetcher(viaSetu)
  const headers = { 'User-Agent': userAgent }

  return {
    name: viaSetu ? `${name} via setu` : name,
    async fetchRecent(): Promise<Paste[]> {
      const res = await get(archiveUrl, { headers })
      if (!res.ok) throw new Error(`${name}: archive fetch returned ${res.status}${res.via ? ` (via ${res.via})` : ''}`)
      const $ = cheerio.load(res.text)

      const links: string[] = []
      $(linkSelector).each((_, el) => {
        const href = $(el).attr('href')
        if (href) links.push(href)
      })

      const urls = [...new Set(links)]
        .slice(0, maxItemsPerPoll)
        .map((h) => {
          try {
            return new URL(h, baseUrl || archiveUrl).toString()
          } catch {
            return null
          }
        })
        .filter((u): u is string => u !== null)

      const out: Paste[] = []
      for (const url of urls) {
        try {
          const r = await get(url, { headers })
          if (!r.ok) continue
          const $$ = cheerio.load(r.text)
          const content = $$(contentSelector).text()
          out.push({
            id: url,
            title: url.split('/').filter(Boolean).pop() || url,
            url,
            content,
            timestamp: Date.now(),
          })
        } catch {
          // skip this item, keep going
        }
      }
      return out
    },
  }
}
