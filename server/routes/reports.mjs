import { companyForTeam } from '../company.mjs'
import { Router } from 'express'

import { db, getSetting, now, uuid } from '../db.mjs'
import { requireAuth } from '../auth.mjs'
import { sendMail } from '../mailer.mjs'
import { generateReportPdfBuffer } from '../pdf.mjs'
import { wrapEmail } from '../emailTemplates.mjs'
import { rateLimit } from '../rateLimit.mjs'
import { draftReport } from '../aiReport.mjs'

export const reportsRouter = Router()
reportsRouter.use(requireAuth)

// Même limite que l'envoi de devis/factures (documents.mjs) — un vrai email
// externe avec pièce jointe PDF, pas juste une lecture de données.
const emailLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 30 })

// Un technicien ne peut faire un rapport que sur une fiche qui lui est/était
// assignée dans son équipe active ; l'admin peut en faire sur n'importe
// quelle fiche de l'équipe — même contrôle d'accès que le reste (fiches,
// devis/factures).
function canAccessIntervention(caller, intervention) {
  if (!intervention || intervention.team_id !== caller.team_id) return false
  if (caller.role === 'admin') return true
  return intervention.technicien_id === caller.technicien_id
}

function technicienNameFor(intervention, caller) {
  const t = intervention.technicien_id
    ? db.prepare('SELECT first_name, last_name FROM technicians WHERE id = ?').get(intervention.technicien_id)
    : caller.technicien_id
      ? db.prepare('SELECT first_name, last_name FROM technicians WHERE id = ?').get(caller.technicien_id)
      : null
  return t ? `${t.first_name} ${t.last_name}`.trim() : 'Technicien'
}

const isoOrNull = (v) => {
  const d = v ? new Date(v) : null
  return d && !Number.isNaN(d.getTime()) ? d.toISOString() : null
}

// Rédaction du compte-rendu par l'IA (fiche + heure d'arrivée + facture +
// appel) — rien n'est enregistré : le texte revient dans le formulaire, à
// relire et modifier avant de générer le rapport.
const aiLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 40 })
reportsRouter.post('/ai-draft', aiLimiter, async (req, res) => {
  const intervention = db.prepare('SELECT * FROM interventions WHERE id = ?').get(req.body?.interventionId)
  if (!canAccessIntervention(req.caller, intervention)) return res.status(404).json({ error: 'Intervention introuvable' })
  try {
    res.json(
      await draftReport({
        teamId: req.caller.team_id,
        interventionId: intervention.id,
        arrivalAt: isoOrNull(req.body?.arrivalAt),
        technicienName: technicienNameFor(intervention, req.caller),
        extraNotes: String(req.body?.notes ?? '').slice(0, 4000),
      }),
    )
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: e.message })
    console.log(`[rapport ia] ${e.message}`)
    res.status(502).json({ error: 'La rédaction a échoué, réessaie dans un instant.' })
  }
})

reportsRouter.post('/', (req, res) => {
  const { interventionId, notes } = req.body ?? {}
  const arrivalAt = isoOrNull(req.body?.arrivalAt)
  const intervention = db.prepare('SELECT * FROM interventions WHERE id = ?').get(interventionId)
  if (!canAccessIntervention(req.caller, intervention)) {
    return res.status(404).json({ error: 'Intervention introuvable' })
  }

  const id = uuid()
  const createdAt = now()
  db.prepare(
    'INSERT INTO intervention_reports (id, intervention_id, team_id, technicien_id, notes, arrival_at, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
  ).run(id, interventionId, req.caller.team_id, req.caller.technicien_id, notes ?? '', arrivalAt, req.sessionId, createdAt)

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

// `greeting` (nom client) vient de la fiche intervention, jamais digne de
// confiance dans un contexte HTML brut — même précaution que documents.mjs.
function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
}

// Aucune adresse email n'est stockée sur une intervention (contrairement à
// un devis/facture) — elle est donc saisie au moment de l'envoi plutôt que
// relue en base, sans être conservée après coup.
reportsRouter.post('/:id/email', emailLimiter, async (req, res) => {
  const email = String(req.body?.email ?? '').trim()
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Adresse email invalide.' })
  }

  const report = db.prepare('SELECT * FROM intervention_reports WHERE id = ?').get(req.params.id)
  if (!report) return res.status(404).json({ error: 'Rapport introuvable' })
  const intervention = db.prepare('SELECT * FROM interventions WHERE id = ?').get(report.intervention_id)
  if (!canAccessIntervention(req.caller, intervention)) {
    return res.status(404).json({ error: 'Rapport introuvable' })
  }

  const technicien = intervention.technicien_id
    ? db.prepare('SELECT first_name, last_name FROM technicians WHERE id = ?').get(intervention.technicien_id)
    : null
  const technicienName = technicien ? `${technicien.first_name} ${technicien.last_name}`.trim() : 'Technicien'
  const eventDate = intervention.completed_at ?? intervention.started_at ?? intervention.created_at
  const client = [intervention.client_first_name, intervention.client_last_name].filter(Boolean).join(' ') || 'Client'

  try {
    const pdfBuffer = generateReportPdfBuffer({ report, intervention, technicienName })
    await sendMail({
      to: email,
      fromName: companyForTeam(intervention.team_id).name,
      subject: `Rapport d'intervention — ${intervention.reference}`,
      html: wrapEmail({
        brandName: companyForTeam(intervention.team_id).name,
        preheader: `Voici le rapport d'intervention ${intervention.reference}.`,
        bodyHtml: `
          <p>Bonjour ${escapeHtml(client)},</p>
          <p>Voici le rapport de l'intervention <strong>${escapeHtml(intervention.reference)}</strong>, réalisée le ${new Date(eventDate).toLocaleDateString('fr-FR')}, jointe à cet email au format PDF.</p>`,
      }),
      attachments: [{ filename: `rapport-${intervention.reference}.pdf`, content: pdfBuffer }],
    })
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})
