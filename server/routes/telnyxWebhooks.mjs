import express, { Router } from 'express'

import { db, now, uuid } from '../db.mjs'
import { broadcast } from '../events.mjs'
import { getTelephonyConfig } from '../ovh.mjs'
import { toE164 } from '../phone.mjs'
import { desiredConfig } from '../telephonyNumbers.mjs'
import { storeRecording, verifyWebhook, webhookUrl } from '../telnyx.mjs'
import { teamForNumber } from '../telnyxNumbers.mjs'
import { transcribeCallRecording } from '../transcription.mjs'

// Webhooks de l'opérateur « revendeur » (TeXML, format compatible Twilio) :
// l'appel arrive → on répond avec les téléphones à faire sonner ; fin d'appel
// et enregistrement arrivent ensuite sur leurs propres URL.
//
// Monté AVANT express.json() dans index.mjs : le corps brut est gardé pour la
// vérification de signature.

export const telnyxWebhookRouter = Router()

telnyxWebhookRouter.use(
  express.urlencoded({
    extended: false,
    limit: '200kb',
    verify: (req, _res, buf) => {
      req.rawBody = buf.toString('utf8')
    },
  }),
)

telnyxWebhookRouter.use((req, res, next) => {
  if (!verifyWebhook(req)) return res.status(403).send('forbidden')
  next()
})

const xmlEscape = (s) =>
  String(s ?? '').replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[c])

function texml(res, body) {
  res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?><Response>${body}</Response>`)
}

const say = (text) => `<Say language="fr-FR">${xmlEscape(text)}</Say>`

// Statut d'appel tel qu'affiché dans le journal (voir CallsPanel).
function frenchStatus(dialStatus) {
  if (dialStatus === 'completed' || dialStatus === 'answered') return 'terminé'
  if (dialStatus === 'busy' || dialStatus === 'no-answer' || dialStatus === 'canceled') return 'manqué'
  if (dialStatus === 'failed') return 'échoué'
  return 'terminé'
}

// Appel entrant sur un numéro de l'équipe : sonne en même temps sur tous les
// téléphones de renvoi (le premier qui décroche prend l'appel), enregistré si
// l'admin l'a accepté.
telnyxWebhookRouter.post('/voice', (req, res) => {
  const to = toE164(req.body.To)
  const from = toE164(req.body.From) || req.body.From || null
  const teamId = teamForNumber(to)
  if (!teamId) return texml(res, '<Reject reason="rejected"/>')

  const desired = desiredConfig(teamId)
  if (desired.phones.length === 0) {
    return texml(res, say("Ce numéro n'est pas encore relié à un téléphone. Merci de rappeler plus tard.") + '<Hangup/>')
  }

  const callId = uuid()
  db.prepare(
    `INSERT INTO calls (id, team_id, direction, from_number, to_number, status, provider_call_id, started_at)
     VALUES (?, ?, 'inbound', ?, ?, 'en-cours', ?, ?)`,
  ).run(callId, teamId, from, to, `tx:${req.body.CallSid ?? callId}`, now())
  broadcast('call_update', { id: callId }, teamId)

  const attrs = [
    'timeout="25"',
    `action="${xmlEscape(webhookUrl('after', { callId }))}"`,
    'method="POST"',
    'ringTone="fr"',
  ]
  if (desired.record) {
    attrs.push(
      'record="record-from-answer"',
      `recordingStatusCallback="${xmlEscape(webhookUrl('recording', { callId }))}"`,
      'recordingStatusCallbackMethod="POST"',
    )
  }
  const numbers = desired.phones.map((p) => `<Number>${xmlEscape(p)}</Number>`).join('')
  // L'appelant doit être informé de l'enregistrement.
  const notice = desired.record ? say('Cet appel peut être enregistré.') : ''
  texml(res, `${notice}<Dial ${attrs.join(' ')}>${numbers}</Dial>`)
})

// Fin du <Dial> : statut et durée de l'appel.
telnyxWebhookRouter.post('/after', (req, res) => {
  const callId = String(req.query.callId ?? '')
  const call = db.prepare('SELECT team_id FROM calls WHERE id = ?').get(callId)
  if (call) {
    db.prepare('UPDATE calls SET status = ?, duration_seconds = ?, ended_at = ? WHERE id = ?').run(
      frenchStatus(req.body.DialCallStatus),
      req.body.DialCallDuration ? Number(req.body.DialCallDuration) : null,
      now(),
      callId,
    )
    broadcast('call_update', { id: callId }, call.team_id)
  }
  texml(res, '<Hangup/>')
})

// Enregistrement prêt : le lien expire en 10 minutes, on copie le fichier
// tout de suite puis on lance la transcription (fiche automatique).
telnyxWebhookRouter.post('/recording', (req, res) => {
  res.sendStatus(200)
  const callId = String(req.query.callId ?? '')
  const url = req.body.RecordingUrl
  const call = db.prepare('SELECT team_id FROM calls WHERE id = ?').get(callId)
  if (!call || !url || req.body.RecordingStatus !== 'completed') return
  storeRecording(callId, url)
    .then((ref) => {
      db.prepare('UPDATE calls SET recording_url = ? WHERE id = ?').run(ref, callId)
      broadcast('call_update', { id: callId }, call.team_id)
      const { openaiApiKey } = getTelephonyConfig(call.team_id)
      if (openaiApiKey) return transcribeCallRecording({ callId, recordingUrl: ref, openaiApiKey })
    })
    .catch((e) => console.log(`[telephonie] enregistrement de l'appel ${callId} non récupéré : ${e.message}`))
})

// Statuts d'appel globaux de l'application : rien à faire, juste accuser réception.
telnyxWebhookRouter.post('/status', (_req, res) => res.sendStatus(200))
