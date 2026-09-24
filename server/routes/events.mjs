import { Router } from 'express'

import { getCaller, isTeamSuspended } from '../auth.mjs'
import { subscribe } from '../events.mjs'

export const eventsRouter = Router()

// EventSource (API navigateur native pour le SSE) ne peut pas envoyer
// d'en-têtes personnalisés — la session passe donc en paramètre d'URL ici,
// contrairement au reste de l'API qui utilise x-session-id en en-tête. Cette
// route résout le caller elle-même (pas de middleware requireAuth possible
// ici), donc la vérification de suspension d'équipe doit être répétée
// explicitement — voir auth.mjs::isTeamSuspended.
eventsRouter.get('/', (req, res) => {
  const caller = getCaller(req.query.sessionId)
  if (!caller || isTeamSuspended(caller.team_id)) return res.status(401).end()

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  })
  res.write(':ok\n\n')

  const unsubscribe = subscribe(res, caller.team_id)
  // Anti-timeout des proxys/navigateurs sur une connexion inactive.
  const heartbeat = setInterval(() => {
    try {
      res.write(':ping\n\n')
    } catch {
      // la connexion sera nettoyée par l'event 'close' ci-dessous
    }
  }, 25000)

  req.on('close', () => {
    clearInterval(heartbeat)
    unsubscribe()
  })
})
