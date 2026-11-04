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

// ===== Règles de calcul (identiques côté admin et côté technicien) =====
// - Les jours sont ceux de Paris (une intervention à 0 h 30 compte pour ce
//   jour-là, pas pour la veille en heure UTC).
// - Une intervention « terminée » l'est aussi une fois validée ou facturée,
//   et compte à la date où elle a été terminée.
// - Les documents supprimés ne comptent jamais.
const DONE = "('terminee','validee','facturee')"
const DONE_AT = 'COALESCE(completed_at, validated_at, created_at)'

function parisOffsetMs(t) {
  const d = new Date(t)
  return new Date(d.toLocaleString('en-US', { timeZone: 'Europe/Paris' })) - new Date(d.toLocaleString('en-US', { timeZone: 'UTC' }))
}
// Minuit à Paris pour « AAAA-MM-JJ », en instant UTC (ISO).
function parisMidnightIso(day) {
  const [y, m, d] = day.split('-').map(Number)
  const guess = Date.UTC(y, m - 1, d)
  return new Date(guess - parisOffsetMs(guess)).toISOString()
}
// [début inclus, fin exclue) en ISO UTC pour les jours from..to de Paris.
function bounds(from, to) {
  const [y, m, d] = to.split('-').map(Number)
  const next = new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10)
  return [parisMidnightIso(from), parisMidnightIso(next)]
}
// Jour de Paris (« AAAA-MM-JJ ») d'un instant ISO.
const parisDay = (iso) => new Date(iso).toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' })

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
  const [start, end] = bounds(from, to)
  const teamId = req.caller.team_id

  // Interventions reçues dans la période (date de création).
  const totalInterventions = db
    .prepare('SELECT COUNT(*) AS c FROM interventions WHERE team_id = ? AND created_at >= ? AND created_at < ?')
    .get(teamId, start, end).c

  // CA facturé = total TTC des factures émises dans la période ; panier moyen
  // = ce CA divisé par le nombre de ces factures (les deux se recoupent).
  const factures = db
    .prepare("SELECT * FROM documents WHERE kind = 'facture' AND team_id = ? AND deleted_at IS NULL AND issue_date BETWEEN ? AND ?")
    .all(teamId, from, to)
  const ca = factures.reduce((sum, d) => sum + totalTTC(d), 0)
  const panierMoyen = factures.length ? ca / factures.length : 0

  // En cours = état actuel (pas lié à la période).
  const enCours = db.prepare("SELECT COUNT(*) AS c FROM interventions WHERE status = 'en_cours' AND team_id = ?").get(teamId).c
  const terminees = db
    .prepare(`SELECT COUNT(*) AS c FROM interventions WHERE status IN ${DONE} AND team_id = ? AND ${DONE_AT} >= ? AND ${DONE_AT} < ?`)
    .get(teamId, start, end).c

  // Factures à encaisser = toutes celles émises et pas encore payées (état actuel).
  const unpaid = db
    .prepare("SELECT * FROM documents WHERE kind = 'facture' AND status = 'emise' AND team_id = ? AND deleted_at IS NULL")
    .all(teamId)
  const caImpaye = unpaid.reduce((sum, d) => sum + totalTTC(d), 0)

  // Taux de signature : devis présentés au client dans la période (envoyés,
  // signés ou expirés — un brouillon jamais montré ne compte pas).
  const devisTotal = db
    .prepare(
      "SELECT COUNT(*) AS c FROM documents WHERE kind = 'devis' AND team_id = ? AND deleted_at IS NULL AND status != 'brouillon' AND issue_date BETWEEN ? AND ?",
    )
    .get(teamId, from, to).c
  const devisSignes = db
    .prepare(
      "SELECT COUNT(*) AS c FROM documents WHERE kind = 'devis' AND status = 'signe' AND team_id = ? AND deleted_at IS NULL AND issue_date BETWEEN ? AND ?",
    )
    .get(teamId, from, to).c
  const tauxConversion = devisTotal > 0 ? (devisSignes / devisTotal) * 100 : null

  // Répartition par technicien — mêmes règles que sa propre page de stats,
  // pour que les chiffres se recoupent exactement.
  const techniciens = db.prepare('SELECT id, first_name, last_name FROM technicians WHERE active = 1 AND team_id = ?').all(teamId)
  const byTechnicien = techniciens.map((t) => ({
    technicien_id: t.id,
    name: `${t.first_name} ${t.last_name}`.trim(),
    ...technicienCounts(t.id, teamId, from, to),
  }))
  byTechnicien.sort((a, b) => b.ca - a.ca)

  // Par secteur : nombre reçu dans la période, CA (montant des fiches) de
  // celles terminées dans la période.
  const bySecteur = db
    .prepare(
      `SELECT intervention_type AS type,
              SUM(CASE WHEN created_at >= ? AND created_at < ? THEN 1 ELSE 0 END) AS total,
              COALESCE(SUM(CASE WHEN status IN ${DONE} AND ${DONE_AT} >= ? AND ${DONE_AT} < ? THEN amount ELSE 0 END), 0) AS ca
       FROM interventions
       WHERE team_id = ? AND intervention_type != ''
       GROUP BY intervention_type
       HAVING total > 0 OR ca > 0
       ORDER BY ca DESC`,
    )
    .all(start, end, start, end, teamId)

  const cents = (n) => Math.round(n * 100) / 100
  res.json({
    total_interventions: totalInterventions,
    ca: cents(ca),
    nb_factures: factures.length,
    en_cours: enCours,
    terminees,
    factures_impayees: unpaid.length,
    ca_impaye: cents(caImpaye),
    panier_moyen: cents(panierMoyen),
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
    .prepare("SELECT * FROM documents WHERE kind = 'facture' AND team_id = ? AND deleted_at IS NULL AND issue_date BETWEEN ? AND ?")
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
  const [start, end] = bounds(from, to)
  // Reçues (assignées à lui) dans la période.
  const totalInterventions = db
    .prepare('SELECT COUNT(*) AS c FROM interventions WHERE technicien_id = ? AND team_id = ? AND created_at >= ? AND created_at < ?')
    .get(technicienId, teamId, start, end).c
  // Terminées dans la période, et leur montant (CA du technicien).
  const done = db
    .prepare(
      `SELECT COUNT(*) AS c, COALESCE(SUM(amount), 0) AS s FROM interventions
       WHERE technicien_id = ? AND team_id = ? AND status IN ${DONE} AND ${DONE_AT} >= ? AND ${DONE_AT} < ?`,
    )
    .get(technicienId, teamId, start, end)
  return { total_interventions: totalInterventions, ca: done.s, terminees: done.c }
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
  const [start, end] = bounds(from, to)
  const bySecteur = db
    .prepare(
      `SELECT intervention_type AS type,
              SUM(CASE WHEN created_at >= ? AND created_at < ? THEN 1 ELSE 0 END) AS total,
              COALESCE(SUM(CASE WHEN status IN ${DONE} AND ${DONE_AT} >= ? AND ${DONE_AT} < ? THEN amount ELSE 0 END), 0) AS ca
       FROM interventions
       WHERE technicien_id = ? AND team_id = ? AND intervention_type != ''
       GROUP BY intervention_type
       HAVING total > 0 OR ca > 0
       ORDER BY ca DESC`,
    )
    .all(start, end, start, end, technicienId, teamId)

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
  const [startIso, endIso] = bounds(from, to)
  const rows = db
    .prepare(
      `SELECT ${DONE_AT} AS done_at, amount FROM interventions
       WHERE technicien_id = ? AND team_id = ? AND status IN ${DONE} AND ${DONE_AT} >= ? AND ${DONE_AT} < ?`,
    )
    .all(req.caller.technicien_id, req.caller.team_id, startIso, endIso)
  // Regroupé par jour de Paris (pas par jour UTC).
  const byDay = new Map()
  for (const r of rows) byDay.set(parisDay(r.done_at), (byDay.get(parisDay(r.done_at)) ?? 0) + (r.amount ?? 0))

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
      `SELECT * FROM interventions WHERE technicien_id = ? AND team_id = ? AND status IN ${DONE} AND ${DONE_AT} >= ? AND ${DONE_AT} < ? ORDER BY ${DONE_AT} ASC`,
    )
    .all(req.caller.technicien_id, req.caller.team_id, ...bounds(from, to))
  res.json(rows.map((r) => ({ ...r, photos: JSON.parse(r.photos) })))
})
