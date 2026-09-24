import { Router } from 'express'

import { db } from '../db.mjs'
import { requireAdmin, requireAuth } from '../auth.mjs'

export const statsRouter = Router()
statsRouter.use(requireAuth)

// node:sqlite refuse de bind un paramètre `undefined` (crash 500 brut) —
// mieux vaut un 400 explicite si from/to manquent que de laisser fuiter une
// TypeError SQLite.
function requireRange(req, res) {
  const { from, to } = req.query
  if (!from || !to) {
    res.status(400).json({ error: 'Paramètres from/to requis' })
    return null
  }
  return { from, to }
}

function itemsTotalHT(items) {
  return items.reduce((sum, i) => sum + i.quantity * i.unitPrice, 0)
}

function totalTTC(doc) {
  const ht = itemsTotalHT(JSON.parse(doc.items))
  const remise = doc.discount_value ? (doc.discount_type === 'percent' ? ht * (doc.discount_value / 100) : doc.discount_value) : 0
  return Math.max(0, ht - remise) * (1 + doc.vat_rate / 100)
}

statsRouter.get('/admin', requireAdmin, (req, res) => {
  const range = requireRange(req, res)
  if (!range) return
  const { from, to } = range
  const teamId = req.caller.team_id

  const totalInterventions = db
    .prepare('SELECT COUNT(*) AS c FROM interventions WHERE team_id = ? AND date(created_at) BETWEEN ? AND ?')
    .get(teamId, from, to).c

  const factures = db
    .prepare("SELECT * FROM documents WHERE kind = 'facture' AND team_id = ? AND issue_date BETWEEN ? AND ?")
    .all(teamId, from, to)
  const ca = factures.reduce((sum, d) => sum + totalTTC(d), 0)
  const facturesPayees = factures.filter((d) => d.status === 'payee')
  const panierMoyen = facturesPayees.length
    ? facturesPayees.reduce((sum, d) => sum + totalTTC(d), 0) / facturesPayees.length
    : 0

  const enCours = db
    .prepare("SELECT COUNT(*) AS c FROM interventions WHERE status = 'en_cours' AND team_id = ?")
    .get(teamId).c
  const terminees = db
    .prepare(
      "SELECT COUNT(*) AS c FROM interventions WHERE status IN ('terminee','validee') AND team_id = ? AND date(created_at) BETWEEN ? AND ?",
    )
    .get(teamId, from, to).c

  const unpaid = db
    .prepare("SELECT * FROM documents WHERE kind = 'facture' AND status = 'emise' AND team_id = ?")
    .all(teamId)
  const caImpaye = unpaid.reduce((sum, d) => sum + totalTTC(d), 0)

  // Devis émis dans la période vs combien ont fini signés — indicateur de
  // performance commerciale, pas juste opérationnel.
  const devisTotal = db
    .prepare("SELECT COUNT(*) AS c FROM documents WHERE kind = 'devis' AND team_id = ? AND issue_date BETWEEN ? AND ?")
    .get(teamId, from, to).c
  const devisSignes = db
    .prepare(
      "SELECT COUNT(*) AS c FROM documents WHERE kind = 'devis' AND status = 'signe' AND team_id = ? AND issue_date BETWEEN ? AND ?",
    )
    .get(teamId, from, to).c
  const tauxConversion = devisTotal > 0 ? (devisSignes / devisTotal) * 100 : null

  // Répartition par technicien — même logique que /technicien (self-service),
  // rejouée pour chacun, pour que les chiffres se recoupent exactement entre
  // la vue admin et ce que chaque technicien voit de son côté.
  const techniciens = db.prepare('SELECT id, first_name, last_name FROM technicians WHERE active = 1 AND team_id = ?').all(teamId)
  const byTechnicien = techniciens.map((t) => {
    const totalI = db
      .prepare('SELECT COUNT(*) AS c FROM interventions WHERE technicien_id = ? AND team_id = ? AND date(created_at) BETWEEN ? AND ?')
      .get(t.id, teamId, from, to).c
    const caRow = db
      .prepare(
        "SELECT COALESCE(SUM(amount), 0) AS s FROM interventions WHERE technicien_id = ? AND team_id = ? AND status IN ('terminee','validee','facturee') AND date(created_at) BETWEEN ? AND ?",
      )
      .get(t.id, teamId, from, to)
    const term = db
      .prepare(
        "SELECT COUNT(*) AS c FROM interventions WHERE technicien_id = ? AND team_id = ? AND status IN ('terminee','validee') AND date(created_at) BETWEEN ? AND ?",
      )
      .get(t.id, teamId, from, to).c
    return {
      technicien_id: t.id,
      name: `${t.first_name} ${t.last_name}`.trim(),
      total_interventions: totalI,
      terminees: term,
      ca: caRow.s,
    }
  })
  byTechnicien.sort((a, b) => b.ca - a.ca)

  // Répartition par secteur d'activité (type d'intervention) — pour le
  // camembert du tableau de bord admin. Même définition du CA que
  // by_technicien (montant de la fiche, pas le TTC facturé) pour rester
  // cohérent entre les deux répartitions.
  const bySecteur = db
    .prepare(
      `SELECT intervention_type AS type, COUNT(*) AS total,
              COALESCE(SUM(CASE WHEN status IN ('terminee','validee','facturee') THEN amount ELSE 0 END), 0) AS ca
       FROM interventions
       WHERE team_id = ? AND date(created_at) BETWEEN ? AND ? AND intervention_type != ''
       GROUP BY intervention_type
       ORDER BY ca DESC`,
    )
    .all(teamId, from, to)

  res.json({
    total_interventions: totalInterventions,
    ca,
    en_cours: enCours,
    terminees,
    factures_impayees: unpaid.length,
    ca_impaye: caImpaye,
    panier_moyen: panierMoyen,
    devis_total: devisTotal,
    devis_signes: devisSignes,
    taux_conversion: tauxConversion,
    by_technicien: byTechnicien,
    by_secteur: bySecteur,
  })
})

// Série CA/jour sur la période — alimente le petit graphique du tableau de
// bord admin. Un jour sans facture apparaît quand même avec ca = 0 (pas de
// trou dans le graphique).
statsRouter.get('/admin/timeseries', requireAdmin, (req, res) => {
  const range = requireRange(req, res)
  if (!range) return
  const { from, to } = range
  const rows = db
    .prepare("SELECT * FROM documents WHERE kind = 'facture' AND team_id = ? AND issue_date BETWEEN ? AND ?")
    .all(req.caller.team_id, from, to)

  const byDay = new Map()
  for (const d of rows) {
    const day = d.issue_date.slice(0, 10)
    byDay.set(day, (byDay.get(day) ?? 0) + totalTTC(d))
  }

  // Formatage en date locale, jamais toISOString() (qui convertit en UTC et
  // décale la date d'un jour la nuit pour un fuseau en avance sur UTC).
  const isoLocal = (d) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

  const days = []
  const cur = new Date(`${from}T00:00:00`)
  const end = new Date(`${to}T00:00:00`)
  while (cur <= end) {
    const iso = isoLocal(cur)
    days.push({ date: iso, ca: Math.round((byDay.get(iso) ?? 0) * 100) / 100 })
    cur.setDate(cur.getDate() + 1)
  }
  res.json(days)
})

// Compte interventions/CA/terminées pour un technicien sur une fenêtre
// donnée — factorisé pour être rejoué à l'identique sur la période actuelle
// ET sur la période précédente (comparaison "vs période précédente").
function technicienCounts(technicienId, teamId, from, to) {
  const totalInterventions = db
    .prepare('SELECT COUNT(*) AS c FROM interventions WHERE technicien_id = ? AND team_id = ? AND date(created_at) BETWEEN ? AND ?')
    .get(technicienId, teamId, from, to).c
  const caRow = db
    .prepare(
      "SELECT COALESCE(SUM(amount), 0) AS s FROM interventions WHERE technicien_id = ? AND team_id = ? AND status IN ('terminee','validee','facturee') AND date(created_at) BETWEEN ? AND ?",
    )
    .get(technicienId, teamId, from, to)
  const terminees = db
    .prepare(
      "SELECT COUNT(*) AS c FROM interventions WHERE technicien_id = ? AND team_id = ? AND status IN ('terminee','validee') AND date(created_at) BETWEEN ? AND ?",
    )
    .get(technicienId, teamId, from, to).c
  return { total_interventions: totalInterventions, ca: caRow.s, terminees }
}

// Fenêtre immédiatement précédente, de même durée — sert de base à la
// comparaison "vs période précédente" affichée au technicien (élément de
// motivation plutôt qu'un chiffre brut isolé).
function previousRange(from, to) {
  const fromDate = new Date(`${from}T00:00:00`)
  const toDate = new Date(`${to}T00:00:00`)
  const spanDays = Math.round((toDate - fromDate) / 86400000) + 1
  const prevTo = new Date(fromDate)
  prevTo.setDate(prevTo.getDate() - 1)
  const prevFrom = new Date(prevTo)
  prevFrom.setDate(prevFrom.getDate() - (spanDays - 1))
  const isoLocal = (d) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  return { from: isoLocal(prevFrom), to: isoLocal(prevTo) }
}

statsRouter.get('/technicien', (req, res) => {
  if (req.caller.role !== 'technicien') return res.status(403).json({ error: 'Accès refusé' })
  const range = requireRange(req, res)
  if (!range) return
  const { from, to } = range
  const { technicien_id: technicienId, team_id: teamId } = req.caller

  const current = technicienCounts(technicienId, teamId, from, to)
  const prevRange = previousRange(from, to)
  const previous = technicienCounts(technicienId, teamId, prevRange.from, prevRange.to)

  // Répartition par secteur d'activité — même requête que l'admin, filtrée
  // sur ce seul technicien, pour le camembert de sa propre page stats.
  const bySecteur = db
    .prepare(
      `SELECT intervention_type AS type, COUNT(*) AS total,
              COALESCE(SUM(CASE WHEN status IN ('terminee','validee','facturee') THEN amount ELSE 0 END), 0) AS ca
       FROM interventions
       WHERE technicien_id = ? AND team_id = ? AND date(created_at) BETWEEN ? AND ? AND intervention_type != ''
       GROUP BY intervention_type
       ORDER BY ca DESC`,
    )
    .all(technicienId, teamId, from, to)

  res.json({
    total_interventions: current.total_interventions,
    ca: current.ca,
    terminees: current.terminees,
    total_interventions_prev: previous.total_interventions,
    ca_prev: previous.ca,
    terminees_prev: previous.terminees,
    by_secteur: bySecteur,
  })
})

// Série CA/jour du technicien sur la période — alimente son propre petit
// graphique (même principe que /admin/timeseries, scopé à ses fiches à lui).
statsRouter.get('/technicien/timeseries', (req, res) => {
  if (req.caller.role !== 'technicien') return res.status(403).json({ error: 'Accès refusé' })
  const range = requireRange(req, res)
  if (!range) return
  const { from, to } = range
  const rows = db
    .prepare(
      "SELECT date(created_at) AS day, COALESCE(SUM(amount), 0) AS ca FROM interventions WHERE technicien_id = ? AND team_id = ? AND status IN ('terminee','validee','facturee') AND date(created_at) BETWEEN ? AND ? GROUP BY day",
    )
    .all(req.caller.technicien_id, req.caller.team_id, from, to)
  const byDay = new Map(rows.map((r) => [r.day, r.ca]))

  const isoLocal = (d) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

  const days = []
  const cur = new Date(`${from}T00:00:00`)
  const end = new Date(`${to}T00:00:00`)
  while (cur <= end) {
    const iso = isoLocal(cur)
    days.push({ date: iso, ca: Math.round((byDay.get(iso) ?? 0) * 100) / 100 })
    cur.setDate(cur.getDate() + 1)
  }
  res.json(days)
})

statsRouter.get('/releve', (req, res) => {
  if (req.caller.role !== 'technicien') return res.status(403).json({ error: 'Accès refusé' })
  const range = requireRange(req, res)
  if (!range) return
  const { from, to } = range
  const rows = db
    .prepare(
      "SELECT * FROM interventions WHERE technicien_id = ? AND team_id = ? AND status IN ('terminee','validee') AND date(created_at) BETWEEN ? AND ? ORDER BY created_at ASC",
    )
    .all(req.caller.technicien_id, req.caller.team_id, from, to)
  res.json(rows.map((r) => ({ ...r, photos: JSON.parse(r.photos) })))
})
