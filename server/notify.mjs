import { db, now, uuid } from './db.mjs'
import { pushNotification } from './push.mjs'

// Liste fermée des types réglables depuis Réglages → Notifications — sert à
// la fois à valider ce qu'un PATCH peut modifier et à construire les deux
// listes affichées côté client (technicien vs admin, l'admin en a plus).
export const TECHNICIEN_NOTIFICATION_TYPES = ['intervention_assignee', 'urgent']
export const ADMIN_NOTIFICATION_TYPES = ['devis_signe', 'facture_signee', 'facture_creee', 'facture_payee_stripe']
export const ALL_NOTIFICATION_TYPES = [...TECHNICIEN_NOTIFICATION_TYPES, ...ADMIN_NOTIFICATION_TYPES]

// Envoi de la vraie notification push tout de suite après l'insertion en
// base (ex. dès qu'un admin distribue une fiche) plutôt que d'attendre le
// prochain passage du cron (jusqu'à 60s de délai) — jamais attendu par
// l'appelant (route déjà synchrone) et sans jamais faire planter l'appel si
// l'envoi push échoue (device hors-ligne…), le balayage cron reste le filet
// de secours pour ces cas-là.
function pushSoon(row) {
  pushNotification(row).catch(() => {})
}

// Absence de ligne = activé (voir le commentaire sur la table dans db.mjs).
function isEnabled(userId, type) {
  if (!userId) return true
  const row = db.prepare('SELECT enabled FROM notification_prefs WHERE user_id = ? AND type = ?').get(userId, type)
  return row ? !!row.enabled : true
}

// teamId obligatoire : une notification admin sans équipe précise
// atteindrait les admins de TOUTES les équipes une fois notifications.mjs
// filtré par team_id — l'appelant doit toujours pouvoir le fournir
// (déduit de req.caller.team_id, d'une fiche ou d'un document).
export function notifyAdmin(teamId, type, title, body, data = {}) {
  // Un seul admin par équipe dans le modèle actuel (compte créé à la
  // création de l'équipe, jamais plusieurs) — vérifier ses préférences
  // suffit donc à savoir si CE canal doit recevoir le type en question.
  const admin = db.prepare("SELECT id FROM users WHERE team_id = ? AND role = 'admin'").get(teamId)
  if (admin && !isEnabled(admin.id, type)) return

  const id = uuid()
  const createdAt = now()
  db.prepare(
    'INSERT INTO notifications (id, recipient_role, recipient_technicien_id, team_id, type, title, body, data, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
  ).run(id, 'admin', null, teamId, type, title, body, JSON.stringify(data), createdAt)
  pushSoon({ id, recipient_role: 'admin', recipient_technicien_id: null, team_id: teamId, title, body, data })
}

export function notifyTechnicien(technicienId, teamId, type, title, body, data = {}) {
  // Les préférences sont par personne, pas par adhésion — retrouver le
  // compte utilisateur propriétaire de cette ligne technicians (voir
  // team_memberships) pour vérifier son choix, valable dans toutes ses
  // équipes.
  const membership = db.prepare('SELECT user_id FROM team_memberships WHERE technicien_id = ?').get(technicienId)
  if (membership && !isEnabled(membership.user_id, type)) return

  const id = uuid()
  const createdAt = now()
  db.prepare(
    'INSERT INTO notifications (id, recipient_role, recipient_technicien_id, team_id, type, title, body, data, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
  ).run(id, 'technicien', technicienId, teamId, type, title, body, JSON.stringify(data), createdAt)
  pushSoon({ id, recipient_role: 'technicien', recipient_technicien_id: technicienId, team_id: teamId, title, body, data })
}
