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

  event.waitUntil(
    self.registration.showNotification(payload.title || 'Intervia', {
      body: payload.body,
      icon: '/favicon.svg',
      badge: '/favicon.svg',
      data: payload.data ?? {},
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then((clients) => {
      if (clients.length > 0) return clients[0].focus()
      return self.clients.openWindow('/notifications')
    }),
  )
})
