import type { Paste, Provider } from '../monitor.ts'

// Pastebin via its OFFICIAL scraping API.
//
// Important: this endpoint only works from an IP address that is whitelisted
// against a Pastebin PRO (lifetime) account. Scraping pastebin.com any other
// way violates their terms. If the IP isn't whitelisted the API returns an
// access error, which we surface instead of silently failing.
//
// Docs: https://pastebin.com/doc_scraping_api

const SCRAPE_URL = 'https://scrape.pastebin.com/api_scraping.php'
const ITEM_URL = 'https://scrape.pastebin.com/api_scrape_item.php'

interface PastebinItem {
  key: string
  title?: string
  full_url?: string
  date?: string
}

export interface PastebinOptions {
  limit?: number
  maxItemsPerPoll?: number
  userAgent?: string
}

export function createPastebinProvider({
  limit = 100,
  maxItemsPerPoll = 25,
  userAgent = 'shodh-paste-monitor',
}: PastebinOptions = {}): Provider {
  return {
    name: 'pastebin',
    async fetchRecent(): Promise<Paste[]> {
      const res = await fetch(`${SCRAPE_URL}?limit=${limit}`, { headers: { 'User-Agent': userAgent } })
      const text = await res.text()
      if (!res.ok || /does not have access|whitelist/i.test(text)) {
        throw new Error(
          'Pastebin scraping API not accessible — needs a PRO account with this server IP whitelisted (see README).',
        )
      }
      let items: PastebinItem[]
      try {
        items = JSON.parse(text) as PastebinItem[]
      } catch {
        throw new Error('Unexpected Pastebin response (expected JSON).')
      }

      const out: Paste[] = []
      for (const it of items.slice(0, maxItemsPerPoll)) {
        let content = ''
        try {
          const r = await fetch(`${ITEM_URL}?i=${encodeURIComponent(it.key)}`, {
            headers: { 'User-Agent': userAgent },
          })
          content = await r.text()
        } catch {
          // keep the metadata even if the body fetch failed
        }
        out.push({
          id: it.key,
          title: it.title || '(untitled)',
          url: it.full_url ?? null,
          content,
          timestamp: it.date ? Number(it.date) * 1000 : Date.now(),
        })
      }
      return out
    },
  }
}
