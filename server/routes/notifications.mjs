import { Router } from 'express'

import { db, now, uuid } from '../db.mjs'
import { requireAdmin, requireAuth } from '../auth.mjs'
import { ADMIN_NOTIFICATION_TYPES, ALL_NOTIFICATION_TYPES, TECHNICIEN_NOTIFICATION_TYPES, notifyTechnicien } from '../notify.mjs'

export const notificationsRouter = Router()
notificationsRouter.use(requireAuth)

function toApi(row) {
  return { ...row, data: JSON.parse(row.data) }
}

notificationsRouter.get('/', (req, res) => {
  const rows =
    req.caller.role === 'admin'
      ? db
          .prepare(
            "SELECT * FROM notifications WHERE recipient_role = 'admin' AND team_id = ? ORDER BY created_at DESC LIMIT 200",
          )
          .all(req.caller.team_id)
      : db
          .prepare(
            "SELECT * FROM notifications WHERE recipient_role = 'technicien' AND team_id = ? AND recipient_technicien_id = ? ORDER BY created_at DESC LIMIT 200",
          )
          .all(req.caller.team_id, req.caller.technicien_id)
  res.json(rows.map(toApi))
})

notificationsRouter.post('/:id/read', (req, res) => {
  if (req.caller.role === 'admin') {
    db.prepare("UPDATE notifications SET read_at=? WHERE id=? AND recipient_role='admin' AND team_id=?").run(
      now(),
      req.params.id,
      req.caller.team_id,
    )
  } else {
    db.prepare(
      "UPDATE notifications SET read_at=? WHERE id=? AND recipient_role='technicien' AND team_id=? AND recipient_technicien_id=?",
    ).run(now(), req.params.id, req.caller.team_id, req.caller.technicien_id)
  }
  res.json({ ok: true })
})

notificationsRouter.post('/read-all', (req, res) => {
  if (req.caller.role === 'admin') {
    db.prepare("UPDATE notifications SET read_at=? WHERE recipient_role='admin' AND team_id=? AND read_at IS NULL").run(
      now(),
      req.caller.team_id,
    )
  } else {
    db.prepare(
      "UPDATE notifications SET read_at=? WHERE recipient_role='technicien' AND team_id=? AND recipient_technicien_id=? AND read_at IS NULL",
    ).run(now(), req.caller.team_id, req.caller.technicien_id)
  }
  res.json({ ok: true })
})

notificationsRouter.post('/broadcast', requireAdmin, (req, res) => {
  const { title, body } = req.body ?? {}
  const techs = db.prepare('SELECT id FROM technicians WHERE active = 1 AND team_id = ?').all(req.caller.team_id)
  for (const t of techs) {
    notifyTechnicien(t.id, req.caller.team_id, 'urgent', title, body)
  }
  res.json({ ok: true, count: techs.length })
})

// Préférences par personne : quels types de notifications elle veut
// recevoir — technicien et admin n'ont pas la même liste (l'admin a plus
// d'options, voir notify.mjs), on ne renvoie donc que celle qui concerne le
// rôle de l'appelant, pas la liste complète.
notificationsRouter.get('/prefs', (req, res) => {
  const types = req.caller.role === 'admin' ? ADMIN_NOTIFICATION_TYPES : TECHNICIEN_NOTIFICATION_TYPES
  const rows = db.prepare('SELECT type, enabled FROM notification_prefs WHERE user_id = ?').all(req.caller.user_id)
  const saved = new Map(rows.map((r) => [r.type, !!r.enabled]))
  // Absent de la table = activé par défaut (voir le commentaire sur la
  // table dans db.mjs) — toujours renvoyer une valeur pour chaque type
  // connu, jamais juste ce qui a été explicitement enregistré.
  const prefs = Object.fromEntries(types.map((t) => [t, saved.get(t) ?? true]))
  res.json(prefs)
})

notificationsRouter.patch('/prefs', (req, res) => {
  const { type, enabled } = req.body ?? {}
  if (!ALL_NOTIFICATION_TYPES.includes(type) || typeof enabled !== 'boolean') {
    return res.status(400).json({ error: 'Requête invalide' })
  }
  db.prepare(
    'INSERT INTO notification_prefs (user_id, type, enabled) VALUES (?, ?, ?) ON CONFLICT(user_id, type) DO UPDATE SET enabled = excluded.enabled',
  ).run(req.caller.user_id, type, enabled ? 1 : 0)
  res.json({ ok: true })
})

notificationsRouter.post('/push-subscription', (req, res) => {
  const { endpoint, p256dh, auth } = req.body ?? {}
  db.prepare(
    `INSERT INTO push_subscriptions (id, recipient_role, recipient_technicien_id, team_id, endpoint, p256dh, auth, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(endpoint) DO UPDATE SET p256dh=excluded.p256dh, auth=excluded.auth,
       recipient_role=excluded.recipient_role, recipient_technicien_id=excluded.recipient_technicien_id, team_id=excluded.team_id`,
  ).run(uuid(), req.caller.role, req.caller.technicien_id, req.caller.team_id, endpoint, p256dh, auth, now())
  res.json({ ok: true })
})
