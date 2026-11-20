import type { Config, FetchMeta, PoolSnapshot, ReaderPage, SearchResponse, TunnelStats } from './types.ts'

const TOKEN_KEY = 'setu.token'

export function getToken(): string {
  try {
    return localStorage.getItem(TOKEN_KEY) ?? ''
  } catch {
    return ''
  }
}

export function setToken(t: string): void {
  try {
    if (t) localStorage.setItem(TOKEN_KEY, t)
    else localStorage.removeItem(TOKEN_KEY)
  } catch {
    /* storage unavailable — token lives for this page only */
  }
  memToken = t
}

let memToken = getToken()

export class ApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)
  if (memToken) headers.set('Authorization', `Bearer ${memToken}`)
  const res = await fetch(path, { ...init, headers })
  const data = (await res.json().catch(() => ({}))) as T & { error?: string }
  if (!res.ok) throw new ApiError(data.error || `HTTP ${res.status}`, res.status)
  return data
}

export const getConfig = () => call<Config>('/api/config')
export const getPool = () => call<PoolSnapshot>('/api/pool')
export const refreshPool = () => call<PoolSnapshot>('/api/pool/refresh', { method: 'POST' })
export const getTunnel = () => call<TunnelStats>('/api/tunnel')

export const search = (q: string, engine?: string) =>
  call<SearchResponse>(`/api/search?q=${encodeURIComponent(q)}${engine ? `&engine=${engine}` : ''}`)

export const fetchReader = (url: string, sticky: boolean) =>
  call<{ meta: FetchMeta; page: ReaderPage }>(`/api/fetch?format=reader${sticky ? '&sticky=1' : ''}&url=${encodeURIComponent(url)}`)
