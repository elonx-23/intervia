import { Router } from 'express'

import { aiAvailable, draftReport } from '../aiReport.mjs'
import { requireAuth } from '../auth.mjs'
import { companyForTeam } from '../company.mjs'
import { db, now, uuid } from '../db.mjs'
import { emailsForDocument, finishEmail, trackingPixel } from '../emailTracking.mjs'
import { wrapEmail } from '../emailTemplates.mjs'
import { broadcast } from '../events.mjs'
import { sendMail } from '../mailer.mjs'
import { rateLimit } from '../rateLimit.mjs'
import { documentForIntervention, documentToApi, insertReport, newReportFields, reportToApi, starterNotes } from '../reports.mjs'

// Rapports d'intervention : création (depuis une fiche, un devis ou une
// facture), modification, rédaction par l'IA, envoi par email. Ouverts comme
// un devis ou une facture (Modifier · Aperçu · Historique).
export const reportsRouter = Router()
reportsRouter.use(requireAuth)

// Mêmes règles d'accès que les fiches et les documents : l'admin voit tout
// dans son équipe, un technicien ses fiches et ses propres rapports.
function canAccessIntervention(caller, intervention) {
  if (!intervention || intervention.team_id !== caller.team_id) return false
  if (caller.role === 'admin') return true
  return intervention.technicien_id === caller.technicien_id
}

function canAccessDocument(caller, sessionId, doc) {
  if (!doc || doc.team_id !== caller.team_id) return false
  if (caller.role === 'admin' || doc.created_by === sessionId) return true
  const i = doc.intervention_id ? db.prepare('SELECT technicien_id FROM interventions WHERE id = ?').get(doc.intervention_id) : null
  return Boolean(i && i.technicien_id === caller.technicien_id)
}

const canAccessReport = (caller, r) =>
  Boolean(r && r.team_id === caller.team_id && (caller.role === 'admin' || r.technicien_id === caller.technicien_id))

const byId = (id) => db.prepare('SELECT * FROM intervention_reports WHERE id = ?').get(id)
const loadReport = (req) => {
  const row = byId(req.params.id)
  return canAccessReport(req.caller, row) ? row : null
}

// Rapport complet pour l'éditeur : document lié (lignes, totaux), fiche,
// emails envoyés (historique) et disponibilité de l'IA.
function fullReport(row) {
  const r = reportToApi(row)
  const doc = r.document_id ? db.prepare('SELECT * FROM documents WHERE id = ? AND deleted_at IS NULL').get(r.document_id) : null
  const intervention = r.intervention_id
    ? db
        .prepare('SELECT id, reference, status, description, floor, access_codes, created_at FROM interventions WHERE id = ?')
        .get(r.intervention_id)
    : null
  return {
    ...r,
    document: documentToApi(doc),
    intervention: intervention ?? null,
    emails: emailsForDocument(r.id),
    ai_available: aiAvailable(r.team_id),
  }
}

const changed = (row) => broadcast('reports_changed', { id: row.id }, row.team_id)

const isoOrNull = (v) => {
  const d = v ? new Date(v) : null
  return d && !Number.isNaN(d.getTime()) ? d.toISOString() : null
}

// Liste (onglet Factures).
reportsRouter.get('/', (req, res) => {
  const rows =
    req.caller.role === 'admin'
      ? db.prepare('SELECT * FROM intervention_reports WHERE team_id = ? ORDER BY created_at DESC').all(req.caller.team_id)
      : db
          .prepare('SELECT * FROM intervention_reports WHERE team_id = ? AND technicien_id = ? ORDER BY created_at DESC')
          .all(req.caller.team_id, req.caller.technicien_id)
  res.json(rows.map(reportToApi))
})

// Nouveau rapport depuis une fiche et/ou un devis / une facture : client,
// adresse, technicien, heures d'arrivée et de fin, photos et lignes de la
// facture sont repris ; le compte-rendu part d'une première version.
reportsRouter.post('/', (req, res) => {
  const { interventionId, documentId } = req.body ?? {}
  let doc = documentId ? db.prepare('SELECT * FROM documents WHERE id = ? AND deleted_at IS NULL').get(documentId) : null
  if (documentId && !canAccessDocument(req.caller, req.sessionId, doc)) return res.status(404).json({ error: 'Document introuvable' })
  const interventionRef = interventionId || doc?.intervention_id
  let intervention = interventionRef ? db.prepare('SELECT * FROM interventions WHERE id = ?').get(interventionRef) : null
  if (interventionId && !canAccessIntervention(req.caller, intervention)) return res.status(404).json({ error: 'Intervention introuvable' })
  if (!canAccessIntervention(req.caller, intervention)) intervention = null
  if (!doc && intervention) doc = documentForIntervention(intervention.id)
  if (!intervention && !doc) return res.status(400).json({ error: 'Choisis une intervention, un devis ou une facture.' })

  const fields = newReportFields({ intervention, document: doc, caller: req.caller })
  const id = insertReport(req.caller.team_id, req.caller, fields, starterNotes({ intervention, document: doc, fields }))
  const row = byId(id)
  changed(row)
  res.json(fullReport(row))
})

reportsRouter.get('/:id', (req, res) => {
  const row = loadReport(req)
  if (!row) return res.status(404).json({ error: 'Rapport introuvable' })
  res.json(fullReport(row))
})

// Champs modifiables (longueur maximale).
const TEXT_FIELDS = {
  title: 200,
  extra: 4000,
  notes: 20000,
  technicien_name: 120,
  client_first_name: 120,
  client_last_name: 120,
  phone: 40,
  email: 200,
  address: 300,
  postal_code: 12,
  city: 120,
  intervention_type: 80,
}

reportsRouter.patch('/:id', (req, res) => {
  const row = loadReport(req)
  if (!row) return res.status(404).json({ error: 'Rapport introuvable' })
  const b = req.body ?? {}
  const sets = []
  const values = []
  for (const [key, max] of Object.entries(TEXT_FIELDS)) {
    if (b[key] === undefined) continue
    sets.push(`${key} = ?`)
    values.push(String(b[key] ?? '').slice(0, max))
  }
  for (const key of ['arrival_at', 'end_at']) {
    if (b[key] === undefined) continue
    sets.push(`${key} = ?`)
    values.push(isoOrNull(b[key]))
  }
  // Photos : uniquement des fichiers envoyés dans l'app (/uploads/…).
  if (Array.isArray(b.photos)) {
    sets.push('photos = ?')
    values.push(
      JSON.stringify(b.photos.filter((p) => typeof p === 'string' && /^\/uploads\/[^?#\s]+$/.test(p) && !p.includes('..')).slice(0, 30)),
    )
  }
  if (Array.isArray(b.motifs)) {
    sets.push('motifs = ?')
    values.push(JSON.stringify(b.motifs.map((m) => String(m).slice(0, 60)).slice(0, 10)))
  }
  if (sets.length) {
    sets.push('updated_at = ?')
    values.push(now())
    db.prepare(`UPDATE intervention_reports SET ${sets.join(', ')} WHERE id = ?`).run(...values, row.id)
    changed(row)
  }
  res.json(fullReport(byId(row.id)))
})

reportsRouter.delete('/:id', (req, res) => {
  const row = loadReport(req)
  if (!row) return res.status(404).json({ error: 'Rapport introuvable' })
  db.prepare('DELETE FROM intervention_reports WHERE id = ?').run(row.id)
  db.prepare('DELETE FROM document_emails WHERE document_id = ?').run(row.id)
  changed(row)
  res.json({ ok: true })
})

// Rédaction par l'IA (fiche, heures, facture, appel, photos + éléments
// ajoutés) : le titre, le compte-rendu et les motifs sont enregistrés.
const aiLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 40 })
reportsRouter.post('/:id/ai', aiLimiter, async (req, res) => {
  const row = loadReport(req)
  if (!row) return res.status(404).json({ error: 'Rapport introuvable' })
  const extra = String(req.body?.extra ?? row.extra ?? '').slice(0, 4000)
  try {
    const draft = await draftReport({ teamId: row.team_id, report: { ...reportToApi(row), extra }, extra })
    const at = now()
    db.prepare('UPDATE intervention_reports SET title = ?, notes = ?, motifs = ?, extra = ?, ai_at = ?, updated_at = ? WHERE id = ?').run(
      draft.title || row.title,
      draft.notes,
      JSON.stringify(draft.motifs),
      extra,
      at,
      at,
      row.id,
    )
    changed(row)
    res.json(fullReport(byId(row.id)))
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: e.message })
    console.log(`[rapport ia] ${e.message}`)
    res.status(502).json({ error: 'La rédaction a échoué, réessaie dans un instant.' })
  }
})

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
}

// Envoi par email : le PDF joint est celui de l'aperçu (composé par l'app,
// photos comprises) ; l'envoi et son ouverture apparaissent dans l'historique.
const emailLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 30 })
reportsRouter.post('/:id/email', emailLimiter, async (req, res) => {
  const row = loadReport(req)
  if (!row) return res.status(404).json({ error: 'Rapport introuvable' })
  const email = String(req.body?.email ?? '').trim()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Adresse email invalide.' })
  const pdf = Buffer.from(String(req.body?.pdf ?? ''), 'base64')
  if (pdf.length < 500 || pdf.subarray(0, 5).toString('latin1') !== '%PDF-')
    return res.status(400).json({ error: 'PDF du rapport invalide.' })

  const company = companyForTeam(row.team_id)
  const emailId = uuid()
  db.prepare(
    "INSERT INTO document_emails (id, document_id, team_id, kind, to_email, status, sent_at) VALUES (?, ?, ?, 'envoi', ?, 'envoi_en_cours', ?)",
  ).run(emailId, row.id, row.team_id, email, now())
  const baseUrl = `${String(req.get('x-forwarded-proto') ?? req.protocol)
    .split(',')[0]
    .trim()}://${req.get('host')}`
  const client = [row.client_first_name, row.client_last_name].filter(Boolean).join(' ')
  const when = row.arrival_at ?? row.end_at ?? row.created_at
  try {
    await sendMail({
      to: email,
      fromName: company.name,
      subject: `Rapport d'intervention ${row.number}${company.name ? ` — ${company.name}` : ''}`,
      html: wrapEmail({
        brandName: company.name,
        preheader: `Rapport de l'intervention du ${new Date(when).toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris' })}.`,
        bodyHtml: `
          <p>Bonjour${client ? ` ${escapeHtml(client)}` : ''},</p>
          <p>Veuillez trouver ci-joint le rapport de l'intervention réalisée le ${new Date(when).toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris' })}${row.title ? ` (${escapeHtml(row.title)})` : ''}.</p>
          <p>Ce document peut être transmis à votre assurance ou au propriétaire du logement.</p>
          ${trackingPixel(baseUrl, emailId)}`,
      }),
      attachments: [{ filename: `Rapport-${row.number}.pdf`, content: pdf }],
    })
    finishEmail(emailId)
    if (!row.email) db.prepare('UPDATE intervention_reports SET email = ? WHERE id = ?').run(email, row.id)
    changed(row)
    res.json(fullReport(byId(row.id)))
  } catch (e) {
    finishEmail(emailId, e)
    console.log(`[rapport email] ${e.message}`)
    res.status(502).json({ error: "L'envoi a échoué, réessaie dans un instant." })
  }
})
