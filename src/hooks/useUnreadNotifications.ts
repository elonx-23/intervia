import * as React from 'react'

import { useLiveEvents } from '@/hooks/useLiveEvents'
import { useAuth } from '@/lib/auth'
import { listNotifications, setAppBadge } from '@/lib/notifications'

const POLL_INTERVAL_MS = 30000

// Compte de notifications non lues — utilisé par la bulle du header. Un
// simple hook (pas un contexte) : chaque page en a sa propre instance via
// Header, qui se remonte à chaque navigation, donc le compte repart toujours
// à jour au chargement d'un écran plutôt que de dépendre d'un polling en
// arrière-plan jamais rafraîchi entre deux pages.
export function useUnreadNotifications() {
  const { session, demoMode } = useAuth()
  const [unread, setUnread] = React.useState(0)

  const check = React.useCallback(async () => {
    if (!session || demoMode) return
    try {
      const list = await listNotifications(session.sessionId)
      const count = list.filter((n) => !n.read_at).length
      setUnread(count)
      setAppBadge(count)
    } catch {
      // silencieux : la cloche affichera juste 0
    }
  }, [session, demoMode])

  React.useEffect(() => {
    check()
    const interval = setInterval(check, POLL_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [check])
  // Nouvelle notification, ou lue sur un autre appareil : la cloche suit en direct.
  useLiveEvents(['notifications_changed'], check)

  return unread
}
