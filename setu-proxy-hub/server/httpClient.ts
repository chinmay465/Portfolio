import http from 'node:http'
import type { IncomingHttpHeaders } from 'node:http'
import tls from 'node:tls'
import zlib from 'node:zlib'
import type { ProxyAddress } from './sources.ts'
import { openTunnel } from './tunnel.ts'

export interface TunnelRequestOptions {
  method?: string
  headers?: Record<string, string>
  body?: string | Buffer
  timeoutMs?: number
  maxBytes?: number
}

export interface TunnelResponse {
  status: number
  headers: IncomingHttpHeaders
  body: Buffer
}

/**
 * One HTTP request to `url`, tunnelled through `proxy` with CONNECT — for both
 * https and http targets. For https the TLS session is end-to-end with the
 * target and the certificate is verified, so the proxy only sees encrypted
 * bytes and the hostname. No redirects are followed here.
 */
export async function requestViaProxy(proxy: ProxyAddress, url: URL, opts: TunnelRequestOptions = {}): Promise<TunnelResponse> {
  const timeoutMs = opts.timeoutMs ?? 15000
  const maxBytes = opts.maxBytes ?? 5 * 1024 * 1024
  const isHttps = url.protocol === 'https:'
  const host = url.hostname.replace(/^\[|\]$/g, '')
  const port = Number(url.port) || (isHttps ? 443 : 80)
  const deadline = Date.now() + timeoutMs

  const raw = await openTunnel(proxy, host, port, timeoutMs)
  let socket: import('node:net').Socket = raw
  if (isHttps) {
    socket = await new Promise<tls.TLSSocket>((resolve, reject) => {
      const s = tls.connect({ socket: raw, servername: host, ALPNProtocols: ['http/1.1'] })
      s.setTimeout(Math.max(1, deadline - Date.now()), () => s.destroy(new Error('TLS handshake timeout')))
      s.once('secureConnect', () => {
        s.setTimeout(0)
        resolve(s)
      })
      s.once('error', reject)
    })
  }

  return new Promise<TunnelResponse>((resolve, reject) => {
    const headers: Record<string, string> = {
      Host: url.host,
      'Accept-Encoding': 'gzip, deflate, br',
      Connection: 'close',
      ...opts.headers,
    }
    const req = http.request({
      method: opts.method ?? 'GET',
      path: `${url.pathname}${url.search}`,
      headers,
      createConnection: () => socket,
    })
    const timer = setTimeout(() => req.destroy(new Error('request timeout')), Math.max(1, deadline - Date.now()))
    req.once('error', (e) => {
      clearTimeout(timer)
      socket.destroy()
      reject(e)
    })
    req.once('response', (res) => {
      const enc = String(res.headers['content-encoding'] ?? '').toLowerCase()
      let stream: NodeJS.ReadableStream = res
      if (enc === 'gzip' || enc === 'x-gzip') stream = res.pipe(zlib.createGunzip())
      else if (enc === 'deflate') stream = res.pipe(zlib.createInflate())
      else if (enc === 'br') stream = res.pipe(zlib.createBrotliDecompress())

      const chunks: Buffer[] = []
      let size = 0
      stream.on('data', (c: Buffer) => {
        size += c.length
        if (size > maxBytes) {
          req.destroy(new Error(`response larger than ${maxBytes} bytes`))
          return
        }
        chunks.push(c)
      })
      stream.once('error', (e) => {
        clearTimeout(timer)
        reject(e)
      })
      stream.once('end', () => {
        clearTimeout(timer)
        socket.destroy()
        resolve({ status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(chunks) })
      })
    })
    req.end(opts.body)
  })
}
