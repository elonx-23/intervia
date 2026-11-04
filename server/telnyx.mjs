import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { db, getSetting, setSetting } from './db.mjs'

// Opérateur « revendeur » : un seul compte Telnyx, celui d'Intervia (clé dans
// TELNYX_API_KEY), paie les numéros et les minutes. Les numéros s'achètent
// instantanément et les appels arrivent en direct (webhooks TeXML), sans
// relève périodique.
//
// Phase 1 : réservé aux équipes dont un admin figure dans
// TELNYX_ALLOWED_EMAILS — aucune autre équipe ne peut dépenser sur le compte
// d'Intervia tant que la facturation des clients n'existe pas.

const API = 'https://api.telnyx.com/v2'

export class TelnyxError extends Error {
  constructor(status, body) {
    const first = body?.errors?.[0]
    super(first?.detail || first?.title || `Erreur de l'opérateur (${status})`)
    this.status = status
    this.code = first?.code ?? null
  }
}

export function telnyxConfigured() {
  return Boolean(process.env.TELNYX_API_KEY)
}

function allowedEmails() {
  return String(process.env.TELNYX_ALLOWED_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
}

export function telnyxEnabledFor(teamId) {
  if (!teamId || !telnyxConfigured()) return false
  const emails = allowedEmails()
  if (emails.length === 0) return false
  const placeholders = emails.map(() => '?').join(', ')
  const row = db
    .prepare(
      `SELECT 1 FROM users u
       WHERE u.role = 'admin' AND LOWER(u.email) IN (${placeholders})
         AND (u.team_id = ? OR EXISTS (SELECT 1 FROM team_memberships m WHERE m.user_id = u.id AND m.team_id = ?))
       LIMIT 1`,
    )
    .get(...emails, teamId, teamId)
  return Boolean(row)
}

export async function telnyx(method, apiPath, body) {
  const res = await fetch(`${API}${apiPath}`, {
    method,
    headers: {
      Authorization: `Bearer ${process.env.TELNYX_API_KEY}`,
      Accept: 'application/json',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30000),
  })
  const text = await res.text()
  let json = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    json = { errors: [{ detail: text.slice(0, 200) }] }
  }
  if (!res.ok) throw new TelnyxError(res.status, json)
  return json
}

// Messages d'erreur de l'opérateur traduits pour l'écran de l'admin.
export function telnyxErrorMessage(e) {
  const code = String(e?.code ?? '')
  if (code === '10038' || /account level|upgrade/i.test(e?.message ?? '')) {
    return "Le compte téléphonie d'Intervia doit encore être vérifié avant de pouvoir acheter ce numéro. Contacte le support."
  }
  if (/insufficient|balance|credit/i.test(e?.message ?? '')) {
    return 'Crédit téléphonie insuffisant. Contacte le support.'
  }
  if (code === '85000' || /not available|no longer available|already/i.test(e?.message ?? '')) {
    return "Ce numéro n'est plus disponible. Choisis-en un autre."
  }
  if (e?.status === 401) return "Connexion à l'opérateur refusée. Contacte le support."
  return `L'opérateur a refusé la demande : ${String(e?.message ?? 'erreur inconnue').replace(/telnyx/gi, "l'opérateur")}`
}

// ---------- Webhooks : authenticité ----------

// Jeton secret ajouté à chaque URL de webhook : dérivé de la clé API (jamais
// stocké ni affiché), il change si la clé change.
export function webhookToken() {
  return crypto
    .createHash('sha256')
    .update(`intervia-webhook:${process.env.TELNYX_API_KEY ?? ''}`)
    .digest('hex')
    .slice(0, 32)
}

function tokenMatches(token) {
  const expected = Buffer.from(webhookToken())
  const given = Buffer.from(String(token ?? ''))
  return given.length === expected.length && crypto.timingSafeEqual(given, expected)
}

// Clé publique Ed25519 du portail (32 octets en base64) → objet clé Node.
function publicKey() {
  const raw = Buffer.from(String(process.env.TELNYX_PUBLIC_KEY ?? ''), 'base64')
  if (raw.length !== 32) return null
  return crypto.createPublicKey({
    key: Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), raw]),
    format: 'der',
    type: 'spki',
  })
}

// Une requête est acceptée si elle porte le jeton secret de l'URL ; quand
// l'opérateur la signe aussi (Ed25519 sur « horodatage|corps »), la signature
// doit être valide et récente.
export function verifyWebhook(req) {
  if (!tokenMatches(req.query.t)) return false
  const signature = req.get('telnyx-signature-ed25519')
  const timestamp = req.get('telnyx-timestamp')
  const key = publicKey()
  if (!signature || !timestamp || !key) return true
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false
  try {
    return crypto.verify(null, Buffer.from(`${timestamp}|${req.rawBody ?? ''}`), key, Buffer.from(signature, 'base64'))
  } catch {
    return false
  }
}

// ---------- Mise en place du compte (une fois, idempotent) ----------

// Adresse publique de l'app, retenue depuis le navigateur de l'admin (en-tête
// Origin) — PUBLIC_URL en repli.
export function rememberPublicBaseUrl(req) {
  const origin = req.get('origin')
  if (origin && /^https:\/\/[^/]+$/.test(origin)) {
    const platform = getSetting('telnyx_platform') ?? {}
    if (platform.baseUrl !== origin) setSetting('telnyx_platform', { ...platform, baseUrl: origin })
  }
}

function baseUrl() {
  return getSetting('telnyx_platform')?.baseUrl || process.env.PUBLIC_URL || null
}

export function webhookUrl(apiPath, params = {}) {
  const base = baseUrl()
  if (!base) return null
  const qs = new URLSearchParams({ t: webhookToken(), ...params })
  return `${base}/api/telnyx/${apiPath}?${qs}`
}

// Profil sortant (appels vers la France autorisés — par défaut Telnyx
// n'autorise que les États-Unis et le Canada) + application TeXML qui reçoit
// les appels. Recréés s'ils ont disparu, mis à jour si l'adresse publique change.
export async function ensurePlatform() {
  const platform = getSetting('telnyx_platform') ?? {}
  const voiceUrl = webhookUrl('voice')
  if (!voiceUrl) throw new Error("Adresse publique de l'app inconnue : ouvre l'app depuis son adresse https pour la retenir.")

  let profileId = platform.outboundProfileId
  if (profileId) {
    const exists = await telnyx('GET', `/outbound_voice_profiles/${profileId}`).catch(() => null)
    if (!exists) profileId = null
  }
  if (!profileId) {
    const created = await telnyx('POST', '/outbound_voice_profiles', {
      name: 'Intervia',
      traffic_type: 'conversational',
      service_plan: 'global',
      whitelisted_destinations: ['FR'],
    })
    profileId = created.data.id
  }

  const appSettings = {
    friendly_name: 'Intervia',
    voice_url: voiceUrl,
    voice_method: 'post',
    status_callback: webhookUrl('status'),
    status_callback_method: 'post',
    anchorsite_override: 'Amsterdam, Netherlands',
    outbound: { outbound_voice_profile_id: profileId },
  }
  let appId = platform.texmlAppId
  if (appId) {
    const updated = await telnyx('PATCH', `/texml_applications/${appId}`, appSettings).catch(() => null)
    if (!updated) appId = null
  }
  if (!appId) appId = (await telnyx('POST', '/texml_applications', appSettings)).data.id

  setSetting('telnyx_platform', {
    ...platform,
    outboundProfileId: profileId,
    texmlAppId: appId,
    configuredFor: voiceUrl,
  })
  return { profileId, appId }
}

// Évite de reconfigurer le compte à chaque requête : seulement si l'adresse
// publique a changé ou que la mise en place n'a jamais été faite.
export async function ensurePlatformIfNeeded() {
  const platform = getSetting('telnyx_platform') ?? {}
  if (platform.texmlAppId && platform.configuredFor === webhookUrl('voice')) return { appId: platform.texmlAppId }
  return ensurePlatform()
}

// ---------- Enregistrements ----------

// Les liens d'enregistrement de l'opérateur expirent au bout de 10 minutes :
// le fichier est copié tout de suite à côté de la base (volume persistant),
// hors du dossier /uploads servi publiquement.
const serverDir = path.dirname(fileURLToPath(import.meta.url))
export const recordingsDir = path.join(path.dirname(process.env.DB_PATH || path.join(serverDir, 'pse-gestion.db')), 'recordings')

export async function storeRecording(callId, url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(60000) })
  if (!res.ok) throw new Error(`Téléchargement de l'enregistrement échoué (${res.status})`)
  const wav = /wav/i.test(res.headers.get('content-type') ?? '') || /\.wav(\?|$)/i.test(url)
  fs.mkdirSync(recordingsDir, { recursive: true })
  const file = `${callId}.${wav ? 'wav' : 'mp3'}`
  fs.writeFileSync(path.join(recordingsDir, file), Buffer.from(await res.arrayBuffer()))
  return `local:${file}`
}

export function readLocalRecording(ref) {
  const file = path.basename(String(ref).slice('local:'.length))
  const extension = file.endsWith('.wav') ? 'wav' : 'mp3'
  return {
    buffer: fs.readFileSync(path.join(recordingsDir, file)),
    contentType: extension === 'wav' ? 'audio/wav' : 'audio/mpeg',
    extension,
  }
}
