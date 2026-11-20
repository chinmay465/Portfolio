export type Mode = 'any' | 'all'

export interface MatchRecord {
  id: string
  source: string
  title: string
  url: string | null
  matchedKeywords: string[]
  snippet: string
  size: number
  foundAt: number
  pasteTime: number | null
}

export interface Stats {
  scanned: number
  matched: number
  startedAt: number | null
  lastPollAt: number | null
  errors: number
}

export interface SourceSpec {
  type: 'mock' | 'pastebin' | 'html'
  options?: Record<string, unknown>
}

export interface StartBody {
  keywords: string[]
  mode: Mode
  intervalMs: number
  sources: SourceSpec[]
  matchOptions: { wholeWord: boolean; caseSensitive: boolean }
}
