import { Router } from 'express'

import { requireAdmin, requireAuth } from '../auth.mjs'
import { db } from '../db.mjs'
import { getTelephonyConfig, isTelephonyConfigured, updateTelephonyConfig } from '../ovh.mjs'
import { getSyncState, syncTeamCalls } from '../telephonySync.mjs'
import { downloadRecording, transcribeCallRecording } from '../transcription.mjs'

export const telephonyRouter = Router()

// Tout l'espace Téléphonie est réservé aux admins, cloisonné par équipe.
telephonyRouter.use(requireAuth, requireAdmin)

// État affiché en haut de l'espace Téléphonie. Aucune clé n'en sort jamais,
// seulement « configuré ou non ».
telephonyRouter.get('/status', (req, res) => {
  const teamId = req.caller.team_id
  const sync = getSyncState(teamId)
  res.json({
    configured: isTelephonyConfigured(teamId),
    hasOpenaiKey: Boolean(getTelephonyConfig(teamId).openaiApiKey),
    numbers: sync.numbers,
    lastSyncAt: sync.lastSyncAt,
    lastSyncError: sync.lastError,
  })
})

// Branchement du compte OVH et de la clé OpenAI. Pas d'écran pour ça dans
// l'app : la configuration se fait directement avec Claude, qui appelle cette
// route avec une session admin.
telephonyRouter.patch('/settings', (req, res) => {
  const { ovhApplicationKey, ovhApplicationSecret, ovhConsumerKey, openaiApiKey } = req.body ?? {}
  updateTelephonyConfig(req.caller.team_id, {
    ovhApplicationKey: ovhApplicationKey || undefined,
    ovhApplicationSecret: ovhApplicationSecret || undefined,
    ovhConsumerKey: ovhConsumerKey || undefined,
    openaiApiKey: openaiApiKey || undefined,
  })
  res.json({ ok: true })
})

// Relève immédiatement les nouveaux enregistrements chez OVH (bouton
// « Actualiser ») au lieu d'attendre le passage automatique de la minute.
telephonyRouter.post('/sync', async (req, res) => {
  const result = await syncTeamCalls(req.caller.team_id)
  res.json(result)
})

// Le nom du client vient de la fiche créée depuis l'appel si elle existe,
// sinon de la fiche la plus récente avec le même numéro (client déjà connu).
telephonyRouter.get('/calls', (req, res) => {
  const rows = db
    .prepare(
      `SELECT c.*,
         i.reference AS intervention_reference,
         COALESCE(
           NULLIF(TRIM(i.client_first_name || ' ' || i.client_last_name), ''),
           (SELECT NULLIF(TRIM(k.client_first_name || ' ' || k.client_last_name), '')
              FROM interventions k
              WHERE k.team_id = c.team_id
                AND k.phone IS NOT NULL
                AND REPLACE(REPLACE(k.phone, ' ', ''), '.', '') IN (
                  CASE WHEN c.direction = 'inbound' THEN c.from_number ELSE c.to_number END,
                  '0' || SUBSTR(CASE WHEN c.direction = 'inbound' THEN c.from_number ELSE c.to_number END, 4)
                )
              ORDER BY k.created_at DESC LIMIT 1)
         ) AS client_name
       FROM calls c
       LEFT JOIN interventions i ON i.id = c.intervention_id
       WHERE c.team_id = ?
       ORDER BY c.started_at DESC LIMIT 200`,
    )
    .all(req.caller.team_id)
  res.json(rows)
})

// Relance la transcription d'un appel resté en erreur (ex. crédit OpenAI
// épuisé à ce moment-là).
telephonyRouter.post('/calls/:id/transcribe', (req, res) => {
  const call = db.prepare('SELECT * FROM calls WHERE id = ? AND team_id = ?').get(req.params.id, req.caller.team_id)
  if (!call?.recording_url) return res.status(404).json({ error: 'Enregistrement introuvable' })
  const { openaiApiKey } = getTelephonyConfig(req.caller.team_id)
  if (!openaiApiKey) return res.status(400).json({ error: "La clé OpenAI n'est pas configurée." })
  transcribeCallRecording({ callId: call.id, recordingUrl: call.recording_url, openaiApiKey }).catch(() => {})
  res.json({ ok: true })
})

// L'audio reste chez OVH : on le relaie après avoir vérifié que l'appel
// demandé appartient bien à l'équipe de l'appelant.
telephonyRouter.get('/calls/:id/recording', async (req, res) => {
  const call = db.prepare('SELECT * FROM calls WHERE id = ? AND team_id = ?').get(req.params.id, req.caller.team_id)
  if (!call?.recording_url) return res.status(404).json({ error: 'Enregistrement introuvable' })

  try {
    const audio = await downloadRecording(call.recording_url)
    res.type(audio.contentType).send(audio.buffer)
  } catch {
    res.status(502).json({ error: "Impossible de récupérer l'enregistrement." })
  }
})
