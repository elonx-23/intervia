import { Router } from 'express'

import { requireAdmin, requireAuth } from '../auth.mjs'
import { getTwilioCredentials, isTelephonyConfigured, setTwilioCredentials } from '../twilio.mjs'

export const telephonyRouter = Router()
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
    hasAuthToken: Boolean(creds.authToken),
    hasOpenaiKey: Boolean(creds.openaiApiKey),
  })
})

telephonyRouter.patch('/settings', requireAdmin, (req, res) => {
  const { accountSid, authToken, phoneNumber, forwardingNumber, openaiApiKey } = req.body ?? {}
  setTwilioCredentials(req.caller.team_id, {
    accountSid,
    authToken: authToken || undefined,
    phoneNumber,
    forwardingNumber,
    openaiApiKey: openaiApiKey || undefined,
  })
  res.json({ ok: true })
})
