/** Format a millisecond duration as HH:MM:SS. */
export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const hh = String(Math.floor(total / 3600)).padStart(2, '0')
  const mm = String(Math.floor((total % 3600) / 60)).padStart(2, '0')
  const ss = String(total % 60).padStart(2, '0')
  return `${hh}:${mm}:${ss}`
}

/**
 * Split `text` into segments, marking the parts that match any keyword so the
 * feed can highlight them. Case-insensitive.
 */
export interface Segment {
  text: string
  hit: boolean
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function splitHighlights(text: string, keywords: string[]): Segment[] {
  const terms = keywords.map((k) => k.trim()).filter(Boolean)
  if (!terms.length || !text) return [{ text, hit: false }]
  const re = new RegExp(`(${terms.map(escapeRegExp).join('|')})`, 'gi')
  return text
    .split(re)
    .filter((part) => part !== '')
    .map((part) => ({ text: part, hit: terms.some((t) => t.toLowerCase() === part.toLowerCase()) }))
}
