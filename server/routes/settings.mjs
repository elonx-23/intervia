import { Router } from 'express'

import { requireAdmin, requireAuth } from '../auth.mjs'
import { db, getSetting, setSetting } from '../db.mjs'

export const settingsRouter = Router()
settingsRouter.use(requireAuth)

// Valeurs de départ si l'entreprise n'a encore rien configuré — reprennent
// les informations déjà en dur ailleurs dans l'app avant ce réglage.
const DEFAULT_COMPANY = {
  name: 'PSE DÉPANNAGE',
  legalForm: 'SARL',
  address: '58 rue de Monceau, 75008 Paris',
  siret: '99474318500013',
  vatNumber: 'FR26994743185',
  naf: '4322A',
  vatRegime: 'TVA sur les encaissements',
  phone: '',
  email: '',
  logoUrl: '',
}

// Lu par tout le monde (nécessaire pour générer les PDF de devis/factures
// depuis n'importe quel compte), modifiable par l'admin uniquement. Clé
// préfixée par équipe (voir getSetting/setSetting dans db.mjs) — chaque
// équipe a ses propres coordonnées d'entreprise.
settingsRouter.get('/company', (req, res) => {
  res.json({ ...DEFAULT_COMPANY, ...(getSetting('company', req.caller.team_id) ?? {}) })
})

settingsRouter.patch('/company', requireAdmin, (req, res) => {
  const current = { ...DEFAULT_COMPANY, ...(getSetting('company', req.caller.team_id) ?? {}) }
  const updated = { ...current, ...(req.body ?? {}) }
  setSetting('company', updated, req.caller.team_id)

  // `teams.name` est une colonne séparée des réglages "Entreprise" (elle
  // sert d'identité d'équipe : sélecteur multi-équipe, rappel en en-tête
  // pour les techniciens…) — sans cette synchronisation, renommer la
  // société ici ne se répercutait que sur les PDF (qui lisent les réglages
  // en direct), pas sur ce que voyaient les techniciens ailleurs dans
  // l'app : deux noms différents pour la même entreprise selon l'écran.
  if (updated.name && updated.name.trim()) {
    db.prepare('UPDATE teams SET name = ? WHERE id = ?').run(updated.name.trim(), req.caller.team_id)
  }

  res.json(updated)
})

settingsRouter.get('/region', (req, res) => {
  res.json({ region: getSetting('region', req.caller.team_id) ?? 'FR' })
})

settingsRouter.patch('/region', requireAdmin, (req, res) => {
  const { region } = req.body ?? {}
  if (!region) return res.status(400).json({ error: 'Région manquante.' })
  setSetting('region', region, req.caller.team_id)
  res.json({ region })
})
