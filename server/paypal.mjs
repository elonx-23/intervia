// PayPal, API REST « Orders v2 », avec les identifiants de l'entreprise
// (Réglages → Intégrations : Client ID + Secret d'une app créée sur
// developer.paypal.com). Live ou Sandbox (test) selon les identifiants.
//
// Un lien de paiement PayPal est un lien vers NOTRE page /payer/:id : c'est
// elle qui crée la commande PayPal au moment où le client l'ouvre. PayPal ne
// laisse que 6 h pour valider une commande ; le lien envoyé au client, lui,
// reste valable jusqu'au paiement. Au retour de PayPal, la commande est
// encaissée et le lien passe « payé » : un lien = un seul paiement.

export class PaypalError extends Error {
  constructor(message, { status = null, issue = null } = {}) {
    super(message)
    this.status = status
    this.issue = issue
  }
}

const BASE = { live: 'https://api-m.paypal.com', sandbox: 'https://api-m.sandbox.paypal.com' }

// Jetons d'accès en mémoire (valables ~9 h chez PayPal), par Client ID.
const tokens = new Map()

async function requestToken(env, clientId, secret) {
  const res = await fetch(`${BASE[env]}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${secret}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
    signal: AbortSignal.timeout(15000),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok || !body.access_token) return null
  return { token: body.access_token, expiresAt: Date.now() + (Number(body.expires_in) || 3600) * 1000 - 60_000 }
}

// Essaie Live puis Sandbox : renvoie l'environnement des identifiants, ou
// null si PayPal les refuse dans les deux.
export async function detectPaypalEnv(clientId, secret) {
  for (const env of ['live', 'sandbox']) {
    const t = await requestToken(env, clientId, secret)
    if (t) {
      tokens.set(clientId, { ...t, env })
      return env
    }
  }
  return null
}

async function accessToken(keys, fresh = false) {
  const cached = tokens.get(keys.clientId)
  if (!fresh && cached && cached.env === keys.env && cached.expiresAt > Date.now()) return cached.token
  const t = await requestToken(keys.env, keys.clientId, keys.secret)
  if (!t) throw new PaypalError('PayPal refuse les identifiants enregistrés.', { status: 401 })
  tokens.set(keys.clientId, { ...t, env: keys.env })
  return t.token
}

// Vérifie que les identifiants enregistrés marchent toujours (jeton en cache).
export const checkPaypalKeys = (keys) => accessToken(keys)

async function api(keys, method, path, body, headers = {}) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch(`${BASE[keys.env]}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${await accessToken(keys, attempt > 0)}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
        ...headers,
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(20000),
    })
    if (res.status === 401 && attempt === 0) continue // jeton périmé côté PayPal : on en reprend un
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      const issue = data?.details?.[0]?.issue ?? data?.name ?? null
      throw new PaypalError(data?.details?.[0]?.description || data?.message || `PayPal HTTP ${res.status}`, { status: res.status, issue })
    }
    return data
  }
  throw new PaypalError('PayPal refuse les identifiants enregistrés.', { status: 401 })
}

const money = (n) => (Math.round(Number(n) * 100) / 100).toFixed(2)

// Commande PayPal pour un lien : montant et motif du lien, nom de
// l'entreprise sur la page PayPal, retour vers /payer/:id/retour.
export async function createPaypalOrder(keys, link, { brandName, returnUrl, cancelUrl }) {
  const order = await api(keys, 'POST', '/v2/checkout/orders', {
    intent: 'CAPTURE',
    purchase_units: [
      {
        reference_id: link.id,
        custom_id: link.id,
        description: link.description.slice(0, 127),
        amount: { currency_code: 'EUR', value: money(link.amount) },
      },
    ],
    payment_source: {
      paypal: {
        experience_context: {
          brand_name: brandName ? brandName.slice(0, 127) : undefined,
          locale: 'fr-FR',
          // Formulaire « Payer par carte bancaire » d'emblée (beaucoup de
          // clients n'ont pas PayPal), avec « Connectez-vous » juste au-dessus.
          landing_page: 'GUEST_CHECKOUT',
          shipping_preference: 'NO_SHIPPING',
          user_action: 'PAY_NOW',
          return_url: returnUrl,
          cancel_url: cancelUrl,
        },
      },
    },
  })
  const approveUrl = order.links?.find((l) => l.rel === 'payer-action' || l.rel === 'approve')?.href
  if (!order.id || !approveUrl) throw new PaypalError('PayPal n’a pas renvoyé de page de paiement.')
  return { id: order.id, approveUrl }
}

// La commande correspond-elle bien à CE lien (même identifiant, même
// montant) ? Empêche de « payer » un lien avec la commande d'un autre lien
// moins cher.
function orderMatches(order, link) {
  const pu = order?.purchase_units?.[0]
  return Boolean(pu && pu.custom_id === link.id && pu.amount?.currency_code === 'EUR' && pu.amount?.value === money(link.amount))
}

// Où en est la commande d'un lien ? L'encaisse si le client l'a validée.
// → { state: 'paid' | 'pending' | 'open' | 'declined' | 'invalid', paidAt? }
//   paid     : argent encaissé
//   pending  : encaissé mais en cours de vérification chez PayPal
//   open     : pas (encore) validée par le client
//   declined : moyen de paiement refusé
//   invalid  : commande qui n'appartient pas à ce lien
export async function settlePaypalOrder(keys, link, orderId) {
  const path = `/v2/checkout/orders/${encodeURIComponent(orderId)}`
  let order = await api(keys, 'GET', path)
  if (!orderMatches(order, link)) return { state: 'invalid' }
  if (order.status === 'APPROVED') {
    try {
      // Même identifiant de requête à chaque tentative : PayPal n'encaisse qu'une fois.
      order = await api(keys, 'POST', `${path}/capture`, {}, { 'PayPal-Request-Id': `capture-${orderId}` })
    } catch (e) {
      if (e.issue === 'INSTRUMENT_DECLINED') return { state: 'declined' }
      if (e.issue !== 'ORDER_ALREADY_CAPTURED') throw e
      order = await api(keys, 'GET', path)
    }
  }
  const capture = order?.purchase_units?.[0]?.payments?.captures?.[0]
  if (order.status === 'COMPLETED' && capture) {
    const paidAt = capture.create_time || capture.update_time || null
    if (['COMPLETED', 'PARTIALLY_REFUNDED', 'REFUNDED'].includes(capture.status)) return { state: 'paid', paidAt }
    if (capture.status === 'PENDING') return { state: 'pending' }
    return { state: 'declined' }
  }
  return { state: 'open' }
}
