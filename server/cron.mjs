import cron from 'node-cron'

import { db, now, uuid } from './db.mjs'
import { sendMail } from './mailer.mjs'
import { runScheduledBackup } from './backup.mjs'
import { deliverPendingPush } from './push.mjs'

// Utilisée pour construire le lien de consultation dans les emails envoyés
// depuis le cron (pas de `req` disponible ici, contrairement aux routes) —
// configurable via server/.env, sinon on retombe sur le dev local.
const PUBLIC_URL = process.env.PUBLIC_URL ?? 'http://localhost:5173'

// Voir la même précaution dans routes/documents.mjs::escapeHtml — un nom
// client saisi par un admin/technicien n'est pas digne de confiance tel quel
// dans un email HTML.
function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
}

function insertNotification(role, technicienId, teamId, type, title, body, data = {}) {
  db.prepare(
    'INSERT INTO notifications (id, recipient_role, recipient_technicien_id, team_id, type, title, body, data, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
  ).run(uuid(), role, technicienId, teamId, type, title, body, JSON.stringify(data), now())
}

function runIntervationReminders() {
  const rows = db
    .prepare(
      `SELECT * FROM interventions
       WHERE status = 'assignee' AND technicien_id IS NOT NULL AND reminder_count < 3
       AND datetime(assigned_at, '+' || ((reminder_count + 1) * 10) || ' minutes') <= datetime('now')`,
    )
    .all()

  for (const i of rows) {
    const label = `Rappel ${i.reminder_count + 1}/3 : ${i.client_first_name} ${i.client_last_name} attend toujours`
    insertNotification(
      'technicien',
      i.technicien_id,
      i.team_id,
      'reminder',
      `⏰ ${label}`,
      i.address ?? '',
      { intervention_id: i.id },
    )
    db.prepare('UPDATE interventions SET reminder_count = reminder_count + 1 WHERE id = ?').run(i.id)
  }
}

const DAILY_MESSAGES = [
  "Le service est ouvert ! Prêt à cartonner aujourd'hui ? 💪",
  'C\'est parti pour une nouvelle journée de dépannage ! 🔧',
  'Le service démarre — à toi de jouer ! ⚡',
  'Nouvelle journée, nouvelles interventions. On y va ! 🚀',
  'Service ouvert — reste joignable, les clients comptent sur toi 📞',
  "C'est l'heure ! Le service PSE est lancé pour la journée 🛠️",
  'Journée qui commence, énergie à fond ! Le service est ouvert 🔥',
]

function runDailyServiceMessage() {
  const techs = db.prepare('SELECT id, team_id FROM technicians WHERE active = 1').all()
  for (const t of techs) {
    const msg = DAILY_MESSAGES[Math.floor(Math.random() * DAILY_MESSAGES.length)]
    insertNotification('technicien', t.id, t.team_id, 'daily_message', 'Service ouvert', msg)
  }
}

// Relance automatique des factures impayées depuis plus de 15 jours (2
// relances max, espacées d'au moins 15 jours) — Khosmos annonce cette
// fonctionnalité comme "à venir" pour eux ; ici elle tourne réellement.
async function runAutoRelances() {
  const rows = db
    .prepare(
      `SELECT * FROM documents
       WHERE kind = 'facture' AND status = 'emise' AND email IS NOT NULL AND email != ''
       AND relance_count < 2
       AND datetime(issue_date) <= datetime('now', '-15 days')
       AND (last_relance_at IS NULL OR datetime(last_relance_at) <= datetime('now', '-15 days'))`,
    )
    .all()

  for (const doc of rows) {
    const items = JSON.parse(doc.items)
    const ht = items.reduce((sum, i) => sum + i.quantity * i.unitPrice, 0)
    const ttc = (ht * (1 + doc.vat_rate / 100)).toFixed(2)
    const link = `${PUBLIC_URL}/facture/${doc.public_token}`

    try {
      await sendMail({
        to: doc.email,
        subject: `Rappel — Facture ${doc.number} en attente de paiement`,
        html: `<p>Bonjour ${escapeHtml(doc.client_first_name)},</p>
          <p>Nous n'avons pas encore reçu le règlement de votre facture <strong>${doc.number}</strong> (${ttc} € TTC).</p>
          <p><a href="${link}">${link}</a></p>
          <p>Merci de bien vouloir régulariser dans les meilleurs délais.</p>
          <p>PSE Dépannage</p>`,
      })
      db.prepare('UPDATE documents SET relance_count = relance_count + 1, last_relance_at = ? WHERE id = ?').run(
        now(),
        doc.id,
      )
      insertNotification(
        'admin',
        null,
        doc.team_id,
        'relance_auto',
        '📧 Relance automatique envoyée',
        `${doc.client_first_name} ${doc.client_last_name} — ${doc.number}`,
        { document_id: doc.id },
      )
    } catch {
      // email non configuré ou erreur d'envoi — on retentera au prochain passage
    }
  }
}

// Purge les notifications lues depuis plus de 24h — une fois consultée, une
// notif n'a plus d'utilité et ça évite d'accumuler indéfiniment des lignes
// dans l'onglet Notifs (celles non lues, elles, restent tant qu'on ne les a
// pas ouvertes).
function runNotificationsCleanup() {
  db.prepare("DELETE FROM notifications WHERE read_at IS NOT NULL AND datetime(read_at, '+24 hours') <= datetime('now')").run()
}

// Garde 30 jours de journal de connexion — assez pour repérer une attaque
// après coup (voir GET /api/auth/security/login-attempts), sans accumuler
// indéfiniment (chaque tentative, réussie ou non, écrit une ligne).
function runLoginAttemptsCleanup() {
  db.prepare("DELETE FROM login_attempts WHERE datetime(created_at, '+30 days') <= datetime('now')").run()
}

export function startCronJobs() {
  cron.schedule('*/10 * * * *', runIntervationReminders)
  // Fixé sur Europe/Paris (pas le fuseau système de la machine) pour bien
  // tomber à 19h heure française quel que soit l'endroit où le serveur tourne.
  cron.schedule('0 19 * * *', runDailyServiceMessage, { timezone: 'Europe/Paris' })
  cron.schedule('0 9 * * *', runAutoRelances, { timezone: 'Europe/Paris' })
  cron.schedule('* * * * *', deliverPendingPush)
  cron.schedule('*/30 * * * *', runNotificationsCleanup)
  cron.schedule('0 4 * * *', runLoginAttemptsCleanup, { timezone: 'Europe/Paris' })
  // Sauvegarde complète de la base en pleine nuit, hors heures de service.
  cron.schedule('30 3 * * *', runScheduledBackup, { timezone: 'Europe/Paris' })
}
