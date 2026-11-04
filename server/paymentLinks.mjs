import Stripe from 'stripe'

import { db, getSetting, now, setSetting, uuid } from './db.mjs'

// Liens de paiement de l'entreprise (montant libre + motif), encaissés sur
// SON compte : Stripe ou PayPal POS (Zettle), selon les clés collées dans
// Réglages → Intégrations. Ces clés appartiennent à l'équipe, restent côté
// serveur et ne sont jamais renvoyées en clair.

db.exec(`
  CREATE TABLE IF NOT EXISTS payment_links (
    id TEXT PRIMARY KEY,
    team_id TEXT NOT NULL,
    provider TEXT NOT NULL,
    amount REAL NOT NULL,
    currency TEXT NOT NULL,
    description TEXT NOT NULL,
    url TEXT NOT NULL,
    provider_ref TEXT,
    status TEXT NOT NULL,
    paid_at TEXT,
    created_by TEXT,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_payment_links_team ON payment_links (team_id, created_at);
`)

export class PaymentError extends Error {}

// ---------- Clés (Réglages → Intégrations) ----------

const getIntegrations = (teamId) => getSetting('integrations', teamId) ?? {}

const mask = (v) => (v ? `••••${String(v).slice(-4)}` : null)

export function integrationsOverview(teamId) {
  const i = getIntegrations(teamId)
  const stripe = Boolean(i.stripeSecretKey)
  const zettle = Boolean(i.zettleClientId && i.zettleApiKey)
  return {
    stripe: { connected: stripe, key: mask(i.stripeSecretKey), mode: i.stripeSecretKey?.includes('_test_') ? 'test' : stripe ? 'live' : null },
    zettle: { connected: zettle, clientId: mask(i.zettleClientId) },
    defaultProvider: i.defaultProvider && ((i.defaultProvider === 'stripe' && stripe) || (i.defaultProvider === 'zettle' && zettle)) ? i.defaultProvider : stripe ? 'stripe' : zettle ? 'zettle' : null,
  }
}

// Vérifie la clé Stripe par un appel réel avant de l'enregistrer.
export async function saveStripeKey(teamId, key) {
  const k = String(key ?? '').trim()
  if (!/^(sk|rk)_(live|test)_[A-Za-z0-9]{10,}$/.test(k)) throw new PaymentError('Clé Stripe invalide : elle commence par sk_live_ (ou rk_live_ pour une clé restreinte).')
  try {
    await new Stripe(k).balance.retrieve()
  } catch {
    throw new PaymentError('Stripe refuse cette clé. Vérifie-la dans ton tableau de bord Stripe (Développeurs → Clés API).')
  }
  setSetting('integrations', { ...getIntegrations(teamId), stripeSecretKey: k }, teamId)
}

export async function saveZettleKeys(teamId, clientId, apiKey) {
  const id = String(clientId ?? '').trim()
  const key = String(apiKey ?? '').trim()
  if (!id || !key) throw new PaymentError('Indique le Client ID et la clé API Zettle.')
  await zettleToken(id, key) // lève une erreur claire si refusé
  setSetting('integrations', { ...getIntegrations(teamId), zettleClientId: id, zettleApiKey: key }, teamId)
}

export function removeIntegration(teamId, provider) {
  const i = { ...getIntegrations(teamId) }
  if (provider === 'stripe') delete i.stripeSecretKey
  if (provider === 'zettle') {
    delete i.zettleClientId
    delete i.zettleApiKey
  }
  setSetting('integrations', i, teamId)
}

export function setDefaultProvider(teamId, provider) {
  if (!['stripe', 'zettle'].includes(provider)) throw new PaymentError('Choix invalide.')
  setSetting('integrations', { ...getIntegrations(teamId), defaultProvider: provider }, teamId)
}

// ---------- Stripe ----------

async function createStripeLink(key, { amount, description }) {
  const stripe = new Stripe(key)
  const price = await stripe.prices.create({
    currency: 'eur',
    unit_amount: Math.round(amount * 100),
    product_data: { name: description.slice(0, 250) },
  })
  const link = await stripe.paymentLinks.create({
    line_items: [{ price: price.id, quantity: 1 }],
    // Un lien = un paiement : il se désactive une fois réglé (voir refresh).
    restrictions: { completed_sessions: { limit: 1 } },
  })
  return { url: link.url, ref: link.id }
}

async function stripeLinkPaid(key, ref) {
  const stripe = new Stripe(key)
  const sessions = await stripe.checkout.sessions.list({ payment_link: ref, limit: 5 })
  const paid = sessions.data.find((s) => s.payment_status === 'paid')
  return paid ? new Date(paid.created * 1000).toISOString() : null
}

// ---------- PayPal POS (Zettle) ----------

// Jeton d'accès pour sa propre intégration : client_id + clé API (« assertion »).
async function zettleToken(clientId, apiKey) {
  const res = await fetch('https://oauth.zettle.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', client_id: clientId, assertion: apiKey }),
    signal: AbortSignal.timeout(15000),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok || !body.access_token) {
    throw new PaymentError('Zettle refuse ces clés. Vérifie le Client ID et la clé API dans ton espace développeur Zettle.')
  }
  return body.access_token
}

async function createZettleLink() {
  // Branché dès que l'API de liens de paiement Zettle est confirmée.
  throw new PaymentError("La création de liens PayPal POS n'est pas encore disponible : utilise Stripe pour l'instant.")
}

// ---------- Liens ----------

export async function createPaymentLink(teamId, userId, { amount, description, provider }) {
  const value = Math.round(Number(amount) * 100) / 100
  const label = String(description ?? '').trim().slice(0, 200)
  if (!Number.isFinite(value) || value < 1) throw new PaymentError('Indique un montant d’au moins 1 €.')
  if (value > 50000) throw new PaymentError('Montant trop élevé.')
  if (!label) throw new PaymentError('Indique le motif du paiement.')

  const overview = integrationsOverview(teamId)
  const chosen = provider || overview.defaultProvider
  if (!chosen) throw new PaymentError('Ajoute d’abord ta clé Stripe ou PayPal POS dans Réglages → Intégrations.')
  const keys = getIntegrations(teamId)

  let created
  try {
    if (chosen === 'stripe') {
      if (!keys.stripeSecretKey) throw new PaymentError('Stripe n’est pas relié.')
      created = await createStripeLink(keys.stripeSecretKey, { amount: value, description: label })
    } else {
      if (!keys.zettleClientId) throw new PaymentError('PayPal POS n’est pas relié.')
      created = await createZettleLink(keys, { amount: value, description: label })
    }
  } catch (e) {
    if (e instanceof PaymentError) throw e
    console.log(`[paiement] création du lien échouée (${chosen}) : ${e.message}`)
    throw new PaymentError(`Le service de paiement a refusé la demande : ${String(e.message).slice(0, 160)}`)
  }

  const id = uuid()
  db.prepare(
    `INSERT INTO payment_links (id, team_id, provider, amount, currency, description, url, provider_ref, status, created_by, created_at)
     VALUES (?, ?, ?, ?, 'EUR', ?, ?, ?, 'en_attente', ?, ?)`,
  ).run(id, teamId, chosen, value, label, created.url, created.ref, userId, now())
  return db.prepare('SELECT * FROM payment_links WHERE id = ?').get(id)
}

// Liste des liens ; l'état « payé » des plus récents est revérifié chez le prestataire.
export async function listPaymentLinks(teamId) {
  const keys = getIntegrations(teamId)
  const pending = db
    .prepare("SELECT * FROM payment_links WHERE team_id = ? AND status = 'en_attente' ORDER BY created_at DESC LIMIT 15")
    .all(teamId)
  await Promise.all(
    pending.map(async (l) => {
      try {
        if (l.provider === 'stripe' && keys.stripeSecretKey && l.provider_ref) {
          const paidAt = await stripeLinkPaid(keys.stripeSecretKey, l.provider_ref)
          if (paidAt) db.prepare("UPDATE payment_links SET status = 'paye', paid_at = ? WHERE id = ?").run(paidAt, l.id)
        }
      } catch {
        // prestataire injoignable : on garde l'état connu
      }
    }),
  )
  return db.prepare('SELECT * FROM payment_links WHERE team_id = ? ORDER BY created_at DESC LIMIT 100').all(teamId)
}

export function cancelPaymentLink(teamId, id) {
  const link = db.prepare('SELECT * FROM payment_links WHERE id = ? AND team_id = ?').get(id, teamId)
  if (!link) throw new PaymentError('Lien introuvable.')
  const keys = getIntegrations(teamId)
  if (link.provider === 'stripe' && keys.stripeSecretKey && link.provider_ref && link.status === 'en_attente') {
    new Stripe(keys.stripeSecretKey).paymentLinks.update(link.provider_ref, { active: false }).catch(() => {})
  }
  db.prepare("UPDATE payment_links SET status = 'annule' WHERE id = ? AND status = 'en_attente'").run(id)
}
