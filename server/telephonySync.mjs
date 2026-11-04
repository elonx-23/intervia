import { db, now, uuid } from './db.mjs'
import { broadcast } from './events.mjs'
import { getTelephonyConfig, isTelephonyConfigured, operatorCredentials, operatorGet } from './ovh.mjs'
import { toE164 } from './phone.mjs'
import { errorForScreen, syncNumbers, syncOrders } from './telephonyNumbers.mjs'
import { telnyxEnabledFor } from './telnyx.mjs'
import { syncTelnyx } from './telnyxNumbers.mjs'
import { transcribeCallRecording } from './transcription.mjs'

// L'opérateur ne prévient pas l'app quand un appel se termine (pas de
// webhook) : on vient donc relever les nouveautés toutes les minutes
// (cron.mjs), et à la demande depuis le bouton « Actualiser » de l'espace
// Téléphonie. Une passe = appels enregistrés, numéros (+ leur configuration),
// commandes en cours.

// Plafond par passage : à la première synchro d'un compte qui a déjà un long
// historique, le reste est repris aux passages suivants.
const MAX_NEW_PER_RUN = 50
// Transcriptions lancées en même temps au maximum par passage.
const MAX_TRANSCRIPTIONS_PER_RUN = 3

const states = new Map()
const running = new Set()
let recoveredAfterRestart = false

export function getSyncState(teamId) {
  return states.get(teamId) ?? { lastSyncAt: null, lastError: null }
}

function isoOrNull(value) {
  const time = value ? new Date(value).getTime() : NaN
  return Number.isNaN(time) ? null : new Date(time).toISOString()
}

function insertRecordedCall(teamId, service, record) {
  const id = uuid()
  db.prepare(
    `INSERT INTO calls
      (id, team_id, direction, from_number, to_number, status, duration_seconds, provider_call_id, recording_url, started_at, ended_at)
     VALUES (?, ?, 'inbound', ?, ?, 'terminé', ?, ?, ?, ?, ?)`,
  ).run(
    id,
    teamId,
    toE164(record.callerIdNumber),
    toE164(service),
    Number(record.duration) || null,
    `op:${service}:${record.id}`,
    record.fileUrl || null,
    isoOrNull(record.callStart) ?? now(),
    isoOrNull(record.callEnd),
  )
  broadcast('call_update', { id }, teamId)
  return id
}

// Relève les nouveaux enregistrements des numéros configurés en groupe
// d'appels (là où sonnent les téléphones). Un enregistrement = un appel
// décroché ; les appels manqués n'en ont pas.
async function importRecordings(teamId, c) {
  const known = new Set(
    db
      .prepare("SELECT provider_call_id FROM calls WHERE team_id = ? AND provider_call_id LIKE 'op:%'")
      .all(teamId)
      .map((r) => r.provider_call_id),
  )

  let imported = 0
  for (const billingAccount of await operatorGet(c, '/telephony/')) {
    const base = `/telephony/${encodeURIComponent(billingAccount)}/easyHunting`
    for (const service of await operatorGet(c, base)) {
      const recordsBase = `${base}/${encodeURIComponent(service)}/records`
      const ids = (await operatorGet(c, recordsBase)).filter((id) => !known.has(`op:${service}:${id}`)).sort((a, b) => b - a)
      for (const id of ids) {
        if (imported >= MAX_NEW_PER_RUN) break
        try {
          insertRecordedCall(teamId, service, await operatorGet(c, `${recordsBase}/${id}`))
          imported++
        } catch (e) {
          console.log(`[telephonie] enregistrement ${id} ignoré : ${e.message}`)
        }
      }
    }
  }
  return imported
}

export async function syncTeamCalls(teamId) {
  // Opérateur « revendeur » : les appels arrivent en direct par webhook, seules
  // les commandes de numéros sont suivies ici.
  if (telnyxEnabledFor(teamId)) {
    await syncTelnyx(teamId).catch((e) => console.log(`[telephonie] suivi des commandes échoué (équipe ${teamId}) : ${e.message}`))
  }
  if (!isTelephonyConfigured(teamId)) {
    startPendingTranscriptions(teamId)
    return { imported: 0 }
  }
  if (running.has(teamId)) return { imported: 0, busy: true }
  running.add(teamId)

  const state = { lastSyncAt: null, lastError: null }
  let imported = 0
  try {
    const c = operatorCredentials(getTelephonyConfig(teamId))
    const errors = []
    // Les appels d'abord : une configuration de numéro lente ne doit jamais
    // retarder la remontée des enregistrements.
    try {
      imported = await importRecordings(teamId, c)
    } catch (e) {
      errors.push(errorForScreen(e))
      console.log(`[telephonie] relève des appels échouée (équipe ${teamId}) : ${e.message}`)
    }
    try {
      const overview = await syncNumbers(teamId, c)
      await syncOrders(teamId, c, overview)
    } catch (e) {
      errors.push(errorForScreen(e))
      console.log(`[telephonie] synchro des numéros échouée (équipe ${teamId}) : ${e.message}`)
    }
    state.lastError = errors[0] ?? null
  } finally {
    state.lastSyncAt = now()
    states.set(teamId, state)
    running.delete(teamId)
  }

  startPendingTranscriptions(teamId)
  return { imported, error: state.lastError }
}

// Transcrit les appels enregistrés qui n'ont pas encore de texte — y compris
// ceux reçus avant que la clé de transcription soit ajoutée.
function startPendingTranscriptions(teamId) {
  if (!recoveredAfterRestart) {
    // Un redémarrage du serveur en pleine transcription laisse l'appel bloqué
    // sur « en cours » : on le remet en file d'attente (aucune transcription
    // ne peut tourner juste après un démarrage).
    db.prepare("UPDATE calls SET transcription_status = NULL WHERE transcription_status = 'en_attente'").run()
    // Échecs des 3 derniers jours (ex. crédit de transcription épuisé à ce
    // moment-là) : une nouvelle tentative à chaque redémarrage.
    db.prepare(
      `UPDATE calls SET transcription_status = NULL
       WHERE transcription_status = 'erreur' AND transcription IS NULL AND recording_url IS NOT NULL
         AND started_at > datetime('now', '-3 days')`,
    ).run()
    recoveredAfterRestart = true
  }
  const { openaiApiKey } = getTelephonyConfig(teamId)
  if (!openaiApiKey) return
  const pending = db
    .prepare(
      `SELECT id, recording_url FROM calls
       WHERE team_id = ? AND direction = 'inbound' AND recording_url IS NOT NULL
         AND transcription IS NULL AND transcription_status IS NULL
       ORDER BY started_at DESC LIMIT ?`,
    )
    .all(teamId, MAX_TRANSCRIPTIONS_PER_RUN)
  for (const call of pending) {
    transcribeCallRecording({ callId: call.id, recordingUrl: call.recording_url, openaiApiKey }).catch(() => {})
  }
}

export async function syncAllTeams() {
  const rows = db.prepare("SELECT key FROM settings WHERE key LIKE '%:telephony'").all()
  for (const { key } of rows) {
    await syncTeamCalls(key.slice(0, -':telephony'.length)).catch(() => {})
  }
}
