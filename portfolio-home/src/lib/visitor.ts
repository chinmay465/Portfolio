/**
 * Counts unique visitors with the Darshak service (darshak-visitor-counter/).
 *
 * Each browser gets one random id, kept in localStorage. The id is sent once per
 * browser session, and the server keeps one row per id, so moving between pages,
 * reloading or coming back later never adds a second entry. No cookies, no IP.
 *
 * Open the site once with `?notrack` to stop counting this browser (yourself);
 * `?track` undoes it.
 */

export const VISITOR_API = (import.meta.env.VITE_VISITOR_API ?? 'https://darshak-visitor-counter.onrender.com').replace(/\/$/, '')

export const ID_KEY = 'darshak:id'
export const OPT_OUT_KEY = 'darshak:optout'
export const SENT_KEY = 'darshak:sent'

export interface TrackEnv {
  location: Pick<Location, 'pathname' | 'search' | 'host'>
  referrer: string
  local: Storage
  session: Storage
  webdriver: boolean
  fetch: typeof fetch
  newId: () => string
}

function browserEnv(): TrackEnv {
  return {
    location: window.location,
    referrer: document.referrer,
    local: window.localStorage,
    session: window.sessionStorage,
    webdriver: navigator.webdriver,
    fetch: window.fetch.bind(window),
    newId: () => crypto.randomUUID(),
  }
}

/** An outside referrer only: page-to-page moves inside the site aren't a source. */
export function externalReferrer(referrer: string, host: string): string {
  try {
    return referrer && new URL(referrer).host !== host ? referrer : ''
  } catch {
    return ''
  }
}

/** Sends this browser's visit if it hasn't gone out this session. Never throws. */
export async function trackVisitor(env: TrackEnv = browserEnv(), api = VISITOR_API): Promise<'sent' | 'skipped'> {
  try {
    // Automated browsers (Playwright e2e runs, crawlers) aren't visitors.
    if (env.webdriver) return 'skipped'

    const params = new URLSearchParams(env.location.search)
    if (params.has('notrack')) env.local.setItem(OPT_OUT_KEY, '1')
    if (params.has('track')) env.local.removeItem(OPT_OUT_KEY)
    if (env.local.getItem(OPT_OUT_KEY) === '1') return 'skipped'
    if (env.session.getItem(SENT_KEY) === '1') return 'skipped'

    let id = env.local.getItem(ID_KEY)
    if (!id) {
      id = env.newId()
      env.local.setItem(ID_KEY, id)
    }

    // text/plain keeps this a CORS "simple" request: no preflight round trip.
    const res = await env.fetch(`${api}/api/visit`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ id, path: env.location.pathname, referrer: externalReferrer(env.referrer, env.location.host) }),
      keepalive: true,
      credentials: 'omit',
    })
    // Only mark the session as sent on success, so a sleeping server gets a retry next load.
    if (res.ok) env.session.setItem(SENT_KEY, '1')
    return res.ok ? 'sent' : 'skipped'
  } catch {
    // Storage blocked or the counter is down: the site carries on regardless.
    return 'skipped'
  }
}

/** Production builds of the live site only; dev servers and preview builds don't count. */
export function startVisitorTracking(): void {
  if (!import.meta.env.PROD || import.meta.env.VITE_HASH_ROUTER === '1' || import.meta.env.VITE_NO_TRACK === '1') return
  const go = () => void trackVisitor()
  if ('requestIdleCallback' in window) window.requestIdleCallback(go, { timeout: 4000 })
  else setTimeout(go, 1500)
}
