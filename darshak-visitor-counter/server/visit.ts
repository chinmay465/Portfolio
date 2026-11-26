import type { Device, Visit } from './store.ts'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/** Crawlers, link previews, uptime checks and headless browsers aren't people. */
const BOT =
  /bot|crawl|spider|slurp|preview|facebookexternalhit|embedly|whatsapp|telegram|discord|curl|wget|python|node-fetch|axios|go-http|java\/|headless|lighthouse|pingdom|uptime|monitor/i

export function isBot(userAgent: string | undefined): boolean {
  return !userAgent || BOT.test(userAgent)
}

export function deviceOf(userAgent: string): Device {
  if (/ipad|tablet|kindle|silk|(android(?!.*mobile))/i.test(userAgent)) return 'tablet'
  if (/mobi|iphone|ipod|android/i.test(userAgent)) return 'mobile'
  return 'desktop'
}

/** Keeps only the path: no query string or hash, so nothing personal leaks in. */
export function cleanPath(raw: unknown): string {
  if (typeof raw !== 'string' || !raw.startsWith('/')) return '/'
  const path = raw.split(/[?#]/)[0].slice(0, 200)
  return path.length > 1 ? path.replace(/\/+$/, '') : '/'
}

/** Keeps only the referring site's host name, minus `www.`. */
export function cleanReferrer(raw: unknown): string | null {
  if (typeof raw !== 'string' || !raw) return null
  try {
    const url = new URL(raw)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
    return url.hostname.replace(/^www\./, '').slice(0, 100) || null
  } catch {
    return null
  }
}

/**
 * The beacon is sent as text/plain (a CORS "simple" request, so no preflight), so the
 * body arrives as a string. Returns null for anything that isn't a valid visit.
 */
export function parseVisit(body: unknown, userAgent: string): Visit | null {
  let data: unknown = body
  if (typeof body === 'string') {
    try {
      data = JSON.parse(body)
    } catch {
      return null
    }
  }
  if (!data || typeof data !== 'object') return null
  const { id, path, referrer } = data as Record<string, unknown>
  if (typeof id !== 'string' || !UUID.test(id)) return null
  return { id: id.toLowerCase(), path: cleanPath(path), referrer: cleanReferrer(referrer), device: deviceOf(userAgent) }
}
