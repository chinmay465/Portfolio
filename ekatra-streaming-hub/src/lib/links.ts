import { PROVIDER_BY_ID } from '../data/providers.ts'
import type { ProviderId, Title } from '../types.ts'

export interface OpenLink {
  provider: ProviderId
  label: string
  href: string
  /** Set when the link goes through a listing site that then hands off to the service. */
  via?: 'JustWatch' | 'TMDB'
}

const justWatchSearch = (name: string) => `https://www.justwatch.com/in/search?q=${encodeURIComponent(name)}`

/**
 * Hand-off links. Ekatra never plays anything itself: each button opens the title on the service.
 * In order of preference:
 * 1. A verified title page (demo catalog): Netflix title URLs, or JustWatch India pages for JioHotstar
 * 2. The service's own search, where that link works from outside (Prime Video)
 * 3. TMDB's watch page (live mode) or a JustWatch search, both of which link straight to the title on the service
 * Services the user subscribes to come first.
 */
export function openLinks(title: Title, services: ProviderId[] = []): OpenLink[] {
  const order = [...title.providers].sort(
    (a, b) => Number(services.includes(b)) - Number(services.includes(a)),
  )
  return order.map((id): OpenLink => {
    const p = PROVIDER_BY_ID[id]
    const direct = title.links?.[id]
    if (direct) {
      const viaJustWatch = new URL(direct).hostname.endsWith('justwatch.com')
      return { provider: id, label: `Open in ${p.name}`, href: direct, ...(viaJustWatch && { via: 'JustWatch' }) }
    }
    if (p.search) return { provider: id, label: `Open in ${p.name}`, href: p.search(title.name) }
    if (title.watchLink) return { provider: id, label: `Find on ${p.name}`, href: title.watchLink, via: 'TMDB' }
    return { provider: id, label: `Find on ${p.name}`, href: justWatchSearch(title.name), via: 'JustWatch' }
  })
}

/** Every service carrying the title, with deep links: TMDB's page when we have it, else JustWatch search. */
export function whereToWatch(title: Title): string {
  return title.watchLink ?? justWatchSearch(title.name)
}
