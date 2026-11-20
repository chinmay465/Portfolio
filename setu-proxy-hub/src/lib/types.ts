export interface Config {
  authRequired: boolean
  locked: boolean
  allowHttp: boolean
  tunnel: { address: string | null } | null
  engines: string[]
}

export interface ProxyRow {
  id: string
  address: string
  sources: string[]
  latencyMs: number
  successes: number
  failures: number
  consecutiveFails: number
  lastCheckedAt: number
  lastUsedAt: number | null
  exitIp: string
  pinned: boolean
}

export interface PoolSnapshot {
  refreshing: boolean
  progress: { checked: number; total: number; alive: number }
  lastRefreshAt: number | null
  nextRefreshAt: number | null
  sources: Array<{ name: string; count: number; error: string | null }>
  alive: number
  banned: number
  proxies: ProxyRow[]
}

export interface FetchMeta {
  status: number
  finalUrl: string
  proxy: string
  exitIp: string
  ms: number
  attempts: number
  contentType: string
}

export interface ReaderPage {
  title: string
  description: string
  blocks: Array<{ kind: 'h' | 'p' | 'pre' | 'li'; text: string }>
  links: Array<{ text: string; href: string }>
}

export interface SearchResult {
  title: string
  url: string
  snippet: string
}

export interface SearchResponse {
  engine: string
  query: string
  results: SearchResult[]
  proxy: string
  exitIp: string
  ms: number
  tried: Array<{ engine: string; error: string }>
}

export interface TunnelStats {
  enabled: boolean
  listening?: boolean
  address?: string | null
  active?: number
  total?: number
  failed?: number
  bytesUp?: number
  bytesDown?: number
  recent?: Array<{ host: string; proxy: string; at: number; ok: boolean }>
}
