export type PingState = 'checking' | 'waking' | 'online' | 'unreachable' | 'blocked'

export interface PingResult {
  state: Exclude<PingState, 'checking' | 'waking'>
  ms: number
}

/** A failure this fast never left the browser: a content policy or no network. */
export const BLOCKED_UNDER_MS = 250
/** Render's free web services sleep; waking one can take close to a minute. */
export const TIMEOUT_MS = 75_000
/** After this long without an answer the service is probably cold-starting. */
export const WAKING_AFTER_MS = 2_500

export function classify(ok: boolean, ms: number, timedOut: boolean): PingResult {
  if (ok) return { state: 'online', ms }
  if (timedOut) return { state: 'unreachable', ms }
  return { state: ms < BLOCKED_UNDER_MS ? 'blocked' : 'unreachable', ms }
}

/**
 * Pings a deployed app. `no-cors` gives an opaque response, so this only proves the
 * server answered, which is all a status light needs. It also wakes sleeping services,
 * so they're warm by the time someone clicks through.
 */
export async function ping(url: string, onSlow?: () => void): Promise<PingResult> {
  const ctrl = new AbortController()
  const started = performance.now()
  let timedOut = false
  const slow = onSlow ? setTimeout(onSlow, WAKING_AFTER_MS) : undefined
  const kill = setTimeout(() => {
    timedOut = true
    ctrl.abort()
  }, TIMEOUT_MS)
  try {
    await fetch(url, { mode: 'no-cors', cache: 'no-store', signal: ctrl.signal })
    return classify(true, Math.round(performance.now() - started), false)
  } catch {
    return classify(false, Math.round(performance.now() - started), timedOut)
  } finally {
    clearTimeout(kill)
    if (slow) clearTimeout(slow)
  }
}
