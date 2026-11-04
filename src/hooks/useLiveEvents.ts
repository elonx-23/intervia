import * as React from 'react'

import { useAuth } from '@/lib/auth'

// Écoute les événements poussés par le serveur (Server-Sent Events) pour
// qu'une action faite sur un autre appareil (admin ↔ technicien — supprimer,
// restaurer, changer un statut…) apparaisse tout de suite ici, sans avoir à
// changer de page et y revenir.
//
// UNE SEULE connexion pour toute l'app, partagée par tous les composants qui
// écoutent : avant, chaque composant ouvrait la sienne — une fiche en ouvrait
// 4 ou 5, le navigateur atteignait sa limite de 6 connexions par site, et la
// page suivante restait bloquée jusqu'à 30 s en attendant une place libre.
// EventSource ne prend pas d'en-tête custom : la session passe en paramètre
// d'URL. Reconnexion automatique gérée nativement par le navigateur.

type Listener = () => void

let shared: { sessionId: string; source: EventSource; listeners: Map<string, Set<Listener>> } | null = null

function subscribe(sessionId: string, types: string[], listener: Listener) {
  if (!shared || shared.sessionId !== sessionId) {
    shared?.source.close()
    shared = {
      sessionId,
      source: new EventSource(`/api/events?sessionId=${encodeURIComponent(sessionId)}`),
      listeners: new Map(),
    }
  }
  const current = shared
  for (const type of types) {
    let set = current.listeners.get(type)
    if (!set) {
      set = new Set()
      current.listeners.set(type, set)
      // Un seul écouteur natif par type d'événement, qui relaie à tous les abonnés.
      const relay = set
      current.source.addEventListener(type, () => {
        for (const l of [...relay]) l()
      })
    }
    set.add(listener)
  }
  return () => {
    for (const type of types) current.listeners.get(type)?.delete(listener)
    // Plus personne n'écoute : on ferme la connexion (rouverte au prochain abonnement).
    const anyLeft = [...current.listeners.values()].some((s) => s.size > 0)
    if (!anyLeft && shared === current) {
      current.source.close()
      shared = null
    }
  }
}

export function useLiveEvents(types: string[], onEvent: () => void) {
  const { session } = useAuth()
  const onEventRef = React.useRef(onEvent)
  React.useEffect(() => {
    onEventRef.current = onEvent
  })

  const typesKey = types.join(',')

  React.useEffect(() => {
    if (!session) return
    return subscribe(session.sessionId, typesKey.split(','), () => onEventRef.current())
  }, [session, typesKey])
}
