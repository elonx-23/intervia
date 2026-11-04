import { db } from './db.mjs'

// Copie des notifications ADMIN sur Pushover, avec un son propre à chaque
// type d'événement (les notifications web, elles, ne peuvent pas choisir
// leur son : c'est toujours celui du téléphone).
//
// Actif seulement si PUSHOVER_APP_TOKEN (application créée sur
// pushover.net/apps/build) et PUSHOVER_USER_KEY sont définis, et seulement
// pour les équipes de l'admin propriétaire de ce compte Pushover.

const SOUNDS = {
  fiche_depuis_appel: 'incoming', // un appel a donné une intervention à envoyer
  devis_signe: 'magic', // devis accepté
  facture_signee: 'classical',
  facture_creee: 'cashregister', // facture à encaisser
  relance_auto: 'pianobar',
}

function ownerEmails() {
  return String(process.env.PUSHOVER_ADMIN_EMAILS ?? process.env.TELNYX_ALLOWED_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
}

function isOwnerTeam(teamId) {
  const emails = ownerEmails()
  if (!teamId || emails.length === 0) return false
  return Boolean(
    db
      .prepare(
        `SELECT 1 FROM users u
         WHERE u.role = 'admin' AND LOWER(u.email) IN (${emails.map(() => '?').join(', ')})
           AND (u.team_id = ? OR EXISTS (SELECT 1 FROM team_memberships m WHERE m.user_id = u.id AND m.team_id = ?))
         LIMIT 1`,
      )
      .get(...emails, teamId, teamId),
  )
}

// Lien d'ouverture dans l'app selon ce que la notification concerne.
function linkFor(data) {
  const base = process.env.PUBLIC_URL
  if (!base) return null
  if (data?.intervention_id) return { url: `${base}/interventions/${data.intervention_id}`, title: 'Ouvrir la fiche' }
  if (data?.document_id) {
    const doc = db.prepare('SELECT kind FROM documents WHERE id = ?').get(data.document_id)
    if (doc) {
      const facture = doc.kind === 'facture'
      return { url: `${base}/${facture ? 'factures' : 'devis'}/${data.document_id}/modifier`, title: facture ? 'Ouvrir la facture' : 'Ouvrir le devis' }
    }
  }
  return null
}

export function pushoverNotifyAdmin(teamId, type, title, body, data = {}) {
  const token = process.env.PUSHOVER_APP_TOKEN
  const user = process.env.PUSHOVER_USER_KEY
  if (!token || !user || !isOwnerTeam(teamId)) return
  const link = linkFor(data)
  const params = new URLSearchParams({
    token,
    user,
    title: String(title ?? '').slice(0, 250),
    message: String(body ?? '').slice(0, 1024) || String(title ?? ''),
    sound: SOUNDS[type] ?? 'pushover',
    ...(link ? { url: link.url, url_title: link.title } : {}),
  })
  fetch('https://api.pushover.net/1/messages.json', { method: 'POST', body: params, signal: AbortSignal.timeout(15000) })
    .then(async (res) => {
      if (!res.ok) console.log(`[notifications] Pushover a refusé la notification : ${(await res.text()).slice(0, 200)}`)
    })
    .catch((e) => console.log(`[notifications] envoi Pushover échoué : ${e.message}`))
}
