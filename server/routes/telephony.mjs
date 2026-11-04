import { Router } from 'express'

import { requireAdmin, requireAuth } from '../auth.mjs'
import { db, getSetting } from '../db.mjs'
import { getTelephonyConfig, isTelephonyConfigured, updateTelephonyConfig } from '../ovh.mjs'
import {
  LEGAL_FORMS,
  UserError,
  activateAccount,
  availableNumbers,
  dismissOrder,
  markOrderPaid,
  errorForScreen,
  normalizeFrenchPhone,
  numbersOverview,
  orderNumber,
  quoteNumber,
  reconfigureNow,
  releaseNumber,
  searchZones,
} from '../telephonyNumbers.mjs'
import { getSyncState, syncTeamCalls } from '../telephonySync.mjs'
import { rememberPublicBaseUrl, telnyxEnabledFor, telnyxErrorMessage, TelnyxError } from '../telnyx.mjs'
import {
  availableNumbersTelnyx,
  isTelnyxNumber,
  orderNumberTelnyx,
  quoteNumberTelnyx,
  releaseNumberTelnyx,
} from '../telnyxNumbers.mjs'
import { downloadRecording, transcribeCallRecording } from '../transcription.mjs'

export const telephonyRouter = Router()

// Tout l'espace Téléphonie est réservé aux admins, cloisonné par équipe.
telephonyRouter.use(requireAuth, requireAdmin)

// Erreur renvoyée à l'écran : jamais de nom de fournisseur ni de détail technique.
function fail(res, e) {
  if (!(e instanceof UserError)) console.log(`[telephonie] ${e?.message ?? e}`)
  const error = e instanceof TelnyxError ? telnyxErrorMessage(e) : errorForScreen(e)
  res.status(e instanceof UserError ? 400 : 502).json({ error })
}

// Applique tout de suite un changement (téléphones, commande) au lieu
// d'attendre le passage de la minute — sans jamais bloquer la réponse.
function syncSoon(teamId) {
  syncTeamCalls(teamId).catch(() => {})
}

const SERVICE_NAME = /^\d{8,15}$/

// ---------- État et réglages ----------

// État affiché en haut de l'espace Téléphonie. Aucune clé n'en sort jamais,
// seulement « configuré ou non ».
telephonyRouter.get('/status', (req, res) => {
  const teamId = req.caller.team_id
  const sync = getSyncState(teamId)
  res.json({
    configured: telnyxEnabledFor(teamId) || isTelephonyConfigured(teamId),
    hasOpenaiKey: Boolean(getTelephonyConfig(teamId).openaiApiKey),
    numbers: numbersOverview(teamId).numbers.map((n) => n.serviceName),
    lastSyncAt: sync.lastSyncAt,
    lastSyncError: sync.lastError,
  })
})

function guessLegalForm(text) {
  const t = String(text ?? '').toLowerCase()
  if (/individuel|auto|micro|\bei\b|eirl/.test(t)) return 'individual'
  if (/association/.test(t)) return 'association'
  if (/sarl|sas|sasu|eurl|\bsa\b|snc|scop|sci/.test(t)) return 'corporation'
  return ''
}

// Première ouverture : on préremplit les informations légales avec la fiche
// entreprise déjà saisie dans l'app (nom, SIRET, adresse, contact).
function prefillLegal(teamId) {
  const company = getSetting('company', teamId) ?? {}
  const address = /^(\d+\s?(?:bis|ter)?)\s+(.+?),?\s*(\d{5})\s+(.+)$/i.exec(String(company.address ?? '').trim())
  return {
    legalform: guessLegalForm(company.legalForm),
    organisation: company.name ?? '',
    siret: company.siret ?? '',
    ape: company.naf ?? '',
    firstname: '',
    name: '',
    email: company.email ?? '',
    phone: company.phone ?? '',
    streetNumber: address?.[1] ?? '',
    streetName: address?.[2] ?? '',
    zip: address?.[3] ?? '',
    city: address?.[4] ?? '',
  }
}

const LEGAL_KEYS = ['legalform', 'organisation', 'siret', 'ape', 'firstname', 'name', 'email', 'phone', 'streetNumber', 'streetName', 'zip', 'city']

function cleanLegal(input) {
  const legal = {}
  for (const key of LEGAL_KEYS) legal[key] = typeof input?.[key] === 'string' ? input[key].trim().slice(0, 120) : ''
  if (legal.legalform && !LEGAL_FORMS.has(legal.legalform)) throw new UserError('Forme juridique invalide.')
  return legal
}

telephonyRouter.get('/settings', (req, res) => {
  const teamId = req.caller.team_id
  const cfg = getTelephonyConfig(teamId)
  res.json({
    forwardingNumber: cfg.forwardingNumber ?? '',
    forwardingNumber2: cfg.forwardingNumber2 ?? '',
    legal: cfg.legal ?? prefillLegal(teamId),
    legalSaved: Boolean(cfg.legal),
    recordingAccepted: Boolean(cfg.recordingAccepted),
  })
})

// Les clés d'accès (operator*, openaiApiKey) ne se saisissent pas dans l'app :
// elles sont posées côté serveur par le support, via cette même route.
telephonyRouter.patch('/settings', (req, res) => {
  const teamId = req.caller.team_id
  const body = req.body ?? {}
  try {
    const patch = {}
    for (const key of ['forwardingNumber', 'forwardingNumber2']) {
      if (typeof body[key] !== 'string') continue
      const raw = body[key].trim()
      const phone = raw === '' ? '' : normalizeFrenchPhone(raw)
      if (phone === null) throw new UserError('Numéro de téléphone invalide.')
      patch[key] = phone
    }
    if (body.legal !== undefined) patch.legal = cleanLegal(body.legal)
    if (typeof body.recordingAccepted === 'boolean') {
      patch.recordingAccepted = body.recordingAccepted
      patch.recordingAcceptedAt = body.recordingAccepted ? new Date().toISOString() : null
    }
    for (const key of ['operatorAppKey', 'operatorAppSecret', 'operatorConsumerKey', 'openaiApiKey']) {
      if (typeof body[key] === 'string' && body[key]) patch[key] = body[key]
    }
    updateTelephonyConfig(teamId, patch)
    // Un réglage qui change la configuration des numéros (téléphones,
    // enregistrement) lève l'attente après un éventuel échec précédent.
    if (['forwardingNumber', 'forwardingNumber2', 'recordingAccepted'].some((k) => k in patch)) {
      db.prepare('UPDATE telephony_numbers SET last_error = NULL, last_attempt_at = NULL WHERE team_id = ?').run(teamId)
    }
    syncSoon(teamId)
    res.json({ ok: true })
  } catch (e) {
    fail(res, e)
  }
})

// Relève immédiatement les nouveautés (appels, numéros, commandes) au lieu
// d'attendre le passage automatique de la minute.
telephonyRouter.post('/sync', async (req, res) => {
  res.json(await syncTeamCalls(req.caller.team_id))
})

// ---------- Numéros ----------

telephonyRouter.get('/zones', async (req, res) => {
  try {
    res.json(await searchZones(String(req.query.q ?? '').trim().slice(0, 40)))
  } catch (e) {
    fail(res, e)
  }
})

telephonyRouter.get('/numbers/available', async (req, res) => {
  try {
    const zone = String(req.query.zone ?? '').trim().slice(0, 60)
    res.json(telnyxEnabledFor(req.caller.team_id) ? await availableNumbersTelnyx(zone) : await availableNumbers(zone))
  } catch (e) {
    fail(res, e)
  }
})

telephonyRouter.get('/numbers', (req, res) => {
  res.json(numbersOverview(req.caller.team_id))
})

function choiceFrom(body) {
  return {
    zone: typeof body?.zone === 'string' ? body.zone.trim() : '',
    specificNumber: typeof body?.specificNumber === 'string' && body.specificNumber ? body.specificNumber : null,
  }
}

// Prix exact avant achat : rien n'est commandé ici.
telephonyRouter.post('/numbers/quote', async (req, res) => {
  try {
    const teamId = req.caller.team_id
    rememberPublicBaseUrl(req)
    res.json(telnyxEnabledFor(teamId) ? await quoteNumberTelnyx(teamId, choiceFrom(req.body)) : await quoteNumber(teamId, choiceFrom(req.body)))
  } catch (e) {
    fail(res, e)
  }
})

// Achat réel. L'admin envoie le prix qu'il a vu et confirmé ; le serveur le
// recontrôle avant de commander.
telephonyRouter.post('/numbers/order', async (req, res) => {
  try {
    const teamId = req.caller.team_id
    rememberPublicBaseUrl(req)
    const expected = Number(req.body?.expectedTotal)
    const result = telnyxEnabledFor(teamId)
      ? await orderNumberTelnyx(teamId, choiceFrom(req.body), expected)
      : await orderNumber(teamId, choiceFrom(req.body), expected)
    syncSoon(req.caller.team_id)
    res.json(result)
  } catch (e) {
    fail(res, e)
  }
})

telephonyRouter.post('/account/activate', async (req, res) => {
  try {
    const result = await activateAccount(req.caller.team_id)
    syncSoon(req.caller.team_id)
    res.json(result)
  } catch (e) {
    fail(res, e)
  }
})

telephonyRouter.post('/orders/:id/dismiss', (req, res) => {
  dismissOrder(req.caller.team_id, req.params.id)
  res.json({ ok: true })
})

telephonyRouter.post('/orders/:id/paid', (req, res) => {
  markOrderPaid(req.caller.team_id, req.params.id)
  syncSoon(req.caller.team_id)
  res.json({ ok: true })
})

telephonyRouter.post('/numbers/:serviceName/configure', async (req, res) => {
  if (!SERVICE_NAME.test(req.params.serviceName)) return res.status(400).json({ error: 'Numéro invalide.' })
  try {
    await reconfigureNow(req.caller.team_id, req.params.serviceName)
    res.json(numbersOverview(req.caller.team_id))
  } catch (e) {
    fail(res, e)
  }
})

telephonyRouter.delete('/numbers/:serviceName', async (req, res) => {
  if (!SERVICE_NAME.test(req.params.serviceName)) return res.status(400).json({ error: 'Numéro invalide.' })
  try {
    const teamId = req.caller.team_id
    if (isTelnyxNumber(teamId, req.params.serviceName)) await releaseNumberTelnyx(teamId, req.params.serviceName)
    else await releaseNumber(teamId, req.params.serviceName)
    syncSoon(req.caller.team_id)
    res.json({ ok: true })
  } catch (e) {
    fail(res, e)
  }
})

// ---------- Appels ----------

// Le nom du client vient de la fiche créée depuis l'appel si elle existe,
// sinon de la fiche la plus récente avec le même numéro (client déjà connu).
// Colonnes listées une à une : l'adresse du fichier audio (propre au
// fournisseur) ne doit jamais sortir de l'API.
telephonyRouter.get('/calls', (req, res) => {
  const rows = db
    .prepare(
      `SELECT c.id, c.direction, c.from_number, c.to_number, c.status, c.duration_seconds,
         (c.recording_url IS NOT NULL) AS has_recording, c.summary, c.transcription, c.transcription_status,
         c.started_at, c.ended_at, c.intervention_id,
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
  res.json(rows.map((r) => ({ ...r, has_recording: Boolean(r.has_recording) })))
})

// Résumé et transcription d'un appel (affichés repliés sur la fiche créée depuis l'appel).
telephonyRouter.get('/calls/:id/summary', (req, res) => {
  const call = db
    .prepare('SELECT summary, transcription, transcription_status FROM calls WHERE id = ? AND team_id = ?')
    .get(req.params.id, req.caller.team_id)
  if (!call) return res.status(404).json({ error: 'Appel introuvable' })
  res.json(call)
})

// Relance la transcription d'un appel resté en erreur (ex. crédit épuisé à
// ce moment-là).
telephonyRouter.post('/calls/:id/transcribe', (req, res) => {
  const call = db.prepare('SELECT * FROM calls WHERE id = ? AND team_id = ?').get(req.params.id, req.caller.team_id)
  if (!call?.recording_url) return res.status(404).json({ error: 'Enregistrement introuvable' })
  const { openaiApiKey } = getTelephonyConfig(req.caller.team_id)
  if (!openaiApiKey) return res.status(400).json({ error: "La transcription n'est pas activée." })
  transcribeCallRecording({ callId: call.id, recordingUrl: call.recording_url, openaiApiKey }).catch(() => {})
  res.json({ ok: true })
})

// L'audio reste chez l'opérateur : on le relaie après avoir vérifié que
// l'appel demandé appartient bien à l'équipe de l'appelant.
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
