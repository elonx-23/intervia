import { Router } from 'express'

import { db, now, uuid } from '../db.mjs'
import { requireAuth } from '../auth.mjs'

export const reportsRouter = Router()
reportsRouter.use(requireAuth)

// Un technicien ne peut faire un rapport que sur une fiche qui lui est/était
// assignée dans son équipe active ; l'admin peut en faire sur n'importe
// quelle fiche de l'équipe — même contrôle d'accès que le reste (fiches,
// devis/factures).
function canAccessIntervention(caller, intervention) {
  if (!intervention || intervention.team_id !== caller.team_id) return false
  if (caller.role === 'admin') return true
  return intervention.technicien_id === caller.technicien_id
}

reportsRouter.post('/', (req, res) => {
  const { interventionId, notes } = req.body ?? {}
  const intervention = db.prepare('SELECT * FROM interventions WHERE id = ?').get(interventionId)
  if (!canAccessIntervention(req.caller, intervention)) {
    return res.status(404).json({ error: 'Intervention introuvable' })
  }

  const id = uuid()
  const createdAt = now()
  db.prepare(
    'INSERT INTO intervention_reports (id, intervention_id, team_id, technicien_id, notes, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
  ).run(id, interventionId, req.caller.team_id, req.caller.technicien_id, notes ?? '', req.sessionId, createdAt)

  res.json({ id, intervention_id: interventionId, team_id: req.caller.team_id, technicien_id: req.caller.technicien_id, notes: notes ?? '', created_at: createdAt })
})

// Liste pour l'onglet Factures (affichés ensemble, teinte différente côté
// client) — jointure directe avec l'intervention pour tout avoir en un seul
// aller-retour (regénérer le PDF n'a pas besoin d'un deuxième appel).
reportsRouter.get('/', (req, res) => {
  const rows =
    req.caller.role === 'admin'
      ? db
          .prepare(
            `SELECT r.*, i.reference AS i_reference, i.client_first_name AS i_client_first_name,
                    i.client_last_name AS i_client_last_name, i.address AS i_address,
                    i.intervention_type AS i_intervention_type, i.description AS i_description,
                    i.created_at AS i_created_at, i.started_at AS i_started_at, i.completed_at AS i_completed_at
             FROM intervention_reports r JOIN interventions i ON i.id = r.intervention_id
             WHERE r.team_id = ? ORDER BY r.created_at DESC`,
          )
          .all(req.caller.team_id)
      : db
          .prepare(
            `SELECT r.*, i.reference AS i_reference, i.client_first_name AS i_client_first_name,
                    i.client_last_name AS i_client_last_name, i.address AS i_address,
                    i.intervention_type AS i_intervention_type, i.description AS i_description,
                    i.created_at AS i_created_at, i.started_at AS i_started_at, i.completed_at AS i_completed_at
             FROM intervention_reports r JOIN interventions i ON i.id = r.intervention_id
             WHERE r.team_id = ? AND r.technicien_id = ? ORDER BY r.created_at DESC`,
          )
          .all(req.caller.team_id, req.caller.technicien_id)
  res.json(rows)
})

reportsRouter.get('/by-intervention/:interventionId', (req, res) => {
  const intervention = db.prepare('SELECT * FROM interventions WHERE id = ?').get(req.params.interventionId)
  if (!canAccessIntervention(req.caller, intervention)) {
    return res.status(404).json({ error: 'Intervention introuvable' })
  }
  const rows = db
    .prepare('SELECT * FROM intervention_reports WHERE intervention_id = ? ORDER BY created_at DESC')
    .all(req.params.interventionId)
  res.json(rows)
})
