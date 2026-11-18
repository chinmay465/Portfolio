import { PROVIDER_BY_ID } from '../data/providers.ts'
import type { ProviderId, Title } from '../types.ts'

export interface OpenLink {
  provider: ProviderId
  label: string
  href: string
}

/**
 * Hand-off links. Ekatra never plays anything itself: each button opens the title on the service.
 * Where the service has a search URL we search for the exact title (on phones these open the app);
 * otherwise we open the service's home page. Services the user subscribes to come first.
 */
export function openLinks(title: Title, services: ProviderId[] = []): OpenLink[] {
  const order = [...title.providers].sort(
    (a, b) => Number(services.includes(b)) - Number(services.includes(a)),
  )
  return order.map((id) => {
    const p = PROVIDER_BY_ID[id]
    return p.search
      ? { provider: id, label: `Open in ${p.name}`, href: p.search(title.name) }
      : { provider: id, label: `Go to ${p.name}`, href: p.home }
  })
}

/** Every service carrying the title, with deep links: TMDB's page when we have it, else JustWatch search. */
export function whereToWatch(title: Title): string {
  return title.watchLink ?? `https://www.justwatch.com/in/search?q=${encodeURIComponent(title.name)}`
}
