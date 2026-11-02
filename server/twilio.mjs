import Twilio from 'twilio'

import { getSetting, setSetting } from './db.mjs'

// Un client Twilio par équipe (contrairement à Stripe à l'époque où c'était
// une seule clé plateforme) : chaque entreprise cliente a son propre compte
// Twilio, son propre numéro, ses propres appels — jamais partagés entre
// équipes. Mis en cache par team_id pour ne pas recréer un client à chaque
// requête, invalidé dès que les identifiants changent.
const clients = new Map()

function resolveCredentials(teamId) {
  return getSetting('twilio_credentials', teamId) || null
}

export function getTwilioClient(teamId) {
  const creds = resolveCredentials(teamId)
  if (!creds?.accountSid || !creds?.authToken) return null
  const cached = clients.get(teamId)
  if (cached && cached.accountSid === creds.accountSid && cached.authToken === creds.authToken) {
    return cached.client
  }
  const client = Twilio(creds.accountSid, creds.authToken)
  clients.set(teamId, { accountSid: creds.accountSid, authToken: creds.authToken, client })
  return client
}

export function getTwilioCredentials(teamId) {
  return resolveCredentials(teamId)
}

export function isTelephonyConfigured(teamId) {
  const creds = resolveCredentials(teamId)
  return Boolean(creds?.accountSid && creds?.authToken)
}

// Numéro Twilio de l'équipe + numéro de renvoi (le vrai mobile de l'admin)
// sont stockés avec les identifiants plutôt qu'à part — ils forment une
// seule unité de configuration, modifiée/relue ensemble depuis Réglages →
// Téléphonie.
export function setTwilioCredentials(
  teamId,
  { accountSid, authToken, phoneNumber, forwardingNumber, forwardingNumber2, openaiApiKey },
) {
  const existing = resolveCredentials(teamId) ?? {}
  setSetting(
    'twilio_credentials',
    {
      accountSid: accountSid !== undefined ? accountSid : existing.accountSid,
      authToken: authToken !== undefined ? authToken : existing.authToken,
      phoneNumber: phoneNumber !== undefined ? phoneNumber : existing.phoneNumber,
      forwardingNumber: forwardingNumber !== undefined ? forwardingNumber : existing.forwardingNumber,
      forwardingNumber2: forwardingNumber2 !== undefined ? forwardingNumber2 : existing.forwardingNumber2,
      openaiApiKey: openaiApiKey !== undefined ? openaiApiKey : existing.openaiApiKey,
    },
    teamId,
  )
  clients.delete(teamId)
}
