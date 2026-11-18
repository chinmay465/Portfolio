import { PROVIDER_BY_ID } from '../data/providers.ts'
import type { Reason } from './recommend.ts'

/** The line under a card that says why it's in the feed. */
export function reasonText(reason: Reason): string {
  switch (reason.type) {
    case 'liked':
      return `Because you liked ${reason.seed.name.split(':')[0]}`
    case 'watched':
      return `Because you watched ${reason.seed.name.split(':')[0]}`
    case 'saved':
      return `Like ${reason.seed.name.split(':')[0]} in your watchlist`
    case 'popular':
      return `Popular on ${PROVIDER_BY_ID[reason.provider].name}`
  }
}
