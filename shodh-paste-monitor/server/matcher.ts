// Keyword matching. Every keyword is tested against the content, so you learn
// exactly which keywords hit — not just whether "one" did.

export interface MatchOptions {
  wholeWord?: boolean
  caseSensitive?: boolean
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Return the subset of `keywords` that appear in `content`.
 * All keywords are always checked.
 */
export function matchKeywords(
  content: string,
  keywords: string[],
  { wholeWord = false, caseSensitive = false }: MatchOptions = {},
): string[] {
  if (!content) return []
  const hay = caseSensitive ? content : content.toLowerCase()
  const found: string[] = []
  for (const kw of keywords) {
    const needle = caseSensitive ? kw : kw.toLowerCase()
    if (!needle) continue
    let hit: boolean
    if (wholeWord) {
      const re = new RegExp(`\\b${escapeRegExp(needle)}\\b`, caseSensitive ? '' : 'i')
      hit = re.test(content)
    } else {
      hit = hay.includes(needle)
    }
    if (hit) found.push(kw)
  }
  return found
}

/**
 * Decide whether a paste qualifies given the mode.
 *  - "any": at least one keyword present
 *  - "all": every configured keyword present
 */
export function qualifies(found: string[], totalKeywords: number, mode: 'any' | 'all'): boolean {
  if (mode === 'all') return totalKeywords > 0 && found.length === totalKeywords
  return found.length > 0
}

/** A short excerpt around the first matched keyword, for the feed. */
export function makeSnippet(
  content = '',
  found: string[] = [],
  { caseSensitive = false }: MatchOptions = {},
  radius = 70,
): string {
  if (!content) return ''
  const collapse = (s: string) => s.replace(/\s+/g, ' ').trim()
  if (!found.length) return collapse(content.slice(0, 2 * radius))
  const kw = found[0]
  const hay = caseSensitive ? content : content.toLowerCase()
  const needle = caseSensitive ? kw : kw.toLowerCase()
  const idx = hay.indexOf(needle)
  if (idx === -1) return collapse(content.slice(0, 2 * radius))
  const start = Math.max(0, idx - radius)
  const end = Math.min(content.length, idx + needle.length + radius)
  return (start > 0 ? '…' : '') + collapse(content.slice(start, end)) + (end < content.length ? '…' : '')
}
