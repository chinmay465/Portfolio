import net from 'node:net'
import { isPublicIPv4 } from './sources.ts'

export interface GuardOptions {
  /** Allow plain http:// targets. Off by default: a free proxy can read and rewrite plain HTTP. */
  allowHttp: boolean
  /** Allow localhost / private-network targets. Only for tests. */
  allowPrivate: boolean
}

export const defaultGuard = (): GuardOptions => ({
  allowHttp: process.env.SETU_ALLOW_HTTP === '1',
  allowPrivate: false,
})

export class GuardError extends Error {}

const BLOCKED_NAMES = /(^|\.)(localhost|local|internal|intranet|lan|home\.arpa)$/i

/** Validate a target before sending it anywhere. Returns the parsed URL. */
export function checkTarget(raw: string, opts: GuardOptions): URL {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new GuardError('Not a valid URL.')
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new GuardError('Only http(s) URLs are supported.')
  if (url.protocol === 'http:' && !opts.allowHttp) {
    throw new GuardError('Plain http:// is blocked — free proxies can read and modify it. Use https:// (or set SETU_ALLOW_HTTP=1).')
  }
  if (url.username || url.password) throw new GuardError('URLs with credentials are not allowed.')
  checkHost(url.hostname.replace(/^\[|\]$/g, ''), opts)
  return url
}

export function checkHost(host: string, opts: GuardOptions): void {
  if (opts.allowPrivate) return
  if (!host || BLOCKED_NAMES.test(host)) throw new GuardError('Local/private hosts are not allowed.')
  const kind = net.isIP(host)
  if (kind === 4 && !isPublicIPv4(host)) throw new GuardError('Local/private hosts are not allowed.')
  if (kind === 6) {
    const h = host.toLowerCase()
    if (h === '::1' || h === '::' || h.startsWith('fc') || h.startsWith('fd') || h.startsWith('fe80') || h.startsWith('::ffff:')) {
      throw new GuardError('Local/private hosts are not allowed.')
    }
  }
}
