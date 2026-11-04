import { Router } from 'express'

import { requireAdmin, requireAuth } from '../auth.mjs'
import { db, now, uuid } from '../db.mjs'
import { broadcast } from '../events.mjs'
import { connect, listChats, listGroups, logout, sendQueued, sessionStatus } from '../whatsappSession.mjs'

// Envoi des fiches sur WhatsApp à des contacts, classés en deux listes :
// « 25 % » (techniciens) et « 50/50 » (partenaires). WhatsApp ne laisse pas
// une app poster seule : l'app prépare le message et ouvre la conversation
// de chaque contact, l'admin appuie sur Envoyer. Elle garde la trace de qui
// a reçu la fiche, et de qui l'a finalement prise, à quel pourcentage.

db.exec(`
  CREATE TABLE IF NOT EXISTS whatsapp_contacts (
    id TEXT PRIMARY KEY,
    team_id TEXT NOT NULL,
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    category TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_whatsapp_contacts_team ON whatsapp_contacts (team_id, category);

  CREATE TABLE IF NOT EXISTS intervention_shares (
    id TEXT PRIMARY KEY,
    intervention_id TEXT NOT NULL,
    team_id TEXT NOT NULL,
    contact_id TEXT,
    contact_name TEXT,
    phone TEXT,
    category TEXT NOT NULL,
    sent_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_intervention_shares_i ON intervention_shares (intervention_id, sent_at);

  -- Discussions WhatsApp (contacts ou groupes) mises en favori, affichées en
  -- premier. chat_id = même identifiant que le téléphone d'un contact du
  -- tableau (numéro, ou identifiant de groupe …@g.us).
  CREATE TABLE IF NOT EXISTS whatsapp_favorites (
    team_id TEXT NOT NULL,
    chat_id TEXT NOT NULL,
    name TEXT,
    kind TEXT,
    created_at TEXT NOT NULL,
    PRIMARY KEY (team_id, chat_id)
  );
`)
for (const sql of [
  'ALTER TABLE interventions ADD COLUMN taken_by_contact_id TEXT',
  'ALTER TABLE interventions ADD COLUMN taken_by_name TEXT',
  'ALTER TABLE interventions ADD COLUMN share_percent REAL',
  'ALTER TABLE intervention_shares ADD COLUMN status TEXT',
  'ALTER TABLE intervention_shares ADD COLUMN error TEXT',
]) {
  try {
    db.exec(sql)
  } catch {
    // colonne déjà là
  }
}

export const whatsappRouter = Router()
whatsappRouter.use(requireAuth, requireAdmin)

const CATEGORIES = new Set(['25', '50'])
// Part reversée à celui qui prend l'intervention.
const PERCENT = { 25: 25, 50: 50 }

function cleanPhone(raw) {
  // Groupe WhatsApp (choisi dans la liste des groupes du WhatsApp relié).
  if (/^[\w.-]+@(g\.us|s\.whatsapp\.net|lid)$/.test(String(raw ?? '').trim())) return String(raw).trim()
  const digits = String(raw ?? '').replace(/[^\d+]/g, '')
  if (/^0[1-9]\d{8}$/.test(digits)) return digits
  if (/^\+33[1-9]\d{8}$/.test(digits)) return `0${digits.slice(3)}`
  if (/^0033[1-9]\d{8}$/.test(digits)) return `0${digits.slice(4)}`
  if (/^\+\d{8,15}$/.test(digits)) return digits
  return null
}

function interventionOr404(req, res) {
  const row = db.prepare('SELECT * FROM interventions WHERE id = ? AND team_id = ?').get(req.params.id, req.caller.team_id)
  if (!row) res.status(404).json({ error: 'Intervention introuvable' })
  return row
}

// ---------- WhatsApp relié (QR code) ----------

whatsappRouter.get('/session', (req, res) => res.json(sessionStatus(req.caller.team_id)))

whatsappRouter.post('/session/connect', async (req, res) => {
  try {
    res.json(await connect(req.caller.team_id))
  } catch (e) {
    console.log(`[whatsapp] connexion impossible : ${e.message}`)
    res.status(502).json({ error: 'Impossible de démarrer la connexion WhatsApp, réessaie.' })
  }
})

whatsappRouter.post('/session/logout', async (req, res) => {
  await logout(req.caller.team_id)
  res.json(sessionStatus(req.caller.team_id))
})

whatsappRouter.get('/chats', async (req, res) => {
  try {
    res.json(await listChats(req.caller.team_id))
  } catch (e) {
    res.status(e.status ?? 502).json({ error: e.status ? e.message : 'Impossible de lire tes discussions WhatsApp.' })
  }
})

// Ajout de plusieurs destinataires d'un coup (choisis dans les discussions WhatsApp).
whatsappRouter.post('/contacts/bulk', (req, res) => {
  const category = String(req.body?.category ?? '')
  if (!CATEGORIES.has(category)) return res.status(400).json({ error: 'Liste invalide.' })
  const items = Array.isArray(req.body?.items) ? req.body.items.slice(0, 200) : []
  const existing = new Set(
    db.prepare('SELECT phone FROM whatsapp_contacts WHERE team_id = ? AND category = ?').all(req.caller.team_id, category).map((r) => r.phone),
  )
  const added = []
  for (const it of items) {
    const name = String(it?.name ?? '').trim().slice(0, 80)
    const phone = cleanPhone(it?.id)
    if (!name || !phone || existing.has(phone)) continue
    const id = uuid()
    db.prepare('INSERT INTO whatsapp_contacts (id, team_id, name, phone, category, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(
      id,
      req.caller.team_id,
      name,
      phone,
      category,
      now(),
    )
    existing.add(phone)
    added.push({ id, name, phone, category })
  }
  res.json(added)
})

whatsappRouter.get('/groups', async (req, res) => {
  try {
    res.json(await listGroups(req.caller.team_id))
  } catch (e) {
    res.status(e.status ?? 502).json({ error: e.status ? e.message : 'Impossible de lire tes groupes WhatsApp.' })
  }
})

// ---------- Favoris ----------

whatsappRouter.get('/favorites', (req, res) => {
  res.json(db.prepare('SELECT chat_id AS id, name, kind FROM whatsapp_favorites WHERE team_id = ? ORDER BY name COLLATE NOCASE').all(req.caller.team_id))
})

whatsappRouter.put('/favorites/:chatId', (req, res) => {
  const id = String(req.params.chatId).slice(0, 120)
  if (!cleanPhone(id)) return res.status(400).json({ error: 'Discussion invalide.' })
  db.prepare(
    `INSERT INTO whatsapp_favorites (team_id, chat_id, name, kind, created_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(team_id, chat_id) DO UPDATE SET name = excluded.name, kind = excluded.kind`,
  ).run(req.caller.team_id, id, String(req.body?.name ?? '').slice(0, 80) || null, req.body?.kind === 'groupe' ? 'groupe' : 'contact', now())
  res.json({ ok: true })
})

whatsappRouter.delete('/favorites/:chatId', (req, res) => {
  db.prepare('DELETE FROM whatsapp_favorites WHERE team_id = ? AND chat_id = ?').run(req.caller.team_id, String(req.params.chatId))
  res.json({ ok: true })
})

// ---------- Contacts ----------

whatsappRouter.get('/contacts', (req, res) => {
  res.json(db.prepare('SELECT id, name, phone, category FROM whatsapp_contacts WHERE team_id = ? ORDER BY name COLLATE NOCASE').all(req.caller.team_id))
})

whatsappRouter.post('/contacts', (req, res) => {
  const name = String(req.body?.name ?? '').trim().slice(0, 80)
  const phone = cleanPhone(req.body?.phone)
  const category = String(req.body?.category ?? '')
  if (!name) return res.status(400).json({ error: 'Indique un nom.' })
  if (!phone) return res.status(400).json({ error: 'Numéro de téléphone invalide.' })
  if (!CATEGORIES.has(category)) return res.status(400).json({ error: 'Liste invalide.' })
  const id = uuid()
  db.prepare('INSERT INTO whatsapp_contacts (id, team_id, name, phone, category, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(
    id,
    req.caller.team_id,
    name,
    phone,
    category,
    now(),
  )
  res.json({ id, name, phone, category })
})

// Passe un contact d'une liste à l'autre (25 % ↔ 50/50) ou le renomme.
whatsappRouter.patch('/contacts/:contactId', (req, res) => {
  const c = db.prepare('SELECT * FROM whatsapp_contacts WHERE id = ? AND team_id = ?').get(req.params.contactId, req.caller.team_id)
  if (!c) return res.status(404).json({ error: 'Contact introuvable' })
  const category = req.body?.category !== undefined ? String(req.body.category) : c.category
  const name = req.body?.name !== undefined ? String(req.body.name).trim().slice(0, 80) : c.name
  if (!CATEGORIES.has(category)) return res.status(400).json({ error: 'Liste invalide.' })
  if (!name) return res.status(400).json({ error: 'Indique un nom.' })
  const duplicate = db
    .prepare('SELECT 1 FROM whatsapp_contacts WHERE team_id = ? AND phone = ? AND category = ? AND id != ?')
    .get(req.caller.team_id, c.phone, category, c.id)
  if (duplicate) {
    // Déjà dans l'autre liste : on retire simplement celui-ci.
    db.prepare('DELETE FROM whatsapp_contacts WHERE id = ?').run(c.id)
    return res.json({ merged: true })
  }
  db.prepare('UPDATE whatsapp_contacts SET category = ?, name = ? WHERE id = ?').run(category, name, c.id)
  res.json({ id: c.id, name, phone: c.phone, category })
})

whatsappRouter.delete('/contacts/:contactId', (req, res) => {
  db.prepare('DELETE FROM whatsapp_contacts WHERE id = ? AND team_id = ?').run(req.params.contactId, req.caller.team_id)
  res.json({ ok: true })
})

// ---------- Envois d'une fiche ----------

function sharesOf(interventionId) {
  return db
    .prepare('SELECT id, contact_id, contact_name, phone, category, status, error, sent_at FROM intervention_shares WHERE intervention_id = ? ORDER BY sent_at DESC')
    .all(interventionId)
}

whatsappRouter.get('/interventions/:id/shares', (req, res) => {
  const row = interventionOr404(req, res)
  if (!row) return
  res.json({
    shares: sharesOf(row.id),
    takenBy: row.taken_by_name ? { contactId: row.taken_by_contact_id, name: row.taken_by_name, percent: row.share_percent } : null,
  })
})

// Enregistre l'envoi de la fiche aux contacts choisis (l'ouverture de
// WhatsApp se fait ensuite sur l'appareil de l'admin).
whatsappRouter.post('/interventions/:id/shares', (req, res) => {
  const row = interventionOr404(req, res)
  if (!row) return
  const ids = Array.isArray(req.body?.contactIds) ? req.body.contactIds.map(String).slice(0, 200) : []
  if (ids.length === 0) return res.status(400).json({ error: 'Choisis au moins un contact.' })
  const contacts = db
    .prepare(`SELECT * FROM whatsapp_contacts WHERE team_id = ? AND id IN (${ids.map(() => '?').join(', ')})`)
    .all(req.caller.team_id, ...ids)
  const insert = db.prepare(
    'INSERT INTO intervention_shares (id, intervention_id, team_id, contact_id, contact_name, phone, category, sent_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
  )
  for (const c of contacts) insert.run(uuid(), row.id, row.team_id, c.id, c.name, c.phone, c.category, now())
  broadcast('interventions_changed', {}, row.team_id)
  res.json({ shares: sharesOf(row.id), contacts })
})

// Envoi DIRECT depuis le WhatsApp relié : la réponse revient tout de suite,
// les messages partent ensuite un par un (espacés) et chaque ligne passe à
// « envoyé » ou « échec » en direct.
whatsappRouter.post('/interventions/:id/send', (req, res) => {
  const row = interventionOr404(req, res)
  if (!row) return
  const teamId = req.caller.team_id
  if (sessionStatus(teamId).status !== 'connecte') return res.status(400).json({ error: "Relie d'abord ton WhatsApp à l'app." })
  const text = String(req.body?.message ?? '').trim().slice(0, 1000)
  if (!text) return res.status(400).json({ error: 'Le message est vide.' })
  const ids = Array.isArray(req.body?.contactIds) ? req.body.contactIds.map(String).slice(0, 100) : []
  if (ids.length === 0) return res.status(400).json({ error: 'Choisis au moins un contact.' })
  const contacts = db
    .prepare(`SELECT * FROM whatsapp_contacts WHERE team_id = ? AND id IN (${ids.map(() => '?').join(', ')})`)
    .all(teamId, ...ids)

  const insert = db.prepare(
    "INSERT INTO intervention_shares (id, intervention_id, team_id, contact_id, contact_name, phone, category, status, sent_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'envoi', ?)",
  )
  const targets = contacts.map((c) => {
    const shareId = uuid()
    insert.run(shareId, row.id, teamId, c.id, c.name, c.phone, c.category, now())
    return { ...c, shareId }
  })
  broadcast('interventions_changed', {}, teamId)
  res.json({ shares: sharesOf(row.id) })

  sendQueued(teamId, targets, text, (target, error) => {
    db.prepare('UPDATE intervention_shares SET status = ?, error = ?, sent_at = ? WHERE id = ?').run(
      error ? 'echec' : 'envoye',
      error ? String(error.message).slice(0, 200) : null,
      now(),
      target.shareId,
    )
    broadcast('interventions_changed', {}, teamId)
  }).catch((e) => {
    db.prepare("UPDATE intervention_shares SET status = 'echec', error = ? WHERE intervention_id = ? AND status = 'envoi'").run(
      String(e.message).slice(0, 200),
      row.id,
    )
    broadcast('interventions_changed', {}, teamId)
  })
})

// Qui a pris l'intervention, et à quel pourcentage (null = personne).
whatsappRouter.post('/interventions/:id/taken', (req, res) => {
  const row = interventionOr404(req, res)
  if (!row) return
  const contactId = req.body?.contactId ? String(req.body.contactId) : null
  if (!contactId) {
    db.prepare('UPDATE interventions SET taken_by_contact_id = NULL, taken_by_name = NULL, share_percent = NULL WHERE id = ?').run(row.id)
  } else {
    const c = db.prepare('SELECT * FROM whatsapp_contacts WHERE id = ? AND team_id = ?').get(contactId, req.caller.team_id)
    if (!c) return res.status(404).json({ error: 'Contact introuvable' })
    db.prepare('UPDATE interventions SET taken_by_contact_id = ?, taken_by_name = ?, share_percent = ? WHERE id = ?').run(
      c.id,
      c.name,
      PERCENT[c.category],
      row.id,
    )
  }
  broadcast('interventions_changed', {}, row.team_id)
  const updated = db.prepare('SELECT taken_by_contact_id, taken_by_name, share_percent FROM interventions WHERE id = ?').get(row.id)
  res.json(updated.taken_by_name ? { contactId: updated.taken_by_contact_id, name: updated.taken_by_name, percent: updated.share_percent } : null)
})
