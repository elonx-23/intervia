// Petit bus d'événements en mémoire pour le push temps réel (Server-Sent
// Events) — un seul process Node local, pas besoin de Redis/pub-sub externe.
// Chaque connexion SSE active s'enregistre avec l'équipe de son abonné ;
// broadcast() n'écrit que vers les connexions de la même équipe — sinon une
// action chez une équipe rafraîchirait l'écran d'une autre équipe en direct.
const subscribers = new Set()

export function subscribe(res, teamId) {
  const entry = { res, teamId }
  subscribers.add(entry)
  return () => subscribers.delete(entry)
}

export function broadcast(type, data = {}, teamId) {
  const payload = `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`
  for (const sub of subscribers) {
    if (teamId && sub.teamId !== teamId) continue
    try {
      sub.res.write(payload)
    } catch {
      subscribers.delete(sub)
    }
  }
}
