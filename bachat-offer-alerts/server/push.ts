import webpush from 'web-push'
import type { Store, Subscriber } from './store.ts'

export interface PushPayload {
  title: string
  body: string
  url: string
  tag: string
  tier: 'extraordinary' | 'normal' | 'summary' | 'test'
  image?: string
}

export type PushResult = 'ok' | 'gone' | 'error'

export interface PushSender {
  publicKey: string
  send(sub: Subscriber, payload: PushPayload): Promise<PushResult>
}

/**
 * VAPID keys live in the database, made on first use, so the web service and the
 * GitHub Actions scanner share them with only DATABASE_URL to configure.
 */
export async function vapidKeys(store: Store): Promise<{ publicKey: string; privateKey: string }> {
  const existing = await store.getMeta('vapid')
  if (existing) return JSON.parse(existing)
  const won = await store.initMeta('vapid', JSON.stringify(webpush.generateVAPIDKeys()))
  return JSON.parse(won)
}

export async function webPushSender(store: Store, contact = process.env.BACHAT_CONTACT ?? 'https://bachat-offer-alerts.onrender.com'): Promise<PushSender> {
  const keys = await vapidKeys(store)
  return {
    publicKey: keys.publicKey,
    async send(sub, payload) {
      try {
        await webpush.sendNotification({ endpoint: sub.endpoint, keys: sub.keys }, JSON.stringify(payload), {
          vapidDetails: { subject: contact, publicKey: keys.publicKey, privateKey: keys.privateKey },
          TTL: payload.tier === 'extraordinary' ? 3600 : 6 * 3600,
          urgency: payload.tier === 'extraordinary' ? 'high' : 'normal',
          topic: payload.tag.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 32) || undefined,
          timeout: 10_000,
        })
        return 'ok'
      } catch (err) {
        const code = (err as { statusCode?: number }).statusCode
        if (code === 404 || code === 410) return 'gone'
        console.error(`push to ${sub.id.slice(0, 8)} failed: ${code ?? ''} ${(err as Error).message}`)
        return 'error'
      }
    },
  }
}
