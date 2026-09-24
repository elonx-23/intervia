import * as React from 'react'

import { useAuth } from '@/lib/auth'
import { listNotifications } from '@/lib/notifications'

const POLL_INTERVAL_MS = 30000

// Compte de notifications non lues — utilisé par la bulle du header. Un
// simple hook (pas un contexte) : chaque page en a sa propre instance via
// Header, qui se remonte à chaque navigation, donc le compte repart toujours
// à jour au chargement d'un écran plutôt que de dépendre d'un polling en
// arrière-plan jamais rafraîchi entre deux pages.
export function useUnreadNotifications() {
  const { session, demoMode } = useAuth()
  const [unread, setUnread] = React.useState(0)

  React.useEffect(() => {
    if (!session || demoMode) return
    let cancelled = false

    const check = async () => {
      try {
        const list = await listNotifications(session.sessionId)
        if (!cancelled) setUnread(list.filter((n) => !n.read_at).length)
      } catch {
        // silencieux : la cloche affichera juste 0
      }
    }

    check()
    const interval = setInterval(check, POLL_INTERVAL_MS)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [session, demoMode])

  return unread
}
