// Outbound HTTP for providers: direct, or through a Setu proxy hub.
//
// Set SETU_URL (and SETU_TOKEN if your Setu requires one) and any source with
// `viaSetu: true` fetches through Setu's rotating free-proxy pool instead of
// this server's own IP. Setu's /api/fetch?format=raw returns the target's real
// status and body, so providers don't need to know the difference.

export interface FetchTextResult {
  ok: boolean
  status: number
  text: string
  via: string | null
}

export type Fetcher = (url: string, init?: { headers?: Record<string, string> }) => Promise<FetchTextResult>

export function setuConfigured(env = process.env): boolean {
  return Boolean(env.SETU_URL?.trim())
}

export const directFetch: Fetcher = async (url, init) => {
  const res = await fetch(url, { headers: init?.headers, signal: AbortSignal.timeout(20000) })
  return { ok: res.ok, status: res.status, text: await res.text(), via: null }
}

export function createSetuFetch(env = process.env): Fetcher {
  let base = env.SETU_URL?.trim().replace(/\/+$/, '')
  // Accept a bare host too (setu-proxy-hub.onrender.com).
  if (base && !/^https?:\/\//.test(base)) base = `https://${base}`
  if (!base) throw new Error('Route via Setu needs SETU_URL set on the Shodh server.')
  const token = env.SETU_TOKEN?.trim()
  return async (url, init) => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (token) headers.Authorization = `Bearer ${token}`
    const res = await fetch(`${base}/api/fetch`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ url, format: 'raw', sticky: true, headers: init?.headers ?? {} }),
      signal: AbortSignal.timeout(60000),
    })
    const via = res.headers.get('x-setu-proxy')
    if (!via) {
      // Setu itself refused (bad token, no proxies, guard) — not a target response.
      const err = (await res.json().catch(() => ({}))) as { error?: string }
      throw new Error(`Setu: ${err.error ?? `HTTP ${res.status}`}`)
    }
    return { ok: res.ok, status: res.status, text: await res.text(), via }
  }
}

export function pickFetcher(viaSetu: boolean | undefined): Fetcher {
  return viaSetu ? createSetuFetch() : directFetch
}
