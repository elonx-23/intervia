// Intervia — service worker : installabilité PWA + affichage des
// notifications push (web-push / VAPID).
self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('push', (event) => {
  if (!event.data) return
  let payload
  try {
    payload = event.data.json()
  } catch {
    payload = { title: 'Intervia', body: event.data.text() }
  }
  const url = payload.url || '/notifications'
  event.waitUntil(
    Promise.all([
      self.registration.showNotification(payload.title || 'Intervia', {
        body: payload.body,
        icon: '/icon-192.png?v=2',
        badge: '/icon-192.png?v=2',
        tag: payload.tag,
        data: { ...(payload.data ?? {}), url },
      }),
      // Pastille sur l'icône de l'app : nombre de notifications non lues.
      typeof payload.badge === 'number' && self.navigator.setAppBadge ? self.navigator.setAppBadge(payload.badge).catch(() => {}) : null,
    ]),
  )
})

// Toucher la notification ouvre directement le bon écran (fiche, devis,
// facture, paiement…), dans l'app déjà ouverte si elle l'est.
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = event.notification.data?.url || '/notifications'
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      const client = windows[0]
      if (client) {
        await client.focus()
        try {
          if ('navigate' in client) return await client.navigate(url)
        } catch {
          // page non contrôlée : l'app s'occupe de la navigation
        }
        return client.postMessage({ type: 'navigate', url })
      }
      return self.clients.openWindow(url)
    })(),
  )
})
