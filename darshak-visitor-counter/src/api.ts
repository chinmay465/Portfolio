export interface Ranked {
  label: string
  visitors: number
}

export interface Stats {
  storage: 'postgres' | 'pglite'
  total: number
  today: number
  last7: number
  last30: number
  activeToday: number
  returning: number
  days: number
  daily: { date: string; visitors: number }[]
  pages: Ranked[]
  referrers: Ranked[]
  devices: Ranked[]
}

export class Unauthorized extends Error {}

const TOKEN_KEY = 'darshak:token'

export function savedToken(): string {
  try {
    return localStorage.getItem(TOKEN_KEY) ?? ''
  } catch {
    return ''
  }
}

export function saveToken(token: string): void {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token)
    else localStorage.removeItem(TOKEN_KEY)
  } catch {
    /* private mode: the token just isn't remembered */
  }
}

export async function needsToken(): Promise<boolean> {
  const res = await fetch('./api/config')
  return res.ok ? ((await res.json()) as { needsToken: boolean }).needsToken : true
}

export async function fetchStats(days: number, token: string): Promise<Stats> {
  const res = await fetch(`./api/stats?days=${days}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
  if (res.status === 401) throw new Unauthorized()
  if (!res.ok) throw new Error(`Stats failed (${res.status})`)
  return (await res.json()) as Stats
}

const short = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' })

/** `2026-11-26` → `26 Nov`. The date is already an IST calendar day. */
export function dayLabel(date: string): string {
  return short.format(new Date(`${date}T00:00:00Z`))
}

export function percent(part: number, whole: number): string {
  return whole ? `${Math.round((part / whole) * 100)}%` : '0%'
}
