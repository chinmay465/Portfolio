// Bachat service worker: shows push alerts and opens the deal when one is tapped.
// The app shell is cached so the installed app opens offline; data always comes from the network.
const SHELL = 'bachat-shell-v1'

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(SHELL).then((c) => c.addAll(['/', '/icon-192.png', '/badge-96.png'])).then(() => self.skipWaiting()))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== SHELL).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin || req.url.includes('/api/')) return
  if (req.mode === 'navigate') {
    event.respondWith(fetch(req).catch(() => caches.match('/')))
    return
  }
  if (req.url.includes('/assets/')) {
    event.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        const copy = res.clone()
        caches.open(SHELL).then((c) => c.put(req, copy))
        return res
      })),
    )
  }
})

self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = { title: 'Bachat', body: event.data ? event.data.text() : '' }
  }
  const urgent = data.tier === 'extraordinary'
  event.waitUntil(
    self.registration.showNotification(data.title || 'New offer', {
      body: data.body || '',
      icon: '/icon-192.png',
      badge: '/badge-96.png',
      image: data.image,
      tag: data.tag || undefined,
      renotify: Boolean(data.tag) && urgent,
      requireInteraction: urgent,
      vibrate: urgent ? [120, 60, 120, 60, 240] : [80],
      data: { url: data.url || '/' },
      actions: data.url && data.url !== '/' ? [{ action: 'open', title: 'Open deal' }, { action: 'app', title: 'All offers' }] : [],
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = event.action === 'app' ? '/' : (event.notification.data && event.notification.data.url) || '/'
  event.waitUntil(
    (async () => {
      const url = new URL(target, self.location.origin).href
      if (url.startsWith(self.location.origin)) {
        const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
        const win = wins.find((w) => w.url.startsWith(self.location.origin))
        if (win) {
          await win.focus()
          win.postMessage({ type: 'refresh' })
          return
        }
      }
      await self.clients.openWindow(url)
    })(),
  )
})
