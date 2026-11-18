import type { ProviderId } from '../types.ts'

export interface Provider {
  id: ProviderId
  name: string
  /** Short label for the corner badge on a card. */
  short: string
  /** Badge colour. */
  color: string
  home: string
  /** Builds a search URL on the service, for services whose search link works when opened from outside. */
  search?: (query: string) => string
  /** Matches the provider's name in TMDB's watch-provider list for India. */
  tmdbName: RegExp
}

export const PROVIDERS: Provider[] = [
  {
    id: 'netflix',
    name: 'Netflix',
    short: 'NETFLIX',
    color: '#d81f26',
    home: 'https://www.netflix.com/',
    tmdbName: /^netflix$/i,
  },
  {
    id: 'prime',
    name: 'Prime Video',
    short: 'PRIME',
    color: '#1f8fe0',
    home: 'https://www.primevideo.com/',
    search: (q) => `https://www.primevideo.com/search?phrase=${encodeURIComponent(q)}`,
    tmdbName: /^amazon prime video$/i,
  },
  {
    id: 'jiohotstar',
    name: 'JioHotstar',
    short: 'HOTSTAR',
    color: '#2f55d4',
    home: 'https://www.hotstar.com/in',
    tmdbName: /hotstar/i,
  },
  {
    id: 'sonyliv',
    name: 'SonyLIV',
    short: 'SONYLIV',
    color: '#c99a2e',
    home: 'https://www.sonyliv.com/',
    tmdbName: /^sony ?liv$/i,
  },
  {
    id: 'zee5',
    name: 'ZEE5',
    short: 'ZEE5',
    color: '#8b3fd9',
    home: 'https://www.zee5.com/',
    tmdbName: /^zee5$/i,
  },
]

export const PROVIDER_BY_ID = Object.fromEntries(PROVIDERS.map((p) => [p.id, p])) as Record<
  ProviderId,
  Provider
>
