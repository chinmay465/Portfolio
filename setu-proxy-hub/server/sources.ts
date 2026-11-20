// Public free-proxy lists that are actively maintained and machine-readable.
//
// "Trusted" here means the *list* is reputable (open-source, auto-updated,
// widely used) — not that any proxy on it is. Every proxy is run by an unknown
// third party, which is why the pool validates each one and the app only ever
// tunnels HTTPS through them by default (see README → Security).
//
// Override with SETU_SOURCES="name=url,name=url" if you want your own set.

export interface ProxySource {
  name: string
  url: string
}

export const DEFAULT_SOURCES: ProxySource[] = [
  { name: 'proxyscrape', url: 'https://api.proxyscrape.com/v4/free-proxy-list/get?request=display_proxies&protocol=http&proxy_format=ipport&format=text&timeout=5000' },
  { name: 'monosans', url: 'https://raw.githubusercontent.com/monosans/proxy-list/main/proxies/http.txt' },
  { name: 'proxifly', url: 'https://raw.githubusercontent.com/proxifly/free-proxy-list/main/proxies/protocols/http/data.txt' },
  { name: 'thespeedx', url: 'https://raw.githubusercontent.com/TheSpeedX/PROXY-List/master/http.txt' },
]

export function sourcesFromEnv(raw = process.env.SETU_SOURCES): ProxySource[] {
  if (!raw?.trim()) return DEFAULT_SOURCES
  const out: ProxySource[] = []
  for (const part of raw.split(',')) {
    const idx = part.indexOf('=')
    if (idx <= 0) continue
    const name = part.slice(0, idx).trim()
    const url = part.slice(idx + 1).trim()
    if (name && /^https:\/\//.test(url)) out.push({ name, url })
  }
  return out.length ? out : DEFAULT_SOURCES
}

export interface ProxyAddress {
  host: string
  port: number
}

const LINE = /^(?:https?:\/\/)?((?:\d{1,3}\.){3}\d{1,3}):(\d{2,5})$/

/** Parse "ip:port" / "http://ip:port" lines. Ignores comments, auth, IPv6 and junk. */
export function parseProxyList(text: string): ProxyAddress[] {
  const out: ProxyAddress[] = []
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    const m = LINE.exec(line)
    if (!m) continue
    const host = m[1]
    const port = Number(m[2])
    if (port < 1 || port > 65535) continue
    if (!isPublicIPv4(host)) continue
    out.push({ host, port })
  }
  return out
}

export function isPublicIPv4(ip: string): boolean {
  const p = ip.split('.').map(Number)
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return false
  const [a, b] = p
  if (a === 0 || a === 10 || a === 127 || a >= 224) return false
  if (a === 169 && b === 254) return false
  if (a === 172 && b >= 16 && b <= 31) return false
  if (a === 192 && b === 168) return false
  if (a === 100 && b >= 64 && b <= 127) return false
  return true
}

export async function fetchSource(src: ProxySource, timeoutMs = 15000): Promise<ProxyAddress[]> {
  const res = await fetch(src.url, { signal: AbortSignal.timeout(timeoutMs) })
  if (!res.ok) throw new Error(`${src.name}: HTTP ${res.status}`)
  return parseProxyList(await res.text())
}
