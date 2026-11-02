import express, { Router } from 'express'
import Twilio from 'twilio'

import { requireAdmin, requireAuth } from '../auth.mjs'
import { db, now, uuid } from '../db.mjs'
import { broadcast } from '../events.mjs'
import { getTwilioClient, getTwilioCredentials, isTelephonyConfigured, setTwilioCredentials } from '../twilio.mjs'
import { transcribeCallRecording } from '../transcription.mjs'

export const telephonyRouter = Router()

// Twilio poste ses webhooks en application/x-www-form-urlencoded — seul
// express.json() est monté globalement (server/index.mjs), donc ce routeur
// a besoin de son propre parseur pour lire req.body sur ces appels.
telephonyRouter.use(express.urlencoded({ extended: false }))

// Adresse publique de l'app pour les webhooks Twilio. Retenue
// automatiquement depuis le navigateur de l'admin (en-tête Origin, ex.
// https://app.intervia.info) quand il enregistre ses réglages ou achète un
// numéro — plus besoin de configurer PUBLIC_URL côté hébergeur, qui ne
// sert plus que de repli.
function baseUrlFor(teamId) {
  return getTwilioCredentials(teamId)?.publicBaseUrl || process.env.PUBLIC_URL || 'http://localhost:5173'
}

function webhookUrl(teamId, path) {
  return `${baseUrlFor(teamId)}${path}`
}

function rememberPublicBaseUrl(req) {
  const origin = req.get('origin')
  if (origin && /^https:\/\/[^/]+$/.test(origin)) {
    setTwilioCredentials(req.caller.team_id, { publicBaseUrl: origin })
  }
}

// Vérifie que l'appel vient réellement de Twilio (signature HMAC du corps +
// de l'URL complète avec l'auth token de l'équipe) — sans ça, n'importe qui
// connaissant l'URL du webhook pourrait injecter de faux appels/statuts.
// Construite à partir de l'adresse publique retenue (jamais
// req.protocol/req.get('host')) : Railway est derrière un proxy, ces valeurs
// ne reflètent pas forcément l'URL https que Twilio a réellement signée.
function verifyTwilioSignature(req, teamId) {
  const creds = getTwilioCredentials(teamId)
  if (!creds?.authToken) return false
  const url = webhookUrl(teamId, req.originalUrl)
  const signature = req.headers['x-twilio-signature']
  return Twilio.validateRequest(creds.authToken, signature, url, req.body)
}

// Twilio n'accepte que le format international E.164 (+33612345678) ; les
// fiches clients et la saisie admin sont en format français (06 12 34 56 78).
export function toE164(raw) {
  if (!raw) return raw
  const n = String(raw).replace(/[\s.\-()]/g, '')
  if (n.startsWith('+')) return n
  if (n.startsWith('00')) return `+${n.slice(2)}`
  if (/^0\d{9}$/.test(n)) return `+33${n.slice(1)}`
  return n
}

// Twilio renvoie ses erreurs en anglais technique — on traduit celles que
// l'admin peut rencontrer en pratique, avec quoi faire pour les corriger.
function twilioErrorMessage(e) {
  const msg = e?.message ?? ''
  if (/trial account/i.test(msg)) {
    return "Ton compte Twilio est encore en mode essai. Passe-le en compte complet (bouton « Upgrade account » sur console.twilio.com, avec carte bancaire et un premier crédit), puis réessaie."
  }
  if (/authenticat/i.test(msg)) {
    return "Twilio refuse la connexion : vérifie l'Account SID et l'Auth Token dans l'onglet Réglages."
  }
  if (/address|bundle|regulat/i.test(msg)) {
    return "Twilio demande une adresse ou un justificatif d'entreprise pour ce numéro français. Complète-les dans console.twilio.com (Phone Numbers → Regulatory Compliance), puis réessaie."
  }
  if (/balance|insufficient|funds/i.test(msg)) {
    return 'Solde Twilio insuffisant. Ajoute du crédit sur console.twilio.com (Billing), puis réessaie.'
  }
  return msg ? `Erreur Twilio : ${msg}` : 'Erreur Twilio inconnue.'
}

function frenchCallStatus(twilioStatus) {
  const map = {
    completed: 'terminé',
    busy: 'occupé',
    'no-answer': 'manqué',
    failed: 'échoué',
    canceled: 'annulé',
  }
  return map[twilioStatus] ?? 'terminé'
}

// ---------- Webhooks publics (appelés par Twilio, jamais par le frontend) ----------

// Appel entrant sur le numéro de l'équipe : on logue l'appel et on renvoie
// du TwiML qui sonne chez l'admin (son vrai mobile, configuré dans Réglages
// → Téléphonie), avec enregistrement dès que l'appel est décroché.
telephonyRouter.post('/voice/:teamId', (req, res) => {
  const { teamId } = req.params
  if (!verifyTwilioSignature(req, teamId)) return res.status(403).send('Signature invalide')

  const creds = getTwilioCredentials(teamId)
  const twiml = new Twilio.twiml.VoiceResponse()
  const ringNumbers = [creds?.forwardingNumber, creds?.forwardingNumber2].filter(Boolean)

  if (ringNumbers.length === 0) {
    twiml.say({ language: 'fr-FR' }, "Ce numéro n'est pas encore configuré. Merci de réessayer plus tard.")
    res.type('text/xml').send(twiml.toString())
    return
  }

  const callId = uuid()
  db.prepare(
    `INSERT INTO calls (id, team_id, direction, from_number, to_number, status, twilio_call_sid, started_at)
     VALUES (?, ?, 'inbound', ?, ?, 'en-cours', ?, ?)`,
  ).run(callId, teamId, req.body.From ?? null, req.body.To ?? null, req.body.CallSid ?? null, now())
  broadcast('call_update', { id: callId }, teamId)

  // Plusieurs <Number> dans un même <Dial> sonnent en parallèle : le
  // premier qui décroche prend l'appel, les autres arrêtent de sonner — et
  // seule la jambe décrochée est facturée à la minute.
  const dial = twiml.dial({
    record: 'record-from-answer',
    recordingStatusCallback: webhookUrl(teamId, `/api/telephony/recording/${teamId}?callId=${callId}`),
    recordingStatusCallbackMethod: 'POST',
    action: webhookUrl(teamId, `/api/telephony/status/${teamId}?callId=${callId}`),
    method: 'POST',
    timeout: 25,
  })
  for (const number of ringNumbers) dial.number(number)

  res.type('text/xml').send(twiml.toString())
})

// Callback de fin d'appel (déclenché par l'action du <Dial> ci-dessus, ou
// par celui de la passerelle sortante plus bas) — Twilio y poste le statut
// final et la durée. Doit répondre du TwiML valide (même vide) pour que
// Twilio termine proprement l'appel.
telephonyRouter.post('/status/:teamId', (req, res) => {
  const { teamId } = req.params
  if (!verifyTwilioSignature(req, teamId)) return res.status(403).send('Signature invalide')

  const callId = req.query.callId
  if (callId) {
    db.prepare('UPDATE calls SET status = ?, duration_seconds = ?, ended_at = ? WHERE id = ?').run(
      frenchCallStatus(req.body.DialCallStatus),
      req.body.DialCallDuration ? Number(req.body.DialCallDuration) : null,
      now(),
      callId,
    )
    broadcast('call_update', { id: callId }, teamId)
  }

  res.type('text/xml').send(new Twilio.twiml.VoiceResponse().toString())
})

// Callback d'enregistrement : l'audio est prêt côté Twilio. On stocke son
// URL puis on lance la transcription Whisper en tâche de fond — jamais
// attendue ici, Twilio attend une réponse rapide sur ce webhook.
telephonyRouter.post('/recording/:teamId', (req, res) => {
  const { teamId } = req.params
  if (!verifyTwilioSignature(req, teamId)) return res.status(403).send('Signature invalide')

  const callId = req.query.callId
  const recordingUrl = req.body.RecordingUrl
  const creds = getTwilioCredentials(teamId)

  if (callId && recordingUrl) {
    db.prepare('UPDATE calls SET recording_url = ? WHERE id = ?').run(recordingUrl, callId)
    broadcast('call_update', { id: callId }, teamId)
    transcribeCallRecording({
      callId,
      recordingUrl,
      accountSid: creds?.accountSid,
      authToken: creds?.authToken,
      openaiApiKey: creds?.openaiApiKey,
    }).catch(() => {})
  }

  res.sendStatus(200)
})

// Deuxième jambe d'un appel sortant (voir POST /call ci-dessous) : l'admin
// vient de décrocher son propre téléphone, Twilio demande maintenant quoi
// faire → on le ponte vers le numéro du client.
telephonyRouter.post('/voice/outbound-bridge/:teamId', (req, res) => {
  const { teamId } = req.params
  if (!verifyTwilioSignature(req, teamId)) return res.status(403).send('Signature invalide')

  const callId = req.query.callId
  const target = req.query.target
  const twiml = new Twilio.twiml.VoiceResponse()

  if (!target) {
    twiml.say({ language: 'fr-FR' }, 'Numéro à appeler manquant.')
  } else {
    twiml.dial(
      {
        record: 'record-from-answer',
        recordingStatusCallback: webhookUrl(teamId, `/api/telephony/recording/${teamId}?callId=${callId}`),
        recordingStatusCallbackMethod: 'POST',
        action: webhookUrl(teamId, `/api/telephony/status/${teamId}?callId=${callId}`),
        method: 'POST',
      },
      target,
    )
  }

  res.type('text/xml').send(twiml.toString())
})

// ---------- Routes authentifiées (frontend Intervia) ----------

telephonyRouter.use(requireAuth)

// Jamais renvoyer authToken/openaiApiKey en clair au frontend une fois
// enregistrés (même logique que stripe_secret_key avant lui) — seuls les
// champs non sensibles + des booléens "configuré ou non" sortent d'ici.
telephonyRouter.get('/settings', requireAdmin, (req, res) => {
  const creds = getTwilioCredentials(req.caller.team_id) ?? {}
  res.json({
    configured: isTelephonyConfigured(req.caller.team_id),
    accountSid: creds.accountSid ?? '',
    phoneNumber: creds.phoneNumber ?? '',
    forwardingNumber: creds.forwardingNumber ?? '',
    forwardingNumber2: creds.forwardingNumber2 ?? '',
    hasAuthToken: Boolean(creds.authToken),
    hasOpenaiKey: Boolean(creds.openaiApiKey),
  })
})

telephonyRouter.patch('/settings', requireAdmin, (req, res) => {
  const { accountSid, authToken, phoneNumber, forwardingNumber, forwardingNumber2, openaiApiKey } = req.body ?? {}
  rememberPublicBaseUrl(req)
  setTwilioCredentials(req.caller.team_id, {
    accountSid,
    authToken: authToken || undefined,
    phoneNumber: phoneNumber !== undefined ? toE164(phoneNumber) : undefined,
    forwardingNumber: forwardingNumber !== undefined ? toE164(forwardingNumber) : undefined,
    forwardingNumber2: forwardingNumber2 !== undefined ? toE164(forwardingNumber2) : undefined,
    openaiApiKey: openaiApiKey || undefined,
  })
  res.json({ ok: true })
})

// Recherche de numéros français disponibles à l'achat — ne touche à rien,
// juste une liste à choisir.
telephonyRouter.get('/numbers/search', requireAdmin, async (req, res) => {
  const client = getTwilioClient(req.caller.team_id)
  if (!client) return res.status(400).json({ error: 'Twilio non configuré.' })
  try {
    const results = await client.availablePhoneNumbers('FR').local.list({ limit: 20 })
    res.json(
      results.map((n) => ({
        phoneNumber: n.phoneNumber,
        friendlyName: n.friendlyName,
        locality: n.locality,
        region: n.region,
      })),
    )
  } catch (e) {
    res.status(500).json({ error: twilioErrorMessage(e) })
  }
})

// Numéros déjà possédés par le compte Twilio de l'équipe — permet de
// retrouver/gérer un numéro acheté ailleurs ou lors d'une session précédente.
telephonyRouter.get('/numbers', requireAdmin, async (req, res) => {
  const client = getTwilioClient(req.caller.team_id)
  if (!client) return res.status(400).json({ error: 'Twilio non configuré.' })
  try {
    const owned = await client.incomingPhoneNumbers.list({ limit: 20 })
    res.json(owned.map((n) => ({ sid: n.sid, phoneNumber: n.phoneNumber, friendlyName: n.friendlyName })))
  } catch (e) {
    res.status(500).json({ error: twilioErrorMessage(e) })
  }
})

// Achète réellement le numéro choisi (coût réel chez Twilio dès cet appel)
// et configure tout de suite son webhook vocal — opérationnel immédiatement,
// l'admin n'a jamais besoin d'aller sur dashboard.twilio.com.
telephonyRouter.post('/numbers/buy', requireAdmin, async (req, res) => {
  const { phoneNumber } = req.body ?? {}
  if (!phoneNumber) return res.status(400).json({ error: 'Numéro manquant.' })
  const client = getTwilioClient(req.caller.team_id)
  if (!client) return res.status(400).json({ error: 'Twilio non configuré.' })
  rememberPublicBaseUrl(req)

  try {
    const bought = await client.incomingPhoneNumbers.create({
      phoneNumber,
      voiceUrl: webhookUrl(req.caller.team_id, `/api/telephony/voice/${req.caller.team_id}`),
      voiceMethod: 'POST',
    })
    setTwilioCredentials(req.caller.team_id, { phoneNumber: bought.phoneNumber })
    res.json({ sid: bought.sid, phoneNumber: bought.phoneNumber })
  } catch (e) {
    res.status(500).json({ error: twilioErrorMessage(e) })
  }
})

// Résilie le numéro — arrête la facturation Twilio immédiatement. Si c'est
// le numéro actuellement configuré comme numéro de l'équipe, on l'efface
// aussi du réglage (sinon un appel entrant continuerait de pointer dessus).
telephonyRouter.delete('/numbers/:sid', requireAdmin, async (req, res) => {
  const client = getTwilioClient(req.caller.team_id)
  if (!client) return res.status(400).json({ error: 'Twilio non configuré.' })
  try {
    const released = await client.incomingPhoneNumbers(req.params.sid).fetch()
    await client.incomingPhoneNumbers(req.params.sid).remove()
    // Si c'est le numéro actuellement configuré comme celui de l'équipe, on
    // l'efface du réglage — sinon un appel entrant continuerait de pointer
    // sur un numéro qui n'appartient plus au compte.
    const creds = getTwilioCredentials(req.caller.team_id)
    if (creds?.phoneNumber === released.phoneNumber) {
      setTwilioCredentials(req.caller.team_id, { phoneNumber: '' })
    }
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ error: twilioErrorMessage(e) })
  }
})

// Appel sortant "click-to-call" : on appelle D'ABORD le mobile de l'admin ;
// dès qu'il décroche, Twilio demande le TwiML de /voice/outbound-bridge
// ci-dessus, qui le ponte vers le client. L'admin vit ça comme un appel
// entrant classique sur son téléphone.
telephonyRouter.post('/call', requireAdmin, async (req, res) => {
  const to = toE164(req.body?.to)
  if (!to) return res.status(400).json({ error: 'Numéro manquant.' })
  rememberPublicBaseUrl(req)
  const client = getTwilioClient(req.caller.team_id)
  const creds = getTwilioCredentials(req.caller.team_id)
  // Un appel sortant fait sonner UN seul des deux téléphones (celui de la
  // personne qui a cliqué "Appeler"), pas les deux comme un appel entrant.
  const ringFirst = req.body?.ring === 2 ? creds?.forwardingNumber2 : creds?.forwardingNumber
  if (!client || !ringFirst || !creds?.phoneNumber) {
    return res.status(400).json({ error: 'Téléphonie non configurée (numéro ou renvoi manquant).' })
  }

  const callId = uuid()
  try {
    const call = await client.calls.create({
      to: ringFirst,
      from: creds.phoneNumber,
      url: webhookUrl(req.caller.team_id, `/api/telephony/voice/outbound-bridge/${req.caller.team_id}?callId=${callId}&target=${encodeURIComponent(to)}`),
      method: 'POST',
    })
    db.prepare(
      `INSERT INTO calls (id, team_id, direction, from_number, to_number, status, twilio_call_sid, started_at)
       VALUES (?, ?, 'outbound', ?, ?, 'en-cours', ?, ?)`,
    ).run(callId, req.caller.team_id, creds.phoneNumber, to, call.sid, now())
    broadcast('call_update', { id: callId }, req.caller.team_id)
    res.json({ ok: true, callId })
  } catch (e) {
    res.status(500).json({ error: twilioErrorMessage(e) })
  }
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

// Proxy authentifié vers l'enregistrement Twilio — l'URL Twilio elle-même
// exige une Basic Auth (identifiants de l'équipe) qu'on ne peut jamais
// envoyer depuis le navigateur ; on la relaie ici après avoir vérifié que
// l'appel demandé appartient bien à l'équipe de l'appelant.
telephonyRouter.get('/calls/:id/recording', async (req, res) => {
  const call = db.prepare('SELECT * FROM calls WHERE id = ? AND team_id = ?').get(req.params.id, req.caller.team_id)
  if (!call?.recording_url) return res.status(404).json({ error: 'Enregistrement introuvable' })

  const creds = getTwilioCredentials(req.caller.team_id)
  if (!creds?.accountSid || !creds?.authToken) return res.status(400).json({ error: 'Twilio non configuré.' })

  try {
    const twilioRes = await fetch(`${call.recording_url}.mp3`, {
      headers: { Authorization: 'Basic ' + Buffer.from(`${creds.accountSid}:${creds.authToken}`).toString('base64') },
    })
    if (!twilioRes.ok) return res.status(502).json({ error: "Impossible de récupérer l'enregistrement." })
    res.type('audio/mpeg')
    const buffer = Buffer.from(await twilioRes.arrayBuffer())
    res.send(buffer)
  } catch (e) {
    res.status(500).json({ error: e.message ?? 'Erreur' })
  }
})
