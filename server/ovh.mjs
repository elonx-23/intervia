import crypto from 'node:crypto'

import { getSetting, setSetting } from './db.mjs'

// Client de l'opérateur téléphonique. Le nom du fournisseur ne doit JAMAIS
// apparaître dans l'app (textes, messages d'erreur, liens) : tout ce qui sort
// d'ici vers un navigateur passe par hideProvider()/providerErrorMessage().
// OVH_API_BASE ne sert qu'aux tests locaux (faux serveur de l'opérateur).
const API_BASE = process.env.OVH_API_BASE || 'https://eu.api.ovh.com/1.0'

// ---------- Configuration par équipe ----------

// Un seul réglage JSON par équipe : accès à l'opérateur, clé de transcription,
// téléphones de renvoi, informations légales, option d'enregistrement. Les
// clés d'accès (operator*, openaiApiKey) ne sont jamais renvoyées au navigateur.
export function getTelephonyConfig(teamId) {
  return getSetting('telephony', teamId) ?? {}
}

export function updateTelephonyConfig(teamId, patch) {
  const next = { ...getTelephonyConfig(teamId) }
  for (const [key, value] of Object.entries(patch)) {
    if (value !== undefined) next[key] = value
  }
  // Anciens noms de champs (avant le passage en noms neutres).
  for (const legacy of ['ovhApplicationKey', 'ovhApplicationSecret', 'ovhConsumerKey']) delete next[legacy]
  setSetting('telephony', next, teamId)
}

export function operatorCredentials(config) {
  return {
    applicationKey: config.operatorAppKey,
    applicationSecret: config.operatorAppSecret,
    consumerKey: config.operatorConsumerKey,
  }
}

export function isTelephonyConfigured(teamId) {
  const c = getTelephonyConfig(teamId)
  return Boolean(c.operatorAppKey && c.operatorAppSecret && c.operatorConsumerKey)
}

// ---------- Appels vers l'opérateur ----------

export class OperatorError extends Error {
  constructor(status, body) {
    super(body?.message || `Erreur de l'opérateur (${status})`)
    this.status = status
    this.providerClass = body?.class ?? ''
  }
}

// L'opérateur refuse toute requête dont l'horodatage s'écarte de sa propre
// horloge : on mesure l'écart une fois puis on le réutilise.
let timeOffset = null

async function operatorNow() {
  if (timeOffset === null) {
    const res = await fetch(`${API_BASE}/auth/time`, { signal: AbortSignal.timeout(15000) })
    timeOffset = Number(await res.text()) - Math.floor(Date.now() / 1000)
  }
  return Math.floor(Date.now() / 1000) + timeOffset
}

async function parseResponse(res) {
  const text = await res.text()
  let body
  try {
    body = JSON.parse(text)
  } catch {
    body = text
  }
  if (!res.ok) {
    throw new OperatorError(res.status, typeof body === 'object' && body ? body : { message: String(body).slice(0, 200) })
  }
  return body
}

export async function operatorRequest(creds, method, path, { query, body, isRetry = false } = {}) {
  const qs = query ? `?${new URLSearchParams(query)}` : ''
  const url = `${API_BASE}${path}${qs}`
  const payload = body === undefined ? '' : JSON.stringify(body)
  const timestamp = await operatorNow()
  // Signature : sha1 de « secret+clé consommateur+méthode+url+corps+horodatage ».
  const signature =
    '$1$' +
    crypto
      .createHash('sha1')
      .update([creds.applicationSecret, creds.consumerKey, method, url, payload, timestamp].join('+'))
      .digest('hex')

  try {
    const res = await fetch(url, {
      method,
      headers: {
        ...(payload ? { 'Content-Type': 'application/json' } : {}),
        'X-Ovh-Application': creds.applicationKey,
        'X-Ovh-Consumer': creds.consumerKey,
        'X-Ovh-Timestamp': String(timestamp),
        'X-Ovh-Signature': signature,
      },
      body: payload || undefined,
      signal: AbortSignal.timeout(30000),
    })
    return await parseResponse(res)
  } catch (e) {
    if (!isRetry && e instanceof OperatorError && /timestamp/i.test(e.message)) {
      timeOffset = null
      return operatorRequest(creds, method, path, { query, body, isRetry: true })
    }
    throw e
  }
}

export const operatorGet = (creds, path, query) => operatorRequest(creds, 'GET', path, { query })
export const operatorPost = (creds, path, body) => operatorRequest(creds, 'POST', path, { body })
export const operatorPut = (creds, path, body) => operatorRequest(creds, 'PUT', path, { body })
export const operatorDelete = (creds, path, query) => operatorRequest(creds, 'DELETE', path, { query })

// Catalogue public (villes, numéros disponibles) : aucune authentification.
export async function operatorPublicGet(path, query) {
  const qs = query ? `?${new URLSearchParams(query)}` : ''
  const res = await fetch(`${API_BASE}${path}${qs}`, { signal: AbortSignal.timeout(20000) })
  return parseResponse(res)
}

// ---------- Messages d'erreur sans le nom du fournisseur ----------

// Retire tout ce qui désignerait le fournisseur (nom, adresses web) d'un texte
// destiné à l'écran.
export function hideProvider(text) {
  return String(text ?? '')
    .replace(/https?:\/\/\S*ovh\S*/gi, '')
    .replace(/ovh\s?telecom|ovh\s?cloud|ovh/gi, "l'opérateur")
    .replace(/\s{2,}/g, ' ')
    .trim()
}

// Les erreurs de l'opérateur sont en anglais technique : on traduit celles que
// l'admin peut réellement croiser, et on neutralise le reste.
export function providerErrorMessage(e) {
  if (e instanceof OperatorError) {
    const haystack = `${e.message} ${e.providerClass}`
    if (/not been granted|NotGranted/i.test(haystack)) {
      return "L'opérateur refuse cette action : les droits de la connexion sont insuffisants. Contacte le support."
    }
    if (e.status === 401 || /credential|invalid (signature|application|consumer)|application (key|secret)|unauthorized/i.test(haystack)) {
      return "Connexion à l'opérateur refusée : les accès sont invalides ou ont expiré. Contacte le support."
    }
    if (e.status === 404) return "Élément introuvable chez l'opérateur."
    return `L'opérateur a refusé la demande : ${hideProvider(e.message)}`
  }
  if (e?.name === 'TimeoutError' || e?.name === 'AbortError') {
    return "L'opérateur ne répond pas, réessaie dans un instant."
  }
  return hideProvider(e?.message) || 'Erreur inconnue.'
}
