import * as React from 'react'

import { useAuth } from '@/lib/auth'

// Écoute les événements poussés par le serveur (Server-Sent Events) pour
// qu'une action faite sur un autre appareil (admin ↔ technicien — supprimer,
// restaurer, changer un statut…) apparaisse tout de suite ici, sans avoir à
// changer de page et y revenir. EventSource ne prend pas d'en-tête custom,
// la session passe donc en paramètre d'URL. Reconnexion automatique gérée
// nativement par le navigateur en cas de coupure.
export function useLiveEvents(types: string[], onEvent: () => void) {
  const { session } = useAuth()
  const onEventRef = React.useRef(onEvent)
  React.useEffect(() => {
    onEventRef.current = onEvent
  })

  const typesKey = types.join(',')

  React.useEffect(() => {
    if (!session) return
    const source = new EventSource(`/api/events?sessionId=${encodeURIComponent(session.sessionId)}`)
    const handler = () => onEventRef.current()
    for (const type of typesKey.split(',')) {
      source.addEventListener(type, handler)
    }
    return () => {
      for (const type of typesKey.split(',')) {
        source.removeEventListener(type, handler)
      }
      source.close()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, typesKey])
}
