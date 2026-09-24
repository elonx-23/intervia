import { Router } from 'express'

import { db } from '../db.mjs'
import { requireAdmin, requireAuth } from '../auth.mjs'

export const techniciansRouter = Router()
techniciansRouter.use(requireAuth)

// Liste (pour les menus d'assignation et la page d'administration) — admin
// uniquement. Les techniciens s'inscrivent eux-mêmes via le code d'équipe
// (Réglages → Techniciens) : aucune création manuelle par ici.
techniciansRouter.get('/', requireAdmin, (req, res) => {
  res.json(
    db.prepare('SELECT * FROM technicians WHERE team_id = ? ORDER BY first_name, last_name').all(req.caller.team_id),
  )
})

techniciansRouter.patch('/:id', requireAdmin, (req, res) => {
  const existing = db.prepare('SELECT * FROM technicians WHERE id = ?').get(req.params.id)
  if (!existing || existing.team_id !== req.caller.team_id) {
    return res.status(404).json({ error: 'Technicien introuvable' })
  }
  const { firstName, lastName, phone } = req.body ?? {}
  db.prepare('UPDATE technicians SET first_name=?, last_name=?, phone=? WHERE id=?').run(
    firstName,
    lastName,
    phone ?? null,
    req.params.id,
  )
  res.json(db.prepare('SELECT * FROM technicians WHERE id = ?').get(req.params.id))
})

// "Mettre en veille" doit couper l'accès tout de suite, pas seulement à la
// prochaine connexion — on supprime donc ses sessions actives en plus de
// désactiver son compte.
techniciansRouter.post('/:id/active', requireAdmin, (req, res) => {
  const existing = db.prepare('SELECT * FROM technicians WHERE id = ?').get(req.params.id)
  if (!existing || existing.team_id !== req.caller.team_id) {
    return res.status(404).json({ error: 'Technicien introuvable' })
  }
  const { active } = req.body ?? {}
  db.prepare('UPDATE technicians SET active=? WHERE id=?').run(active ? 1 : 0, req.params.id)
  db.prepare('UPDATE users SET active=? WHERE technicien_id=?').run(active ? 1 : 0, req.params.id)
  if (!active) {
    db.prepare('DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE technicien_id = ?)').run(req.params.id)
  }
  res.json(db.prepare('SELECT * FROM technicians WHERE id = ?').get(req.params.id))
})

techniciansRouter.delete('/:id', requireAdmin, (req, res) => {
  const existing = db.prepare('SELECT * FROM technicians WHERE id = ?').get(req.params.id)
  if (!existing || existing.team_id !== req.caller.team_id) {
    return res.status(404).json({ error: 'Technicien introuvable' })
  }
  // Le compte (users/sessions) rattaché à ce technicien doit être coupé lui
  // aussi, sinon "Supprimer" ne ferait rien pour son accès — il garderait
  // un accès complet et permanent malgré la suppression côté admin.
  db.prepare('DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE technicien_id = ?)').run(req.params.id)
  db.prepare('DELETE FROM users WHERE technicien_id = ?').run(req.params.id)
  db.prepare('DELETE FROM technicians WHERE id = ?').run(req.params.id)
  res.json({ ok: true })
})
