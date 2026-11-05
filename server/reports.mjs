import { db, now, uuid } from './db.mjs'

// Rapport d'intervention : un document à part entière, comme un devis ou une
// facture — numéro, client, horaires, facture liée, photos, compte-rendu.
// Il part d'une fiche d'intervention ou d'un devis / d'une facture (ou des
// deux) : tout ce que l'app sait déjà est recopié à la création, puis reste
// modifiable. Le PDF est composé par l'app (shared/reportPdf.mjs).

const parse = (value, fallback) => {
  try {
    return JSON.parse(value)
  } catch {
    return fallback
  }
}

export function reportToApi(row) {
  if (!row) return row
  return { ...row, motifs: parse(row.motifs, []), photos: parse(row.photos, []) }
}

const fullName = (row) => (row ? [row.first_name, row.last_name].filter(Boolean).join(' ').trim() : '')
export const technicianName = (id) => (id ? fullName(db.prepare('SELECT first_name, last_name FROM technicians WHERE id = ?').get(id)) : '')
export const userName = (id) => (id ? fullName(db.prepare('SELECT first_name, last_name FROM users WHERE id = ?').get(id)) : '')

// « R2026-00001 », numérotation propre à chaque entreprise, par année.
export function nextReportNumber(teamId, at = new Date()) {
  const year = new Date(at).toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris', year: 'numeric' })
  const row = db
    .prepare(
      `SELECT number FROM intervention_reports WHERE team_id = ? AND number LIKE ?
       ORDER BY CAST(substr(number, -5) AS INTEGER) DESC LIMIT 1`,
    )
    .get(teamId, `R${year}-%`)
  const last = row ? parseInt(row.number.slice(-5), 10) || 0 : 0
  return `R${year}-${String(last + 1).padStart(5, '0')}`
}

// Dernière facture (sinon dernier devis) d'une fiche.
export function documentForIntervention(interventionId) {
  if (!interventionId) return null
  const pick = (kind) =>
    db
      .prepare('SELECT * FROM documents WHERE intervention_id = ? AND kind = ? AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 1')
      .get(interventionId, kind)
  return pick('facture') ?? pick('devis') ?? null
}

export function documentToApi(row) {
  if (!row) return null
  return {
    id: row.id,
    kind: row.kind,
    number: row.number,
    status: row.status,
    issue_date: row.issue_date,
    items: parse(row.items, []),
    vat_rate: row.vat_rate,
    discount_type: row.discount_type,
    discount_value: row.discount_value,
    paid_at: row.paid_at,
    payment_method: row.payment_method,
  }
}

const unique = (list) => [...new Set(list.filter(Boolean))]

// Contenu d'un nouveau rapport, d'après la fiche et/ou le document choisis.
// Les coordonnées du document l'emportent (souvent plus complètes : email,
// code postal), les horaires viennent de la fiche.
export function newReportFields({ intervention, document, caller }) {
  // Nom du document s'il en a un, sinon celui de la fiche.
  const src = document?.client_first_name || document?.client_last_name ? document : (intervention ?? document ?? {})
  const pick = (key) => document?.[key] || intervention?.[key] || null
  const techId = caller.role === 'admin' ? (intervention?.technicien_id ?? null) : caller.technicien_id
  return {
    intervention_id: intervention?.id ?? null,
    document_id: document?.id ?? null,
    technicien_id: techId,
    technicien_name: technicianName(intervention?.technicien_id) || technicianName(caller.technicien_id) || userName(caller.user_id),
    client_first_name: src.client_first_name ?? '',
    client_last_name: src.client_last_name ?? '',
    phone: pick('phone'),
    email: document?.email || null,
    address: pick('address'),
    postal_code: pick('postal_code'),
    city: pick('city'),
    intervention_type: intervention?.intervention_type ?? '',
    arrival_at: intervention?.started_at ?? null,
    end_at: intervention?.completed_at ?? null,
    photos: unique([
      ...parse(intervention?.photos ?? '[]', []),
      ...parse(document?.photos_before ?? '[]', []),
      ...parse(document?.photos_after ?? '[]', []),
    ]),
  }
}

export function insertReport(teamId, caller, fields, notes) {
  const id = uuid()
  const at = now()
  db.prepare(
    `INSERT INTO intervention_reports (id, number, intervention_id, document_id, team_id, technicien_id, technicien_name,
       client_first_name, client_last_name, phone, email, address, postal_code, city, intervention_type,
       arrival_at, end_at, photos, notes, created_by, created_by_name, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    nextReportNumber(teamId),
    fields.intervention_id,
    fields.document_id,
    teamId,
    fields.technicien_id,
    fields.technicien_name,
    fields.client_first_name,
    fields.client_last_name,
    fields.phone,
    fields.email,
    fields.address,
    fields.postal_code,
    fields.city,
    fields.intervention_type,
    fields.arrival_at,
    fields.end_at,
    JSON.stringify(fields.photos ?? []),
    notes ?? '',
    caller.id,
    userName(caller.user_id),
    at,
    at,
  )
  return id
}

// Rapports créés avant ce format : numéro et coordonnées repris de leur fiche.
function backfillOldReports() {
  const rows = db.prepare('SELECT * FROM intervention_reports WHERE number IS NULL ORDER BY created_at').all()
  for (const r of rows) {
    const i = r.intervention_id ? db.prepare('SELECT * FROM interventions WHERE id = ?').get(r.intervention_id) : null
    const f = newReportFields({
      intervention: i,
      document: documentForIntervention(i?.id),
      caller: { role: 'admin', technicien_id: r.technicien_id },
    })
    db.prepare(
      `UPDATE intervention_reports SET number = ?, document_id = ?, technicien_name = ?, client_first_name = ?, client_last_name = ?,
         phone = ?, email = ?, address = ?, postal_code = ?, city = ?, intervention_type = ?, end_at = COALESCE(end_at, ?),
         arrival_at = COALESCE(arrival_at, ?), photos = ?, updated_at = COALESCE(updated_at, created_at) WHERE id = ?`,
    ).run(
      nextReportNumber(r.team_id, r.created_at),
      f.document_id,
      technicianName(r.technicien_id) || f.technicien_name,
      f.client_first_name,
      f.client_last_name,
      f.phone,
      f.email,
      f.address,
      f.postal_code,
      f.city,
      f.intervention_type,
      f.end_at,
      f.arrival_at,
      JSON.stringify(f.photos),
      r.id,
    )
  }
}
backfillOldReports()

const hm = (iso) => new Date(iso).toLocaleTimeString('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit' })
const day = (iso) => new Date(iso).toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris' })

// Compte-rendu de départ, sans IA : rempli avec ce que l'app sait (motif,
// arrivée, lignes de la facture). L'IA le remplace ensuite si elle est activée.
export function starterNotes({ intervention, document, fields }) {
  const items = parse(document?.items ?? '[]', [])
  const services = items.filter((i) => i.itemType !== 'materiel')
  const materiel = items.filter((i) => i.itemType === 'materiel')
  const line = (i) =>
    `- ${i.label}${i.description ? ` (${i.description})` : ''}${i.quantity && i.quantity !== 1 ? ` × ${String(i.quantity).replace('.', ',')}` : ''}`
  const parts = []
  const motif = intervention?.description?.trim() || fields.intervention_type
  if (motif) parts.push(`Motif de l'intervention :\n${motif}`)
  if (fields.arrival_at) {
    parts.push(`Constat à l'arrivée :\nLe technicien est arrivé sur place le ${day(fields.arrival_at)} à ${hm(fields.arrival_at)}.`)
  }
  if (services.length) parts.push(`Travaux réalisés :\n${services.map(line).join('\n')}`)
  if (materiel.length) parts.push(`Matériel fourni :\n${materiel.map(line).join('\n')}`)
  if (fields.end_at) parts.push(`État à la fin de l'intervention :\nIntervention terminée le ${day(fields.end_at)} à ${hm(fields.end_at)}.`)
  return parts.join('\n\n')
}
