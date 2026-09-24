import { Router } from 'express'

import { db, now, uuid } from '../db.mjs'
import { requireAdmin, requireAuth } from '../auth.mjs'
import { notifyAdmin } from '../notify.mjs'
import { sendMail } from '../mailer.mjs'
import { generateDocumentPdfBuffer } from '../pdf.mjs'
import { getStripe } from '../stripe.mjs'
import { broadcast } from '../events.mjs'
import { rateLimit } from '../rateLimit.mjs'

export const documentsRouter = Router()

// Actions avec un vrai effet de bord externe (email réel avec pièce jointe
// PDF, création d'une session Stripe) déclenchées par un compte authentifié
// — sans limite, un compte (même légitime mais négligent avec un clic
// répété, ou compromis) pouvait spammer la boîte mail d'un client, épuiser
// la réputation d'envoi du Gmail connecté, ou multiplier les appels API
// Stripe. Généreux (30/heure) pour ne jamais gêner un usage professionnel
// normal.
const externalActionLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 30 })

function toApi(row) {
  if (!row) return row
  return {
    ...row,
    items: JSON.parse(row.items),
    photos_before: JSON.parse(row.photos_before),
    photos_after: JSON.parse(row.photos_after),
  }
}

function itemsTotalHT(items) {
  return items.reduce((sum, i) => sum + i.quantity * i.unitPrice, 0)
}

function discountAmount(ht, discountType, discountValue) {
  if (!discountValue) return 0
  return discountType === 'percent' ? ht * (discountValue / 100) : discountValue
}

function totalTTC(doc) {
  const ht = itemsTotalHT(JSON.parse(doc.items))
  const discounted = Math.max(0, ht - discountAmount(ht, doc.discount_type, doc.discount_value))
  return discounted * (1 + doc.vat_rate / 100)
}

// Repose sur le plus grand numéro déjà attribué cette année POUR CETTE
// ÉQUIPE (pas un simple COUNT(*)) — un COUNT se désynchronise dès qu'il
// existe des documents hors du format "préfixe+année" (anciens numéros
// "DEV-0000X" d'avant ce format, ou des lignes supprimées comptées quand
// même), et finit par régénérer un numéro déjà pris ("UNIQUE constraint
// failed" observé en prod). La colonne `number` est UNIQUE au niveau de
// TOUTE la base (pas une contrainte composite par équipe), donc le prochain
// numéro doit être cherché tous équipes confondues, jamais scopé par
// team_id — sinon deux équipes qui démarrent chacune "à 1" se percutent sur
// le même D2026-00001 (vécu en testant l'isolation multi-équipe).
function nextNumber(kind) {
  const prefix = kind === 'devis' ? 'D' : 'F'
  const year = new Date().getFullYear()
  const row = db
    .prepare(
      `SELECT number FROM documents WHERE kind = ? AND number LIKE ? ORDER BY CAST(substr(number, -5) AS INTEGER) DESC LIMIT 1`,
    )
    .get(kind, `${prefix}${year}-%`)
  const last = row ? parseInt(row.number.slice(-5), 10) : 0
  return `${prefix}${year}-${String(last + 1).padStart(5, '0')}`
}

// `greeting` vient du prénom client saisi par un admin/technicien — jamais
// digne de confiance dans un contexte HTML brut (un nom du style
// `<img src=x onerror=...>` s'exécuterait chez le destinataire de l'email).
// `intro`/`outro`, eux, sont construits par le code lui-même (avec du <strong>
// volontaire) et ne passent pas par ce filtre.
function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
}

// Email avec un vrai bouton d'action (pas juste un lien texte nu) — style
// inline requis pour un rendu correct dans les clients mail (Gmail, Outlook…
// n'appliquent pas de <style> externe).
function emailHtml({ greeting, intro, ctaLabel, ctaLink, outro }) {
  return `
    <div style="font-family: -apple-system, Helvetica, Arial, sans-serif; color: #1e1e23; max-width: 480px; margin: 0 auto;">
      <p>Bonjour ${escapeHtml(greeting)},</p>
      <p>${intro}</p>
      <p style="text-align: center; margin: 28px 0;">
        <a href="${ctaLink}" style="background: #2563eb; color: #ffffff; text-decoration: none; padding: 12px 28px; border-radius: 999px; font-weight: 600; display: inline-block;">${ctaLabel}</a>
      </p>
      ${outro ? `<p>${outro}</p>` : ''}
      <p style="color: #6b6b78; font-size: 12px; margin-top: 24px;">
        Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur :<br />
        <a href="${ctaLink}" style="color: #2563eb;">${ctaLink}</a>
      </p>
      <p>PSE Dépannage</p>
    </div>`
}

// L'équipe est le premier filtre, avant tout le reste : un document d'une
// autre équipe est refusé même pour un admin, même s'il en est le créateur
// (impossible en pratique, mais gardé strict par principe).
function canAccess(caller, sessionId, doc) {
  if (doc.team_id !== caller.team_id) return false
  if (caller.role === 'admin') return true
  if (doc.created_by === sessionId) return true
  if (doc.intervention_id) {
    const i = db.prepare('SELECT technicien_id FROM interventions WHERE id = ?').get(doc.intervention_id)
    if (i && i.technicien_id === caller.technicien_id) return true
  }
  return false
}

documentsRouter.get('/token/:token', (req, res) => {
  const row = db.prepare('SELECT * FROM documents WHERE public_token = ? AND deleted_at IS NULL').get(req.params.token)
  if (!row) return res.status(404).json({ error: 'Document introuvable' })
  res.json(toApi(row))
})

// Signature client — pour un devis, ça vaut acceptation (change le statut) ;
// pour une facture, ça atteste juste la remise/réception des travaux (le
// statut de paiement n'est pas concerné, seule la preuve de signature est
// enregistrée), courant en dépannage : le client signe sur le téléphone du
// technicien juste après l'intervention. Route publique (lien client, pas de
// session) — le team_id vient donc du document lui-même, pas d'un caller.
documentsRouter.post('/:id/sign', (req, res) => {
  const { signatureData } = req.body ?? {}
  const row = db.prepare('SELECT * FROM documents WHERE id = ? AND deleted_at IS NULL').get(req.params.id)
  if (!row) return res.status(404).json({ error: 'Document introuvable' })

  if (row.kind === 'devis') {
    if (!['brouillon', 'envoye'].includes(row.status)) {
      return res.status(400).json({ error: 'Ce devis ne peut plus être signé' })
    }
    db.prepare('UPDATE documents SET status=?, signed_at=?, signature_data=? WHERE id=?').run(
      'signe',
      now(),
      signatureData,
      row.id,
    )
  } else {
    db.prepare('UPDATE documents SET signed_at=?, signature_data=? WHERE id=?').run(now(), signatureData, row.id)
  }

  const updated = db.prepare('SELECT * FROM documents WHERE id = ?').get(row.id)
  const total = totalTTC(updated)
  notifyAdmin(
    updated.team_id,
    row.kind === 'devis' ? 'devis_signe' : 'facture_signee',
    row.kind === 'devis' ? '✅ Devis accepté !' : '✍️ Facture signée !',
    `${updated.client_first_name} ${updated.client_last_name} — ${total.toFixed(2)} €`.trim(),
    { document_id: updated.id },
  )

  broadcast('documents_changed', {}, updated.team_id)
  res.json(toApi(updated))
})

documentsRouter.use(requireAuth)

documentsRouter.post('/:id/relance', externalActionLimiter, async (req, res) => {
  const doc = db.prepare("SELECT * FROM documents WHERE id = ? AND kind = 'facture'").get(req.params.id)
  if (!doc) return res.status(404).json({ error: 'Facture introuvable' })
  if (!canAccess(req.caller, req.sessionId, doc)) return res.status(403).json({ error: 'Accès refusé' })
  if (doc.status !== 'emise') return res.status(400).json({ error: 'Cette facture est déjà payée' })
  if (!doc.email) return res.status(400).json({ error: "Le client n'a pas d'email renseigné" })

  const link = `${req.protocol}://${req.get('host')}/facture/${doc.public_token}`
  const ttc = totalTTC(doc).toFixed(2)

  try {
    const pdfBuffer = generateDocumentPdfBuffer(toApi(doc))
    await sendMail({
      to: doc.email,
      subject: `Rappel — Facture ${doc.number} en attente de paiement`,
      html: emailHtml({
        greeting: doc.client_first_name,
        intro: `Nous n'avons pas encore reçu le règlement de votre facture <strong>${doc.number}</strong> (${ttc} € TTC), jointe à cet email.`,
        ctaLabel: doc.signature_data ? 'Consulter la facture' : 'Consulter et signer la facture',
        ctaLink: link,
        outro: 'Merci de bien vouloir régulariser dans les meilleurs délais.',
      }),
      attachments: [{ filename: `${doc.number}.pdf`, content: pdfBuffer }],
    })
    db.prepare('UPDATE documents SET relance_count = relance_count + 1, last_relance_at = ? WHERE id = ?').run(
      now(),
      doc.id,
    )
    res.json(toApi(db.prepare('SELECT * FROM documents WHERE id = ?').get(doc.id)))
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// Email avec le PDF joint (pas seulement un lien) + un bouton d'action clair
// vers la page publique — signature pour un devis, consultation/signature
// pour une facture (les deux sont désormais signables à distance).
documentsRouter.post('/:id/email', externalActionLimiter, async (req, res) => {
  const doc = db.prepare('SELECT * FROM documents WHERE id = ?').get(req.params.id)
  if (!doc) return res.status(404).json({ error: 'Document introuvable' })
  if (!canAccess(req.caller, req.sessionId, doc)) return res.status(403).json({ error: 'Accès refusé' })
  if (!doc.email) return res.status(400).json({ error: "Le client n'a pas d'email renseigné" })

  const path = doc.kind === 'devis' ? 'signer' : 'facture'
  const link = `${req.protocol}://${req.get('host')}/${path}/${doc.public_token}`
  const label = doc.kind === 'devis' ? 'devis' : 'facture'
  const ttc = totalTTC(doc).toFixed(2)
  const alreadySigned = !!doc.signature_data
  const ctaLabel =
    doc.kind === 'devis'
      ? alreadySigned
        ? 'Consulter le devis'
        : 'Consulter et signer le devis'
      : alreadySigned
        ? 'Consulter la facture'
        : 'Consulter et signer la facture'

  try {
    const pdfBuffer = generateDocumentPdfBuffer(toApi(doc))
    await sendMail({
      to: doc.email,
      subject: `Votre ${label} PSE Dépannage — ${doc.number}`,
      html: emailHtml({
        greeting: doc.client_first_name,
        intro: `Voici votre ${label} <strong>${doc.number}</strong> (${ttc} € TTC), jointe à cet email au format PDF.`,
        ctaLabel,
        ctaLink: link,
      }),
      attachments: [{ filename: `${doc.number}.pdf`, content: pdfBuffer }],
    })
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

documentsRouter.get('/', (req, res) => {
  const kind = req.query.kind === 'facture' ? 'facture' : 'devis'
  const rows =
    req.caller.role === 'admin'
      ? db
          .prepare('SELECT * FROM documents WHERE kind = ? AND team_id = ? AND deleted_at IS NULL ORDER BY created_at DESC')
          .all(kind, req.caller.team_id)
      : db
          .prepare(
            `SELECT d.* FROM documents d
             LEFT JOIN interventions i ON i.id = d.intervention_id
             WHERE d.kind = ? AND d.team_id = ? AND d.deleted_at IS NULL AND (d.created_by = ? OR i.technicien_id = ?)
             ORDER BY d.created_at DESC`,
          )
          .all(kind, req.caller.team_id, req.sessionId, req.caller.technicien_id)
  res.json(rows.map(toApi))
})

documentsRouter.get('/unpaid', (req, res) => {
  const rows =
    req.caller.role === 'admin'
      ? db
          .prepare(
            "SELECT * FROM documents WHERE kind = 'facture' AND status = 'emise' AND team_id = ? AND deleted_at IS NULL ORDER BY created_at DESC",
          )
          .all(req.caller.team_id)
      : db
          .prepare(
            `SELECT d.* FROM documents d
             JOIN interventions i ON i.id = d.intervention_id
             WHERE d.kind = 'facture' AND d.status = 'emise' AND d.team_id = ? AND d.deleted_at IS NULL AND i.technicien_id = ?
             ORDER BY d.created_at DESC`,
          )
          .all(req.caller.team_id, req.caller.technicien_id)
  res.json(rows.map(toApi))
})

// Devis/factures déjà créés à partir d'une intervention donnée — affichés
// directement sur sa fiche pour que le technicien/admin les retrouve sans
// avoir à chercher dans la liste globale.
documentsRouter.get('/by-intervention/:interventionId', (req, res) => {
  const intervention = db.prepare('SELECT * FROM interventions WHERE id = ?').get(req.params.interventionId)
  if (!intervention || intervention.team_id !== req.caller.team_id) {
    return res.status(404).json({ error: 'Intervention introuvable' })
  }
  if (req.caller.role !== 'admin' && intervention.technicien_id !== req.caller.technicien_id) {
    return res.status(403).json({ error: 'Accès refusé' })
  }

  const rows = db
    .prepare('SELECT * FROM documents WHERE intervention_id = ? AND deleted_at IS NULL ORDER BY created_at DESC')
    .all(req.params.interventionId)
  res.json(rows.map(toApi))
})

// Regroupe tous les devis/factures par client (téléphone comme identifiant
// principal — c'est ce qui varie le moins d'un document à l'autre pour un
// même client ; à défaut, nom + adresse) pour un suivi de la relation client
// dans le temps, pas juste document par document. Admin uniquement : c'est
// une vue transverse sur toute l'activité, pas un besoin terrain technicien.
documentsRouter.get('/clients', requireAdmin, (req, res) => {
  const rows = db
    .prepare('SELECT * FROM documents WHERE team_id = ? AND deleted_at IS NULL ORDER BY created_at DESC')
    .all(req.caller.team_id)
  const clients = new Map()

  for (const row of rows) {
    const name = `${row.client_first_name} ${row.client_last_name}`.trim()
    const phone = (row.phone ?? '').trim()
    const key = phone || `${name.toLowerCase()}|${(row.address ?? '').trim().toLowerCase()}`
    if (!key || key === '|') continue

    if (!clients.has(key)) {
      clients.set(key, {
        key,
        name: name || 'Client sans nom',
        phone: phone || null,
        address: row.address ?? null,
        devis_count: 0,
        facture_count: 0,
        ca_paye: 0,
        ca_du: 0,
        last_activity: row.created_at,
        document_ids: [],
      })
    }
    const c = clients.get(key)
    if (row.kind === 'devis') c.devis_count += 1
    if (row.kind === 'facture') {
      c.facture_count += 1
      const total = totalTTC(row)
      if (row.status === 'payee') c.ca_paye += total
      else c.ca_du += total
    }
    if (row.created_at > c.last_activity) c.last_activity = row.created_at
    c.document_ids.push(row.id)
    // Le nom/l'adresse le plus RÉCENT l'emporte (coordonnées mises à jour) —
    // les lignes sont déjà triées created_at DESC donc le premier passage
    // pour cette clé est déjà le plus récent, rien à faire de plus.
  }

  const list = Array.from(clients.values())
    .map(({ document_ids, ...c }) => ({ ...c, total_documents: document_ids.length }))
    .sort((a, b) => (b.last_activity > a.last_activity ? 1 : -1))

  res.json(list)
})

// Recherche de client déjà connu (nom/téléphone/adresse) pour préremplir un
// nouveau devis/facture sans ressaisir ses coordonnées — accessible aux
// techniciens aussi (pas juste l'admin), mais limité à leurs propres
// documents/interventions pour eux, comme le reste des routes documents.
documentsRouter.get('/search-clients', (req, res) => {
  const q = String(req.query.q ?? '').trim().toLowerCase()
  if (!q) return res.json([])

  const rows =
    req.caller.role === 'admin'
      ? db
          .prepare('SELECT * FROM documents WHERE team_id = ? AND deleted_at IS NULL ORDER BY created_at DESC')
          .all(req.caller.team_id)
      : db
          .prepare(
            `SELECT d.* FROM documents d
             LEFT JOIN interventions i ON i.id = d.intervention_id
             WHERE d.team_id = ? AND d.deleted_at IS NULL AND (d.created_by = ? OR i.technicien_id = ?)
             ORDER BY d.created_at DESC`,
          )
          .all(req.caller.team_id, req.sessionId, req.caller.technicien_id)

  const latestByKey = new Map()
  for (const row of rows) {
    const name = `${row.client_first_name} ${row.client_last_name}`.trim()
    const phone = (row.phone ?? '').trim()
    const key = phone || `${name.toLowerCase()}|${(row.address ?? '').trim().toLowerCase()}`
    if (!key || key === '|') continue
    if (latestByKey.has(key)) continue
    latestByKey.set(key, {
      key,
      firstName: row.client_first_name,
      lastName: row.client_last_name,
      phone: row.phone,
      address: row.address,
      postalCode: row.postal_code,
      city: row.city,
      email: row.email,
    })
  }

  const results = Array.from(latestByKey.values())
    .filter((c) => `${c.firstName} ${c.lastName} ${c.phone ?? ''} ${c.address ?? ''}`.toLowerCase().includes(q))
    .slice(0, 8)

  res.json(results)
})

// Journal des encaissements en ligne (Stripe) — toutes les factures payées
// via un lien de paiement, avec le technicien associé à l'intervention
// d'origine quand elle existe. Admin uniquement, vue transverse.
documentsRouter.get('/payments', requireAdmin, (req, res) => {
  const rows = db
    .prepare(
      `SELECT d.*, i.technicien_id AS intervention_technicien_id, t.first_name AS tech_first_name, t.last_name AS tech_last_name
       FROM documents d
       LEFT JOIN interventions i ON i.id = d.intervention_id
       LEFT JOIN technicians t ON t.id = i.technicien_id
       WHERE d.kind = 'facture' AND d.stripe_payment_id IS NOT NULL AND d.team_id = ? AND d.deleted_at IS NULL
       ORDER BY d.paid_at DESC`,
    )
    .all(req.caller.team_id)

  res.json(
    rows.map((r) => ({
      id: r.id,
      number: r.number,
      client_name: `${r.client_first_name} ${r.client_last_name}`.trim(),
      amount: totalTTC(r),
      payment_method: r.payment_method,
      stripe_payment_id: r.stripe_payment_id,
      paid_at: r.paid_at,
      technicien_name: r.tech_first_name ? `${r.tech_first_name} ${r.tech_last_name}` : null,
      status: r.status,
    })),
  )
})

documentsRouter.get('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM documents WHERE id = ? AND deleted_at IS NULL').get(req.params.id)
  if (!row || !canAccess(req.caller, req.sessionId, row)) return res.status(404).json({ error: 'Document introuvable' })
  res.json(toApi(row))
})

// Facture générée à partir de ce devis, s'il y en a une — pour l'afficher
// dans l'onglet Historique du devis (lien vers la facture, pas seulement
// l'inverse).
documentsRouter.get('/:id/converted-to', (req, res) => {
  const devis = db.prepare('SELECT * FROM documents WHERE id = ?').get(req.params.id)
  if (!devis || !canAccess(req.caller, req.sessionId, devis)) return res.status(404).json({ error: 'Document introuvable' })
  const facture = db
    .prepare("SELECT * FROM documents WHERE kind = 'facture' AND source_devis_id = ? ORDER BY created_at ASC LIMIT 1")
    .get(req.params.id)
  res.json(facture ? toApi(facture) : null)
})

// Un devis démarre en brouillon (à valider/signer). Une facture créée
// directement (sans passer par un devis) est émise tout de suite — c'est
// une vente ponctuelle déjà réalisée, pas quelque chose à faire accepter.
documentsRouter.post('/', (req, res) => {
  const b = req.body ?? {}

  // Sans ce contrôle, un compte pouvait créer un devis/facture rattaché à
  // l'intervention_id d'une AUTRE équipe (deviné ou connu) — canAccess()
  // bloque bien la lecture croisée du document lui-même (il garde le
  // team_id du créateur), mais /:id/convert fait ensuite
  // `UPDATE interventions SET status='facturee' WHERE id = intervention_id`
  // sans revérifier l'équipe : ça aurait permis de modifier le statut d'une
  // intervention appartenant à une équipe totalement différente — une
  // altération de données inter-équipe, pas juste une fuite de lecture.
  if (b.interventionId) {
    const intervention = db.prepare('SELECT id, team_id FROM interventions WHERE id = ?').get(b.interventionId)
    if (!intervention || intervention.team_id !== req.caller.team_id) {
      return res.status(400).json({ error: 'Intervention introuvable dans cette équipe' })
    }
  }

  const kind = b.kind === 'facture' ? 'facture' : 'devis'
  const status = kind === 'facture' ? 'emise' : 'brouillon'
  const id = uuid()
  const items = JSON.stringify(b.items ?? [])

  db.prepare(
    `INSERT INTO documents
      (id, kind, number, intervention_id, client_first_name, client_last_name, phone, address, postal_code, city, email,
       items, vat_rate, notes, issue_date, validity_date, due_date, discount_type, discount_value,
       status, photos_before, photos_after, public_token, team_id, created_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '[]', ?, ?, ?, ?)`,
  ).run(
    id,
    kind,
    nextNumber(kind),
    b.interventionId ?? null,
    b.clientFirstName ?? '',
    b.clientLastName ?? '',
    b.phone ?? null,
    b.address ?? null,
    b.postalCode ?? null,
    b.city ?? null,
    b.email ?? null,
    items,
    b.vatRate ?? 10,
    b.notes ?? null,
    now().slice(0, 10),
    b.validityDate ?? null,
    b.dueDate ?? null,
    b.discountType === 'percent' ? 'percent' : 'amount',
    b.discountValue ?? 0,
    status,
    JSON.stringify(b.photosBefore ?? []),
    uuid(),
    req.caller.team_id,
    req.sessionId,
    now(),
  )

  broadcast('documents_changed', {}, req.caller.team_id)
  res.json(toApi(db.prepare('SELECT * FROM documents WHERE id = ?').get(id)))
})

documentsRouter.patch('/:id', (req, res) => {
  const b = req.body ?? {}
  const existing = db.prepare('SELECT * FROM documents WHERE id = ? AND deleted_at IS NULL').get(req.params.id)
  if (!existing || !canAccess(req.caller, req.sessionId, existing)) {
    return res.status(404).json({ error: 'Document introuvable' })
  }

  db.prepare(
    `UPDATE documents SET client_first_name=?, client_last_name=?, phone=?, address=?, postal_code=?, city=?, email=?,
     items=?, vat_rate=?, notes=?, issue_date=?, validity_date=?, due_date=?, discount_type=?, discount_value=?,
     photos_before=?, photos_after=? WHERE id=?`,
  ).run(
    b.clientFirstName ?? existing.client_first_name,
    b.clientLastName ?? existing.client_last_name,
    b.phone ?? existing.phone,
    b.address ?? existing.address,
    b.postalCode ?? existing.postal_code,
    b.city ?? existing.city,
    b.email ?? existing.email,
    b.items ? JSON.stringify(b.items) : existing.items,
    b.vatRate ?? existing.vat_rate,
    b.notes ?? existing.notes,
    b.issueDate ?? existing.issue_date,
    b.validityDate ?? existing.validity_date,
    b.dueDate ?? existing.due_date,
    b.discountType === 'percent' || b.discountType === 'amount' ? b.discountType : existing.discount_type,
    b.discountValue ?? existing.discount_value,
    b.photosBefore ? JSON.stringify(b.photosBefore) : existing.photos_before,
    b.photosAfter ? JSON.stringify(b.photosAfter) : existing.photos_after,
    req.params.id,
  )

  res.json(toApi(db.prepare('SELECT * FROM documents WHERE id = ?').get(req.params.id)))
})

documentsRouter.post('/:id/convert', (req, res) => {
  const devis = db
    .prepare("SELECT * FROM documents WHERE id = ? AND kind = 'devis' AND deleted_at IS NULL")
    .get(req.params.id)
  if (!devis || !canAccess(req.caller, req.sessionId, devis)) return res.status(404).json({ error: 'Devis introuvable' })
  if (devis.status !== 'signe') {
    return res.status(400).json({ error: 'Seul un devis signé peut être transformé en facture' })
  }

  const id = uuid()
  const dueDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  db.prepare(
    `INSERT INTO documents
      (id, kind, number, intervention_id, client_first_name, client_last_name, phone, address, postal_code, city, email,
       items, vat_rate, notes, issue_date, due_date, discount_type, discount_value, photos_before,
       photos_after, status, public_token, source_devis_id, team_id, created_by, created_at)
     VALUES (?, 'facture', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '[]', 'emise', ?, ?, ?, ?, ?)`,
  ).run(
    id,
    nextNumber('facture'),
    devis.intervention_id,
    devis.client_first_name,
    devis.client_last_name,
    devis.phone,
    devis.address,
    devis.postal_code,
    devis.city,
    devis.email,
    devis.items,
    devis.vat_rate,
    devis.notes,
    now().slice(0, 10),
    dueDate,
    devis.discount_type,
    devis.discount_value,
    devis.photos_before,
    uuid(),
    devis.id,
    devis.team_id,
    req.sessionId,
    now(),
  )

  if (devis.intervention_id) {
    db.prepare("UPDATE interventions SET status = 'facturee' WHERE id = ?").run(devis.intervention_id)
  }

  const facture = db.prepare('SELECT * FROM documents WHERE id = ?').get(id)
  const total = totalTTC(facture)
  notifyAdmin(
    facture.team_id,
    'facture_creee',
    '🧾 Facture à acquitter !',
    `${facture.client_first_name} ${facture.client_last_name} — ${total.toFixed(2)} € — ${facture.number}`.trim(),
    { document_id: facture.id },
  )

  broadcast('documents_changed', {}, facture.team_id)
  res.json(toApi(facture))
})

// Crée un vrai lien de paiement Stripe ("Payment Link", buy.stripe.com/...)
// pour le solde dû de la facture, et renvoie son URL — génère une matrice QR
// bien plus simple à scanner qu'une session Checkout classique (dont l'URL
// checkout.stripe.com/c/pay/... dépasse souvent 400 caractères, fragment de
// session inclus) : un Payment Link ne fait qu'une cinquantaine de
// caractères, ET résout directement sur le domaine de Stripe, sans jamais
// transiter par notre propre serveur. Contrairement à une session Checkout
// (à usage unique par nature), un Payment Link reste actif tant qu'on ne le
// désactive pas explicitement — un précédent lien encore actif pour cette
// facture est donc désactivé avant d'en créer un nouveau, et le webhook
// (stripeWebhook.mjs) désactive celui-ci à son tour une fois payé.
documentsRouter.post('/:id/stripe-payment-link', externalActionLimiter, async (req, res) => {
  const stripe = getStripe()
  if (!stripe) {
    return res.status(400).json({ error: "Stripe n'est pas configuré (clé secrète manquante)." })
  }

  const existing = db
    .prepare("SELECT * FROM documents WHERE id = ? AND kind = 'facture' AND deleted_at IS NULL")
    .get(req.params.id)
  if (!existing || !canAccess(req.caller, req.sessionId, existing)) {
    return res.status(404).json({ error: 'Facture introuvable' })
  }
  if (existing.status === 'payee') return res.status(400).json({ error: 'Cette facture est déjà payée' })

  const amount = Math.round(totalTTC(existing) * 100)
  if (amount <= 0) return res.status(400).json({ error: 'Montant invalide' })

  const publicUrl = req.get('origin') ?? process.env.PUBLIC_URL ?? 'http://localhost:5173'
  const clientName = [existing.client_first_name, existing.client_last_name].filter(Boolean).join(' ') || 'Client'

  try {
    if (existing.stripe_payment_link_id) {
      try {
        await stripe.paymentLinks.update(existing.stripe_payment_link_id, { active: false })
      } catch {
        // déjà désactivé, ou introuvable côté Stripe — pas bloquant
      }
    }

    const link = await stripe.paymentLinks.create({
      line_items: [
        {
          price_data: {
            currency: 'eur',
            unit_amount: amount,
            product_data: { name: `Facture ${existing.number} — ${clientName}` },
          },
          quantity: 1,
        },
      ],
      metadata: { document_id: existing.id },
      after_completion: {
        type: 'redirect',
        redirect: { url: `${publicUrl}/facture/${existing.public_token}?paiement=succes` },
      },
    })

    db.prepare('UPDATE documents SET stripe_payment_link_id = ? WHERE id = ?').run(link.id, existing.id)
    res.json({ url: link.url })
  } catch (e) {
    res.status(500).json({ error: e.message ?? 'Erreur Stripe' })
  }
})

documentsRouter.post('/:id/pay', (req, res) => {
  const { paymentMethod } = req.body ?? {}
  const existing = db
    .prepare("SELECT * FROM documents WHERE id = ? AND kind = 'facture' AND deleted_at IS NULL")
    .get(req.params.id)
  if (!existing || !canAccess(req.caller, req.sessionId, existing)) {
    return res.status(404).json({ error: 'Facture introuvable' })
  }

  db.prepare("UPDATE documents SET status='payee', paid_at=?, payment_method=? WHERE id=?").run(
    now(),
    paymentMethod,
    req.params.id,
  )

  broadcast('documents_changed', {}, req.caller.team_id)
  res.json(toApi(db.prepare('SELECT * FROM documents WHERE id = ?').get(req.params.id)))
})

// Annule un paiement enregistré par erreur — remet la facture à "emise",
// efface la date/le moyen de paiement.
documentsRouter.post('/:id/unpay', (req, res) => {
  const existing = db
    .prepare("SELECT * FROM documents WHERE id = ? AND kind = 'facture' AND deleted_at IS NULL")
    .get(req.params.id)
  if (!existing || !canAccess(req.caller, req.sessionId, existing)) {
    return res.status(404).json({ error: 'Facture introuvable' })
  }

  db.prepare("UPDATE documents SET status='emise', paid_at=NULL, payment_method=NULL WHERE id=?").run(req.params.id)

  broadcast('documents_changed', {}, req.caller.team_id)
  res.json(toApi(db.prepare('SELECT * FROM documents WHERE id = ?').get(req.params.id)))
})

documentsRouter.post('/:id/duplicate', (req, res) => {
  const src = db.prepare('SELECT * FROM documents WHERE id = ? AND deleted_at IS NULL').get(req.params.id)
  if (!src || !canAccess(req.caller, req.sessionId, src)) return res.status(403).json({ error: 'Accès refusé' })

  const id = uuid()
  db.prepare(
    `INSERT INTO documents
      (id, kind, number, intervention_id, client_first_name, client_last_name, phone, address, postal_code, city, email,
       items, vat_rate, notes, issue_date, validity_date, due_date, discount_type, discount_value,
       status, photos_before, photos_after, public_token, team_id, created_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '[]', ?, ?, ?, ?)`,
  ).run(
    id,
    src.kind,
    nextNumber(src.kind),
    src.intervention_id,
    src.client_first_name,
    src.client_last_name,
    src.phone,
    src.address,
    src.postal_code,
    src.city,
    src.email,
    src.items,
    src.vat_rate,
    src.notes,
    now().slice(0, 10),
    src.validity_date,
    src.due_date,
    src.discount_type,
    src.discount_value,
    src.kind === 'devis' ? 'brouillon' : 'emise',
    src.photos_before,
    uuid(),
    src.team_id,
    req.sessionId,
    now(),
  )

  broadcast('documents_changed', {}, src.team_id)
  res.json(toApi(db.prepare('SELECT * FROM documents WHERE id = ?').get(id)))
})

// Suppression douce (admin) ou demande de suppression (technicien) : un
// admin supprime directement (passe dans la corbeille) ; un technicien ne
// fait que DEMANDER la suppression d'un devis/facture — il reste visible
// (grisé, "en attente") tant qu'un admin n'a pas confirmé. Une fiche encore
// totalement vide (aucun client, aucun article — brouillon abandonné) part
// toujours directement, quel que soit le rôle : rien à perdre, pas besoin
// de confirmation. Un technicien n'a jamais le droit de demander la
// suppression d'une intervention, seulement d'un devis/facture (contrôlé
// par la route dédiée aux interventions, pas celle-ci).
documentsRouter.delete('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM documents WHERE id = ? AND deleted_at IS NULL').get(req.params.id)
  if (!existing || !canAccess(req.caller, req.sessionId, existing)) {
    return res.status(403).json({ error: 'Accès refusé' })
  }

  const isEmpty =
    !existing.client_first_name?.trim() &&
    !existing.client_last_name?.trim() &&
    JSON.parse(existing.items || '[]').length === 0

  if (req.caller.role === 'admin' || isEmpty) {
    db.prepare(
      'UPDATE documents SET deleted_at = ?, deletion_requested_at = NULL, deletion_requested_by = NULL WHERE id = ?',
    ).run(now(), req.params.id)
  } else {
    db.prepare('UPDATE documents SET deletion_requested_at = ?, deletion_requested_by = ? WHERE id = ?').run(
      now(),
      req.sessionId,
      req.params.id,
    )
  }
  broadcast('documents_changed', {}, req.caller.team_id)
  res.json(toApi(db.prepare('SELECT * FROM documents WHERE id = ?').get(req.params.id)))
})

// Le technicien qui a demandé la suppression annule sa propre demande (bouton
// "Récupérer") — un admin peut aussi l'utiliser pour refuser une demande.
documentsRouter.post('/:id/cancel-deletion-request', (req, res) => {
  const existing = db.prepare('SELECT * FROM documents WHERE id = ? AND deletion_requested_at IS NOT NULL').get(req.params.id)
  if (!existing || !canAccess(req.caller, req.sessionId, existing)) {
    return res.status(404).json({ error: 'Aucune demande de suppression en cours' })
  }
  db.prepare('UPDATE documents SET deletion_requested_at = NULL, deletion_requested_by = NULL WHERE id = ?').run(
    req.params.id,
  )
  broadcast('documents_changed', {}, req.caller.team_id)
  res.json(toApi(db.prepare('SELECT * FROM documents WHERE id = ?').get(req.params.id)))
})

// Admin confirme une demande de suppression faite par un technicien — le
// document part alors vraiment dans la corbeille.
documentsRouter.post('/:id/confirm-deletion', requireAdmin, (req, res) => {
  const existing = db
    .prepare('SELECT * FROM documents WHERE id = ? AND deletion_requested_at IS NOT NULL AND team_id = ?')
    .get(req.params.id, req.caller.team_id)
  if (!existing) return res.status(404).json({ error: 'Aucune demande de suppression en cours' })
  db.prepare(
    'UPDATE documents SET deleted_at = ?, deletion_requested_at = NULL, deletion_requested_by = NULL WHERE id = ?',
  ).run(now(), req.params.id)
  broadcast('documents_changed', {}, req.caller.team_id)
  res.json({ ok: true })
})

// Corbeille — admin uniquement : vue transverse sur tout ce que SON équipe a
// supprimé, pour repérer un geste malheureux et pouvoir revenir dessus.
documentsRouter.get('/trash/list', requireAdmin, (req, res) => {
  const rows = db
    .prepare('SELECT * FROM documents WHERE deleted_at IS NOT NULL AND team_id = ? ORDER BY deleted_at DESC')
    .all(req.caller.team_id)
  res.json(rows.map(toApi))
})

documentsRouter.post('/trash/restore-all', requireAdmin, (req, res) => {
  db.prepare('UPDATE documents SET deleted_at = NULL WHERE deleted_at IS NOT NULL AND team_id = ?').run(req.caller.team_id)
  broadcast('documents_changed', {}, req.caller.team_id)
  res.json({ ok: true })
})

documentsRouter.delete('/trash/purge-all', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM documents WHERE deleted_at IS NOT NULL AND team_id = ?').run(req.caller.team_id)
  broadcast('documents_changed', {}, req.caller.team_id)
  res.json({ ok: true })
})

documentsRouter.post('/:id/restore', requireAdmin, (req, res) => {
  const existing = db
    .prepare('SELECT * FROM documents WHERE id = ? AND deleted_at IS NOT NULL AND team_id = ?')
    .get(req.params.id, req.caller.team_id)
  if (!existing) return res.status(404).json({ error: 'Document introuvable dans la corbeille' })
  db.prepare('UPDATE documents SET deleted_at = NULL WHERE id = ?').run(req.params.id)
  broadcast('documents_changed', {}, req.caller.team_id)
  res.json(toApi(db.prepare('SELECT * FROM documents WHERE id = ?').get(req.params.id)))
})

documentsRouter.delete('/:id/permanent', requireAdmin, (req, res) => {
  const existing = db
    .prepare('SELECT * FROM documents WHERE id = ? AND deleted_at IS NOT NULL AND team_id = ?')
    .get(req.params.id, req.caller.team_id)
  if (!existing) return res.status(404).json({ error: 'Document introuvable dans la corbeille' })
  db.prepare('DELETE FROM documents WHERE id = ?').run(req.params.id)
  broadcast('documents_changed', {}, req.caller.team_id)
  res.json({ ok: true })
})
