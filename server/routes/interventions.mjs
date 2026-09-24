import { Router } from 'express'

import { db, now, uuid } from '../db.mjs'
import { requireAdmin, requireAuth } from '../auth.mjs'
import { notifyTechnicien } from '../notify.mjs'
import { broadcast } from '../events.mjs'

export const interventionsRouter = Router()
interventionsRouter.use(requireAuth)

// MAX plutôt que COUNT : un COUNT désynchronise dès qu'une référence ne
// matche plus le motif attendu (déjà vécu sur la numérotation des devis/
// factures — voir documents.mjs). La colonne `reference` est UNIQUE au
// niveau de TOUTE la base (pas une contrainte composite par équipe), donc le
// prochain numéro doit être cherché tous équipes confondues, jamais scopé
// par team_id — sinon deux équipes qui démarrent chacune "à 1" se
// percutent sur le même INT-00001 (UNIQUE constraint failed).
function nextReference() {
  const rows = db.prepare("SELECT reference FROM interventions WHERE reference LIKE 'INT-%'").all()
  let max = 0
  for (const r of rows) {
    const n = parseInt(r.reference.slice(-5), 10)
    if (!isNaN(n) && n > max) max = n
  }
  return 'INT-' + String(max + 1).padStart(5, '0')
}

function toApi(row) {
  return { ...row, photos: JSON.parse(row.photos) }
}

interventionsRouter.get('/', (req, res) => {
  const rows =
    req.caller.role === 'admin'
      ? db.prepare('SELECT * FROM interventions WHERE team_id = ? ORDER BY created_at DESC').all(req.caller.team_id)
      : db
          .prepare('SELECT * FROM interventions WHERE team_id = ? AND technicien_id = ? ORDER BY created_at DESC')
          .all(req.caller.team_id, req.caller.technicien_id)
  res.json(rows.map(toApi))
})

interventionsRouter.get('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM interventions WHERE id = ?').get(req.params.id)
  if (!row || row.team_id !== req.caller.team_id) return res.status(404).json({ error: 'Intervention introuvable' })
  if (req.caller.role !== 'admin' && row.technicien_id !== req.caller.technicien_id) {
    return res.status(403).json({ error: 'Accès refusé' })
  }
  res.json(toApi(row))
})

interventionsRouter.post('/', requireAdmin, (req, res) => {
  const b = req.body ?? {}

  // Sans cette vérification, un admin pouvait assigner directement une
  // intervention (avec notification push) à un technicien d'une AUTRE
  // équipe en devinant/connaissant son id — même contrôle que POST /:id/assign,
  // qui l'a déjà (trouvé en auditant la cohérence entre les deux routes).
  if (b.technicienId) {
    const tech = db.prepare('SELECT id, team_id FROM technicians WHERE id = ?').get(b.technicienId)
    if (!tech || tech.team_id !== req.caller.team_id) {
      return res.status(400).json({ error: 'Technicien introuvable dans cette équipe' })
    }
  }

  const id = uuid()
  const status = b.technicienId ? 'assignee' : 'en_attente'
  const assignedAt = b.technicienId ? now() : null

  db.prepare(
    `INSERT INTO interventions
      (id, reference, client_first_name, client_last_name, phone, address, postal_code, city, intervention_type,
       description, amount, status, technicien_id, team_id, photos, reminder_count, created_by, created_at, assigned_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '[]', 0, ?, ?, ?)`,
  ).run(
    id,
    nextReference(),
    b.clientFirstName ?? '',
    b.clientLastName ?? '',
    b.phone ?? null,
    b.address ?? null,
    b.postalCode ?? null,
    b.city ?? null,
    b.interventionType ?? '',
    b.description ?? null,
    b.amount ?? null,
    status,
    b.technicienId ?? null,
    req.caller.team_id,
    req.sessionId,
    now(),
    assignedAt,
  )

  if (b.technicienId) {
    notifyTechnicien(
      b.technicienId,
      req.caller.team_id,
      'intervention_assignee',
      'Nouvelle intervention',
      `${b.clientFirstName ?? ''} ${b.clientLastName ?? ''} — ${b.interventionType ?? ''}`.trim(),
      { intervention_id: id, address: b.address },
    )
  }

  broadcast('interventions_changed', {}, req.caller.team_id)
  res.json(toApi(db.prepare('SELECT * FROM interventions WHERE id = ?').get(id)))
})

interventionsRouter.patch('/:id', requireAdmin, (req, res) => {
  const b = req.body ?? {}
  const existing = db.prepare('SELECT * FROM interventions WHERE id = ?').get(req.params.id)
  if (!existing || existing.team_id !== req.caller.team_id) {
    return res.status(404).json({ error: 'Intervention introuvable' })
  }

  db.prepare(
    `UPDATE interventions SET client_first_name=?, client_last_name=?, phone=?, address=?, postal_code=?, city=?,
     intervention_type=?, description=?, amount=? WHERE id=?`,
  ).run(
    b.clientFirstName ?? existing.client_first_name,
    b.clientLastName ?? existing.client_last_name,
    b.phone ?? existing.phone,
    b.address ?? existing.address,
    b.postalCode ?? existing.postal_code,
    b.city ?? existing.city,
    b.interventionType ?? existing.intervention_type,
    b.description ?? existing.description,
    b.amount ?? existing.amount,
    req.params.id,
  )

  broadcast('interventions_changed', {}, req.caller.team_id)
  res.json(toApi(db.prepare('SELECT * FROM interventions WHERE id = ?').get(req.params.id)))
})

// Photos prises sur le terrain (avant/après réparation) — le technicien
// assigné peut les ajouter, pas seulement l'admin, contrairement au reste de
// la fiche (client, adresse…) qui reste en lecture seule pour lui.
interventionsRouter.post('/:id/photos', (req, res) => {
  const { photos } = req.body ?? {}
  if (!Array.isArray(photos)) return res.status(400).json({ error: 'Photos invalides' })

  const existing = db.prepare('SELECT * FROM interventions WHERE id = ?').get(req.params.id)
  if (!existing || existing.team_id !== req.caller.team_id) {
    return res.status(404).json({ error: 'Intervention introuvable' })
  }
  if (req.caller.role !== 'admin' && existing.technicien_id !== req.caller.technicien_id) {
    return res.status(403).json({ error: 'Accès refusé' })
  }

  db.prepare('UPDATE interventions SET photos=? WHERE id=?').run(JSON.stringify(photos), req.params.id)
  broadcast('interventions_changed', {}, req.caller.team_id)
  res.json(toApi(db.prepare('SELECT * FROM interventions WHERE id = ?').get(req.params.id)))
})

interventionsRouter.delete('/:id', requireAdmin, (req, res) => {
  const existing = db.prepare('SELECT * FROM interventions WHERE id = ?').get(req.params.id)
  if (!existing || existing.team_id !== req.caller.team_id) {
    return res.status(404).json({ error: 'Intervention introuvable' })
  }
  db.prepare('DELETE FROM interventions WHERE id = ?').run(req.params.id)
  broadcast('interventions_changed', {}, req.caller.team_id)
  res.json({ ok: true })
})

interventionsRouter.post('/:id/assign', requireAdmin, (req, res) => {
  const { technicienId } = req.body ?? {}
  const existing = db.prepare('SELECT * FROM interventions WHERE id = ?').get(req.params.id)
  if (!existing || existing.team_id !== req.caller.team_id) {
    return res.status(404).json({ error: 'Intervention introuvable' })
  }
  const tech = db.prepare('SELECT * FROM technicians WHERE id = ?').get(technicienId)
  if (!tech || tech.team_id !== req.caller.team_id) {
    return res.status(400).json({ error: 'Technicien introuvable dans cette équipe' })
  }

  db.prepare(
    'UPDATE interventions SET technicien_id=?, status=?, assigned_at=?, reminder_count=0 WHERE id=?',
  ).run(technicienId, 'assignee', now(), req.params.id)

  const updated = db.prepare('SELECT * FROM interventions WHERE id = ?').get(req.params.id)
  notifyTechnicien(
    technicienId,
    req.caller.team_id,
    'intervention_assignee',
    'Nouvelle intervention',
    `${updated.client_first_name} ${updated.client_last_name} — ${updated.intervention_type}`.trim(),
    { intervention_id: updated.id, address: updated.address },
  )

  broadcast('interventions_changed', {}, req.caller.team_id)
  res.json(toApi(updated))
})

const STATUSES = ['en_attente', 'assignee', 'acceptee', 'en_cours', 'terminee', 'validee', 'facturee']
const STATUS_TIMESTAMP_COLUMN = {
  acceptee: 'accepted_at',
  en_cours: 'started_at',
  terminee: 'completed_at',
  validee: 'validated_at',
}

interventionsRouter.post('/:id/status', (req, res) => {
  const { status } = req.body ?? {}
  if (!STATUSES.includes(status)) return res.status(400).json({ error: 'Statut invalide' })

  const existing = db.prepare('SELECT * FROM interventions WHERE id = ?').get(req.params.id)
  if (!existing || existing.team_id !== req.caller.team_id) {
    return res.status(404).json({ error: 'Intervention introuvable' })
  }
  if (req.caller.role !== 'admin' && existing.technicien_id !== req.caller.technicien_id) {
    return res.status(403).json({ error: 'Accès refusé' })
  }

  const col = STATUS_TIMESTAMP_COLUMN[status]
  if (col) {
    db.prepare(`UPDATE interventions SET status=?, ${col}=? WHERE id=?`).run(status, now(), req.params.id)
  } else {
    db.prepare('UPDATE interventions SET status=? WHERE id=?').run(status, req.params.id)
  }

  broadcast('interventions_changed', {}, req.caller.team_id)
  res.json(toApi(db.prepare('SELECT * FROM interventions WHERE id = ?').get(req.params.id)))
})
