import { apiFetch } from '@/lib/api'

export interface PseNotification {
  id: string
  recipient_role: 'admin' | 'technicien'
  recipient_technicien_id: string | null
  type: string
  title: string
  body: string
  data: Record<string, unknown>
  read_at: string | null
  created_at: string
  // Écran à ouvrir (fiche, devis, facture, paiements…), calculé par le serveur.
  url?: string
}

export async function listNotifications(sessionId: string) {
  return apiFetch<PseNotification[]>('/api/notifications', { sessionId })
}

export async function markNotificationRead(sessionId: string, id: string) {
  await apiFetch(`/api/notifications/${id}/read`, { method: 'POST', sessionId })
}

export async function markAllNotificationsRead(sessionId: string) {
  await apiFetch('/api/notifications/read-all', { method: 'POST', sessionId })
}

export async function deleteNotification(sessionId: string, id: string) {
  await apiFetch(`/api/notifications/${id}`, { method: 'DELETE', sessionId })
}

export async function clearReadNotifications(sessionId: string) {
  return apiFetch<{ ok: true; deleted: number }>('/api/notifications/read', { method: 'DELETE', sessionId })
}

// Pastille sur l'icône de l'app (écran d'accueil), quand le téléphone le permet.
export function setAppBadge(count: number) {
  const nav = navigator as Navigator & { setAppBadge?: (n?: number) => Promise<void>; clearAppBadge?: () => Promise<void> }
  try {
    if (count > 0) nav.setAppBadge?.(count)?.catch(() => {})
    else nav.clearAppBadge?.()?.catch(() => {})
  } catch {
    // non pris en charge
  }
}

export async function broadcastUrgentNotification(sessionId: string, title: string, body: string) {
  await apiFetch('/api/notifications/broadcast', { method: 'POST', sessionId, body: { title, body } })
}

export async function getNotificationPrefs(sessionId: string) {
  return apiFetch<Record<string, boolean>>('/api/notifications/prefs', { sessionId })
}

export async function setNotificationPref(sessionId: string, type: string, enabled: boolean) {
  await apiFetch('/api/notifications/prefs', { method: 'PATCH', sessionId, body: { type, enabled } })
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)))
}

export async function subscribeToPush(sessionId: string) {
  const vapidKey = import.meta.env.VITE_VAPID_PUBLIC_KEY
  if (!vapidKey) throw new Error('Clé VAPID non configurée.')

  const registration = await navigator.serviceWorker.ready
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') throw new Error('Permission refusée.')

  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(vapidKey),
  })

  const json = subscription.toJSON()
  await apiFetch('/api/notifications/push-subscription', {
    method: 'POST',
    sessionId,
    body: { endpoint: json.endpoint, p256dh: json.keys?.p256dh, auth: json.keys?.auth },
  })
}
