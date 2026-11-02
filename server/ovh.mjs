import crypto from 'node:crypto'

import { getSetting, setSetting } from './db.mjs'

// L'app ne fait que LIRE chez OVH (liste des appels enregistrés + fichiers
// audio) : numéros, commandes et réglages de renvoi se gèrent directement
// chez OVH, jamais depuis l'app. D'où un client volontairement limité au GET
// — impossible de commander ou de modifier quoi que ce soit par erreur.
// OVH_API_BASE ne sert qu'aux tests locaux (faux serveur OVH).
const API_BASE = process.env.OVH_API_BASE || 'https://eu.api.ovh.com/1.0'

// ---------- Configuration par équipe ----------

// Un seul réglage JSON par équipe : clés de l'application OVH, clé
// OpenAI (transcription + fiches automatiques). Jamais renvoyé tel quel au
// frontend.
export function getTelephonyConfig(teamId) {
  return getSetting('telephony', teamId) ?? {}
}

export function updateTelephonyConfig(teamId, patch) {
  const next = { ...getTelephonyConfig(teamId) }
  for (const [key, value] of Object.entries(patch)) {
    if (value !== undefined) next[key] = value
  }
  setSetting('telephony', next, teamId)
}

export function ovhCredentials(config) {
  return {
    applicationKey: config.ovhApplicationKey,
    applicationSecret: config.ovhApplicationSecret,
    consumerKey: config.ovhConsumerKey,
  }
}

export function isTelephonyConfigured(teamId) {
  const c = getTelephonyConfig(teamId)
  return Boolean(c.ovhApplicationKey && c.ovhApplicationSecret && c.ovhConsumerKey)
}

// ---------- Client OVH (lecture seule) ----------

export class OvhError extends Error {
  constructor(status, body) {
    super(body?.message || `Erreur OVH (${status})`)
    this.status = status
    this.ovhClass = body?.class ?? ''
  }
}

// OVH refuse toute requête dont l'horodatage s'écarte de sa propre horloge :
// on mesure l'écart une fois puis on le réutilise.
let timeOffset = null

async function ovhNow() {
  if (timeOffset === null) {
    const res = await fetch(`${API_BASE}/auth/time`, { signal: AbortSignal.timeout(15000) })
    timeOffset = Number(await res.text()) - Math.floor(Date.now() / 1000)
  }
  return Math.floor(Date.now() / 1000) + timeOffset
}

export async function ovhGet(creds, path, query, isRetry = false) {
  const qs = query ? `?${new URLSearchParams(query)}` : ''
  const url = `${API_BASE}${path}${qs}`
  const timestamp = await ovhNow()
  // Signature OVH : sha1 de « secret+clé consommateur+méthode+url+corps+horodatage ».
  const signature =
    '$1$' +
    crypto
      .createHash('sha1')
      .update([creds.applicationSecret, creds.consumerKey, 'GET', url, '', timestamp].join('+'))
      .digest('hex')

  const res = await fetch(url, {
    headers: {
      'X-Ovh-Application': creds.applicationKey,
      'X-Ovh-Consumer': creds.consumerKey,
      'X-Ovh-Timestamp': String(timestamp),
      'X-Ovh-Signature': signature,
    },
    signal: AbortSignal.timeout(20000),
  })
  const text = await res.text()
  let body
  try {
    body = JSON.parse(text)
  } catch {
    body = text
  }
  if (!res.ok) {
    const error = new OvhError(res.status, typeof body === 'object' ? body : { message: String(body).slice(0, 200) })
    if (!isRetry && /timestamp/i.test(error.message)) {
      timeOffset = null
      return ovhGet(creds, path, query, true)
    }
    throw error
  }
  return body
}

// Les erreurs OVH sont en anglais technique : on traduit celles que l'admin
// peut réellement croiser.
export function ovhErrorMessage(e) {
  if (e instanceof OvhError) {
    if (/not been granted|NotGranted/i.test(`${e.message} ${e.ovhClass}`)) {
      return "OVH refuse cet accès : la clé consommateur n'a pas les droits nécessaires."
    }
    if (
      e.status === 401 ||
      /credential|invalid (signature|application|consumer)|application (key|secret)|unauthorized/i.test(`${e.message} ${e.ovhClass}`)
    ) {
      return 'OVH refuse la connexion : les clés OVH sont invalides ou ont expiré.'
    }
    return `Erreur OVH : ${e.message}`
  }
  return e?.name === 'TimeoutError' ? 'OVH ne répond pas, nouvelle tentative dans une minute.' : `Erreur : ${e?.message ?? 'inconnue'}`
}
