import type { ScanSummary, SourceStatus } from '../shared/api-types.ts'
import { normalizeSettings } from '../shared/types.ts'
import type { Deal, Settings } from '../shared/types.ts'

export type FeedDeal = Deal & { firstSeen: string }
export interface Feed {
  deals: FeedDeal[]
  sources: SourceStatus[]
  lastScan: ScanSummary | null
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(path, { ...init, headers: { 'Content-Type': 'application/json', ...init.headers } })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((body as { error?: string; detail?: string }).detail ?? (body as { error?: string }).error ?? `HTTP ${res.status}`)
  return body as T
}

export const getFeed = () => call<Feed>('/api/deals')
export const scanNow = () => call<{ fresh: boolean; summary: ScanSummary | null }>('/api/scan', { method: 'POST' })
export const getConfig = () => call<{ publicKey: string | null; storage: string }>('/api/config')

// ---- settings and subscription, kept in this browser ----

const SETTINGS_KEY = 'bachat:settings'
const SUB_KEY = 'bachat:subscription'

export interface SubRef {
  id: string
  token: string
}

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}
function write(key: string, value: unknown) {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* private mode: settings last for this visit */
  }
}

export const loadSettings = (): Settings => normalizeSettings(read(SETTINGS_KEY))
export const loadSub = (): SubRef | null => read<SubRef>(SUB_KEY)

/** Saves locally, and on the server when this browser gets alerts. */
export async function saveSettings(settings: Settings): Promise<Settings> {
  const clean = normalizeSettings(settings)
  write(SETTINGS_KEY, clean)
  const sub = loadSub()
  if (sub) {
    try {
      await call(`/api/subscriptions/${sub.id}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${sub.token}` },
        body: JSON.stringify({ settings: clean, tzOffset: new Date().getTimezoneOffset() }),
      })
    } catch (err) {
      if (/Unknown subscription/.test((err as Error).message)) write(SUB_KEY, null)
      else throw err
    }
  }
  return clean
}

// ---- web push ----

export type PushState = 'unsupported' | 'needs-install' | 'denied' | 'off' | 'on'

const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent)
const standalone = () => window.matchMedia?.('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true

export async function pushState(): Promise<PushState> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    return isIos() && !standalone() ? 'needs-install' : 'unsupported'
  }
  if (Notification.permission === 'denied') return 'denied'
  const reg = await navigator.serviceWorker.getRegistration()
  const sub = await reg?.pushManager.getSubscription()
  return sub && loadSub() ? 'on' : 'off'
}

function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const pad = '='.repeat((4 - (base64url.length % 4)) % 4)
  const raw = atob((base64url + pad).replace(/-/g, '+').replace(/_/g, '/'))
  const out = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

export async function enablePush(settings: Settings): Promise<void> {
  const { publicKey } = await getConfig()
  if (!publicKey) throw new Error('The server is still starting. Try again in a minute.')
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') throw new Error('Notifications are blocked for this site. Allow them in the browser’s site settings.')
  const reg = await navigator.serviceWorker.register('/sw.js')
  await navigator.serviceWorker.ready
  let sub = await reg.pushManager.getSubscription()
  // A subscription made with another server key can't receive our pushes.
  if (sub && sub.options.applicationServerKey) {
    const current = new Uint8Array(sub.options.applicationServerKey)
    const wanted = keyBytes(publicKey)
    if (current.length !== wanted.length || current.some((b, i) => b !== wanted[i])) {
      await sub.unsubscribe()
      sub = null
    }
  }
  sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) })
  const ref = await call<SubRef>('/api/subscriptions', {
    method: 'POST',
    body: JSON.stringify({ subscription: sub.toJSON(), settings: normalizeSettings(settings), tzOffset: new Date().getTimezoneOffset() }),
  })
  write(SUB_KEY, { id: ref.id, token: ref.token })
}

export async function disablePush(): Promise<void> {
  const ref = loadSub()
  const reg = await navigator.serviceWorker.getRegistration()
  await (await reg?.pushManager.getSubscription())?.unsubscribe()
  if (ref) {
    await call(`/api/subscriptions/${ref.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${ref.token}` } }).catch(() => undefined)
  }
  write(SUB_KEY, null)
}

export async function testPush(): Promise<void> {
  const ref = loadSub()
  if (!ref) throw new Error('Turn on alerts first.')
  await call(`/api/subscriptions/${ref.id}/test`, { method: 'POST', headers: { Authorization: `Bearer ${ref.token}` } })
}
