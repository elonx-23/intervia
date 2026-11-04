import fs from 'node:fs'
import path from 'node:path'

import { db, now, uuid } from './db.mjs'
import { broadcast } from './events.mjs'
import { getTelephonyConfig } from './ovh.mjs'
import { toE164 } from './phone.mjs'
import { recordingsDir } from './telnyx.mjs'
import { transcribeCallRecording } from './transcription.mjs'

// Appels reçus chez l'opérateur de l'admin (Synec / invoice.eu), qui n'a pas
// d'API : l'opérateur envoie une notification Pushover à chaque appel entrant,
// avec un lien vers la « fiche de l'appelant » (page publique, sans
// connexion) où figure l'enregistrement de chaque appel.
//
// Intervia est un appareil du compte Pushover de l'admin (voir
// scripts/pushover-connect.mjs) : toutes les minutes, il relève les nouvelles
// notifications, attend la fin de l'appel, télécharge l'enregistrement, puis
// transcription + fiche d'intervention comme pour tout autre appel.

const PUSHOVER = 'https://api.pushover.net/1'
const SYNEC = 'https://app.synec.io'
// Un appel peut durer : on cherche son enregistrement pendant 2 h, après quoi
// il est classé « sans enregistrement » (appel manqué, raccroché…).
const GIVE_UP_AFTER_MS = 2 * 3600 * 1000

db.exec(`
  CREATE TABLE IF NOT EXISTS pushover_calls (
    message_id TEXT PRIMARY KEY,
    team_id TEXT,
    line_label TEXT,
    line_number TEXT,
    caller TEXT,
    called_at TEXT NOT NULL,
    fiche_url TEXT,
    status TEXT NOT NULL,
    call_id TEXT,
    last_attempt_at TEXT,
    created_at TEXT NOT NULL
  );
`)

export function pushoverConfigured() {
  return Boolean(process.env.PUSHOVER_CLIENT_SECRET && process.env.PUSHOVER_DEVICE_ID)
}

// ---------- Lecture de la notification ----------

const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']

// « Mercredi 04 Novembre 2026 à 01:47:36 » (heure de Paris) → ISO UTC.
export function parseFrenchDate(text) {
  const m = /(\d{1,2})\s+([a-zéû]+)\s+(\d{4})\s+à\s+(\d{1,2}):(\d{2})(?::(\d{2}))?/i.exec(String(text ?? ''))
  if (!m) return null
  const month = MONTHS.indexOf(m[2].toLowerCase())
  if (month < 0) return null
  const asUtc = Date.UTC(Number(m[3]), month, Number(m[1]), Number(m[4]), Number(m[5]), Number(m[6] ?? 0))
  // Décalage de Paris à cette date (heure d'été / d'hiver).
  const paris = new Date(new Date(asUtc).toLocaleString('en-US', { timeZone: 'Europe/Paris' }))
  const utc = new Date(new Date(asUtc).toLocaleString('en-US', { timeZone: 'UTC' }))
  return new Date(asUtc - (paris.getTime() - utc.getTime())).toISOString()
}

const field = (message, label) => new RegExp(`${label}\\s*:\\s*(.+)`, 'i').exec(message)?.[1]?.trim() ?? null

export function parseCallNotification(msg) {
  if (!/appel entrant/i.test(`${msg.title ?? ''} ${msg.app ?? ''}`)) return null
  const text = String(msg.message ?? '')
  const ligne = field(text, 'Ligne') ?? ''
  const fiche = /Fiche de l'appelant\s*:\s*(https?:\/\/\S+)/i.exec(text)?.[1] ?? null
  const calledAt = parseFrenchDate(field(text, 'Heure')) ?? new Date(Number(msg.date) * 1000).toISOString()
  return {
    messageId: String(msg.id),
    lineLabel: ligne.replace(/\s*\([^)]*\)\s*$/, '').trim() || field(text, 'Organisation'),
    lineNumber: /\(([^)]+)\)/.exec(ligne)?.[1] ?? null,
    caller: field(text, "Numéro de l'appelant") ?? field(text, 'Numéro affiché'),
    calledAt,
    ficheUrl: fiche,
  }
}

// ---------- Équipe destinataire ----------

// L'équipe de l'admin dont le nom (ou la raison sociale) correspond à la
// ligne appelée (« Orel Service ») ; à défaut, sa première équipe.
function teamFor(lineLabel) {
  const emails = String(process.env.PUSHOVER_ADMIN_EMAILS ?? process.env.TELNYX_ALLOWED_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
  if (emails.length === 0) return null
  const teams = db
    .prepare(
      `SELECT DISTINCT t.id, t.name FROM teams t
       JOIN users u ON LOWER(u.email) IN (${emails.map(() => '?').join(', ')}) AND u.role = 'admin'
       WHERE t.id = u.team_id OR EXISTS (SELECT 1 FROM team_memberships m WHERE m.user_id = u.id AND m.team_id = t.id)
       ORDER BY t.created_at`,
    )
    .all(...emails)
  const wanted = String(lineLabel ?? '').trim().toLowerCase()
  const byName = teams.find((t) => {
    const company = db.prepare('SELECT value FROM settings WHERE key = ?').get(`${t.id}:company`)
    const companyName = company ? String(JSON.parse(company.value)?.name ?? '') : ''
    return wanted && [t.name, companyName].some((n) => String(n ?? '').trim().toLowerCase() === wanted)
  })
  return (byName ?? teams[0])?.id ?? null
}

// ---------- Relève Pushover ----------

async function pushover(method, apiPath, params) {
  const qs = new URLSearchParams({ secret: process.env.PUSHOVER_CLIENT_SECRET, ...params })
  const url = method === 'GET' ? `${PUSHOVER}${apiPath}?${qs}` : `${PUSHOVER}${apiPath}`
  const res = await fetch(url, { method, body: method === 'GET' ? undefined : qs, signal: AbortSignal.timeout(20000) })
  const body = await res.json().catch(() => ({}))
  if (body.status !== 1) throw new Error(`Pushover : ${(body.errors ?? [res.status]).join(', ')}`)
  return body
}

async function pullNotifications() {
  const deviceId = process.env.PUSHOVER_DEVICE_ID
  const { messages = [] } = await pushover('GET', '/messages.json', { device_id: deviceId })
  let highest = null
  for (const msg of messages) {
    highest = highest === null || BigInt(msg.id) > BigInt(highest) ? String(msg.id) : highest
    const call = parseCallNotification(msg)
    if (!call) continue
    db.prepare(
      `INSERT OR IGNORE INTO pushover_calls (message_id, team_id, line_label, line_number, caller, called_at, fiche_url, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'en_attente', ?)`,
    ).run(call.messageId, teamFor(call.lineLabel), call.lineLabel, call.lineNumber, call.caller, call.calledAt, call.ficheUrl, now())
  }
  // Une fois enregistrées ici, les notifications sont effacées de l'appareil
  // Intervia seulement (elles restent sur le téléphone de l'admin).
  if (highest) await pushover('POST', `/devices/${deviceId}/update_highest_message.json`, { message: highest })
}

// ---------- Fiche de l'appelant → enregistrement ----------


// Lignes « [ENTRANT] Mercredi 04 Novembre 2026 à 01:47 : 0:08 <lien d'écoute> ».
export function parseFicheCalls(html) {
  const calls = []
  const re = /\[(ENTRANT|SORTANT)\]<\/b>\s*([^<]+?)\s*:\s*<b>(\d+):(\d{2})<\/b>([\s\S]*?)<\/li>/gi
  for (const m of html.matchAll(re)) {
    const audio = /playAudio\/([a-z0-9]+)/i.exec(m[5])?.[1] ?? null
    calls.push({
      direction: m[1].toUpperCase() === 'ENTRANT' ? 'inbound' : 'outbound',
      startedAt: parseFrenchDate(m[2]),
      durationSeconds: Number(m[3]) * 60 + Number(m[4]),
      audioId: audio,
    })
  }
  return calls
}

async function fetchText(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, redirect: 'follow', signal: AbortSignal.timeout(20000) })
  if (!res.ok) throw new Error(`fiche ${res.status}`)
  return { text: await res.text(), finalUrl: res.url }
}

async function downloadAudio(ficheUrl, audioId, callId) {
  const base = new URL(ficheUrl)
  const player = await fetchText(new URL(`${base.pathname.replace(/\/$/, '')}/playAudio/${audioId}`, SYNEC).toString())
  const src = /<source[^>]+src="([^"]+)"/i.exec(player.text)?.[1]
  if (!src) throw new Error('lecteur audio introuvable')
  const res = await fetch(new URL(src, SYNEC), { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(60000) })
  if (!res.ok) throw new Error(`audio ${res.status}`)
  fs.mkdirSync(recordingsDir, { recursive: true })
  const file = `${callId}.mp3`
  fs.writeFileSync(path.join(recordingsDir, file), Buffer.from(await res.arrayBuffer()))
  return `local:${file}`
}

// Cherche l'appel de la notification dans la fiche : appel entrant, même
// minute (à une minute près), pas déjà rattaché à une autre notification.
async function resolvePending(row) {
  db.prepare('UPDATE pushover_calls SET last_attempt_at = ? WHERE message_id = ?').run(now(), row.message_id)
  const fiche = await fetchText(row.fiche_url)
  const ficheUrl = fiche.finalUrl
  const wanted = new Date(row.called_at).getTime()
  const taken = new Set(
    db
      .prepare("SELECT provider_call_id FROM calls WHERE provider_call_id LIKE 'syn:%'")
      .all()
      .map((r) => r.provider_call_id),
  )
  const match = parseFicheCalls(fiche.text).find(
    (c) =>
      c.direction === 'inbound' &&
      c.startedAt &&
      Math.abs(new Date(c.startedAt).getTime() - Math.floor(wanted / 60000) * 60000) <= 60000 &&
      !taken.has(`syn:${c.audioId ?? c.startedAt}`),
  )

  const expired = Date.now() - wanted > GIVE_UP_AFTER_MS
  if (!match || (!match.audioId && !expired)) {
    if (expired) recordCall(row, null, null)
    return
  }
  const callId = uuid()
  const recording = match.audioId ? await downloadAudio(ficheUrl, match.audioId, callId) : null
  recordCall(row, match, recording, callId)
}

function recordCall(row, match, recording, callId = uuid()) {
  const teamId = row.team_id
  db.prepare(
    `INSERT INTO calls (id, team_id, direction, from_number, to_number, status, duration_seconds, provider_call_id, recording_url, started_at, ended_at)
     VALUES (?, ?, 'inbound', ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    callId,
    teamId,
    toE164(row.caller) || row.caller,
    toE164(row.line_number) || row.line_number,
    recording ? 'terminé' : 'manqué',
    match?.durationSeconds ?? null,
    `syn:${match?.audioId ?? match?.startedAt ?? row.message_id}`,
    recording,
    row.called_at,
    match?.durationSeconds ? new Date(new Date(row.called_at).getTime() + match.durationSeconds * 1000).toISOString() : null,
  )
  db.prepare("UPDATE pushover_calls SET status = ?, call_id = ? WHERE message_id = ?").run(recording ? 'termine' : 'sans_enregistrement', callId, row.message_id)
  if (teamId) broadcast('call_update', { id: callId }, teamId)

  const { openaiApiKey } = teamId ? getTelephonyConfig(teamId) : {}
  if (recording && openaiApiKey) {
    transcribeCallRecording({ callId, recordingUrl: recording, openaiApiKey }).catch(() => {})
  }
}

// ---------- Passage de la minute ----------

let running = false

export async function syncPushoverCalls() {
  if (!pushoverConfigured() || running) return
  running = true
  try {
    await pullNotifications().catch((e) => console.log(`[telephonie] relève Pushover échouée : ${e.message}`))
    const pending = db
      .prepare(
        "SELECT * FROM pushover_calls WHERE status = 'en_attente' AND fiche_url IS NOT NULL AND team_id IS NOT NULL ORDER BY called_at LIMIT 10",
      )
      .all()
    for (const row of pending) {
      await resolvePending(row).catch((e) => console.log(`[telephonie] appel ${row.message_id} : ${e.message}`))
    }
  } finally {
    running = false
  }
}
