import type { CityId, IssueDate, Paper } from '../data/papers'

/**
 * - `dated`: opens the chosen city's edition for the chosen date
 * - `latest`: opens the chosen city's edition, but the publisher's URL can't pick a date
 * - `home`: opens the paper's epaper home (no city picked, or no known link for that city)
 */
export type LinkKind = 'dated' | 'latest' | 'home'

export interface ResolvedLink {
  href: string
  kind: LinkKind
}

export function resolveLink(paper: Paper, city: CityId | null, date: IssueDate): ResolvedLink {
  const edition = city ? paper.editions?.[city] : undefined
  if (!edition || !paper.editionUrl) return { href: paper.url, kind: 'home' }
  return {
    href: paper.editionUrl(edition, date),
    kind: paper.dated === false ? 'latest' : 'dated',
  }
}

export function toIssueDate(d: Date): IssueDate {
  return { y: d.getFullYear(), m: d.getMonth() + 1, d: d.getDate() }
}

/** Parses an <input type="date"> value (YYYY-MM-DD). Returns null for anything else. */
export function parseIssueDate(value: string): IssueDate | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return null
  const [y, m, d] = match.slice(1).map(Number)
  const check = new Date(y, m - 1, d)
  return check.getMonth() === m - 1 && check.getDate() === d ? { y, m, d } : null
}
