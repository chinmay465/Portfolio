export function ago(ts: number | null, now = Date.now()): string {
  if (!ts) return '—'
  const s = Math.max(0, Math.round((now - ts) / 1000))
  if (s < 60) return `${s}s ago`
  const m = Math.round(s / 60)
  if (m < 60) return `${m}m ago`
  return `${Math.round(m / 60)}h ago`
}

export function bytes(n = 0): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`
  return `${(n / 1024 ** 3).toFixed(2)} GB`
}

/** Treat input as a URL if it looks like one, otherwise as a search query. */
export function asUrl(input: string): string | null {
  const s = input.trim()
  if (!s || /\s/.test(s)) return null
  if (/^https?:\/\//i.test(s)) return s
  if (/^[a-z0-9-]+(\.[a-z0-9-]+)+(:\d+)?(\/.*)?$/i.test(s)) return `https://${s}`
  return null
}

export const hostOf = (u: string) => {
  try {
    return new URL(u).hostname
  } catch {
    return u
  }
}
