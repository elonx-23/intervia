import { db } from './db.mjs'

// L'ancien système (access_codes, nom d'utilisateur + code) a été retiré —
// seuls les comptes email/mot de passe (users + sessions) existent
// désormais. Les techniciens historiques doivent rejoindre leur équipe via
// le code d'équipe (Réglages → Techniciens).
export function getCaller(sessionId) {
  if (!sessionId) return null

  const session = db
    .prepare(
      `SELECT s.id AS id, u.id AS user_id, u.role, u.technicien_id, u.team_id, u.active
       FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.id = ? AND datetime(s.expires_at) > datetime('now')`,
    )
    .get(sessionId)
  if (!session) return null
  return session.active ? session : null
}

// La suspension d'équipe (abonnement Stripe impayé/résilié, voir
// stripeWebhook.mjs) n'était vérifiée QUE côté frontend — un sondage de
// /api/auth/session/active déclenchait l'écran <TeamSuspended/>, mais rien
// n'empêchait d'appeler l'API directement (curl, script) pour continuer à
// utiliser le service sans payer. Exportée séparément pour être appliquée
// aussi bien dans requireAuth que dans les routes qui résolvent le caller
// elles-mêmes (le SSE ne peut pas passer par le middleware habituel, voir
// routes/events.mjs). Un compte fraîchement inscrit (pas encore rattaché à
// une équipe, team_id NULL) n'est jamais concerné.
export function isTeamSuspended(teamId) {
  if (!teamId) return false
  const team = db.prepare('SELECT status FROM teams WHERE id = ?').get(teamId)
  return team?.status === 'suspended'
}

export function requireAuth(req, res, next) {
  const sessionId = req.header('x-session-id')
  const caller = getCaller(sessionId)
  if (!caller) return res.status(401).json({ error: 'Session invalide' })

  if (isTeamSuspended(caller.team_id)) {
    return res.status(402).json({ error: 'Abonnement suspendu — régularise le paiement pour continuer.' })
  }

  req.caller = caller
  req.sessionId = sessionId
  next()
}

export function requireAdmin(req, res, next) {
  if (req.caller.role !== 'admin') return res.status(403).json({ error: 'Accès refusé' })
  next()
}

// Forme de session renvoyée au client pour un compte "nouveau système"
// (users/sessions) — utilisée par le login email/mot de passe et par les
// routes qui font évoluer le compte (rejoindre/créer une équipe), pour
// renvoyer une session à jour sans que le client ait à se reconnecter.
export function sessionPayloadForUser(user, sessionId) {
  return {
    sessionId,
    username: user.email,
    role: user.role,
    teamId: user.team_id,
    technicienId: user.technicien_id,
    technicienFirstName: null,
    technicienLastName: null,
    label: null,
    firstName: user.first_name,
    lastName: user.last_name,
    email: user.email,
    phone: null,
  }
}
