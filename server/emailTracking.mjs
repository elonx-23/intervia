import { db, now, uuid } from './db.mjs'
import { broadcast } from './events.mjs'

// Suivi des emails de devis/facture envoyés au client : chaque envoi a son
// identifiant, glissé dans le lien « Consulter » (clic) et dans une image
// invisible de 1 px (ouverture). Affiché dans l'onglet Historique du document.
//
// Limites à connaître : « ouvert » dépend des images — certaines messageries
// les bloquent (jamais « ouvert ») et Apple Mail les précharge (« ouvert »
// même sans lecture). Le clic sur le lien, lui, est fiable.

db.exec(`
  CREATE TABLE IF NOT EXISTS document_emails (
    id TEXT PRIMARY KEY,
    document_id TEXT NOT NULL,
    team_id TEXT,
    kind TEXT NOT NULL,
    to_email TEXT,
    status TEXT NOT NULL,
    error TEXT,
    sent_at TEXT NOT NULL,
    opened_at TEXT,
    open_count INTEGER NOT NULL DEFAULT 0,
    clicked_at TEXT,
    click_count INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS idx_document_emails_doc ON document_emails (document_id, sent_at);
`)

// kind : 'envoi' | 'relance'
export function startEmail(doc, kind) {
  const id = uuid()
  db.prepare(
    "INSERT INTO document_emails (id, document_id, team_id, kind, to_email, status, sent_at) VALUES (?, ?, ?, ?, ?, 'envoi_en_cours', ?)",
  ).run(id, doc.id, doc.team_id, kind, doc.email, now())
  return id
}

export function finishEmail(id, error) {
  db.prepare('UPDATE document_emails SET status = ?, error = ? WHERE id = ?').run(
    error ? 'echec' : 'envoye',
    error ? String(error.message ?? error).slice(0, 300) : null,
    id,
  )
  const row = db.prepare('SELECT document_id, team_id FROM document_emails WHERE id = ?').get(id)
  if (row) broadcast('documents_changed', { id: row.document_id }, row.team_id)
}

export function trackedLink(link, id) {
  return `${link}${link.includes('?') ? '&' : '?'}m=${id}`
}

export function trackingPixel(baseUrl, id) {
  return `<img src="${baseUrl}/api/documents/m/${id}/o.gif" width="1" height="1" alt="" style="display:block;border:0;width:1px;height:1px;" />`
}

function touch(id, column, countColumn) {
  const row = db.prepare('SELECT document_id, team_id FROM document_emails WHERE id = ?').get(id)
  if (!row) return
  db.prepare(`UPDATE document_emails SET ${column} = COALESCE(${column}, ?), ${countColumn} = ${countColumn} + 1 WHERE id = ?`).run(now(), id)
  broadcast('documents_changed', { id: row.document_id }, row.team_id)
}

export function recordOpen(id) {
  touch(id, 'opened_at', 'open_count')
}

// Clic sur le lien de l'email : seulement si l'identifiant correspond bien à
// un envoi de CE document (un identifiant d'un autre document est ignoré).
// Un clic prouve aussi que l'email a été ouvert.
export function recordClick(documentId, id) {
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) return
  const row = db.prepare('SELECT 1 FROM document_emails WHERE id = ? AND document_id = ?').get(id, documentId)
  if (!row) return
  db.prepare('UPDATE document_emails SET opened_at = COALESCE(opened_at, ?) WHERE id = ?').run(now(), id)
  touch(id, 'clicked_at', 'click_count')
}

export function emailsForDocument(documentId) {
  return db
    .prepare(
      `SELECT id, kind, to_email, status, error, sent_at, opened_at, open_count, clicked_at, click_count
       FROM document_emails WHERE document_id = ? ORDER BY sent_at`,
    )
    .all(documentId)
}

// GIF transparent de 1×1 px.
export const PIXEL_GIF = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64')
