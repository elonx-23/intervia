import Stripe from 'stripe'

import { euro } from '../shared/documentPdf.mjs'
import { db, getSetting, now, setSetting, uuid } from './db.mjs'
import { broadcast } from './events.mjs'
import { notifyAdmin } from './notify.mjs'
import { checkPaypalKeys, detectPaypalEnv, settlePaypalOrder } from './paypal.mjs'

// Liens de paiement de l'entreprise (montant libre + motif), encaissés sur
// SON compte : Stripe ou PayPal, selon les clés collées dans Réglages →
// Intégrations. Ces clés appartiennent à l'équipe, restent côté serveur et ne
// sont jamais renvoyées en clair.

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

// Identifiants PayPal de l'équipe, au format attendu par paypal.mjs.
export function paypalKeys(teamId) {
  const i = getIntegrations(teamId)
  if (!i.paypalClientId || !i.paypalSecret) return null
  return { clientId: i.paypalClientId, secret: i.paypalSecret, env: i.paypalEnv === 'sandbox' ? 'sandbox' : 'live' }
}

export function integrationsOverview(teamId) {
  const i = getIntegrations(teamId)
  const stripe = Boolean(i.stripeSecretKey)
  const paypal = Boolean(i.paypalClientId && i.paypalSecret)
  const isConnected = (p) => (p === 'stripe' && stripe) || (p === 'paypal' && paypal)
  return {
    stripe: { connected: stripe, key: mask(i.stripeSecretKey), mode: i.stripeSecretKey?.includes('_test_') ? 'test' : stripe ? 'live' : null },
    paypal: { connected: paypal, clientId: mask(i.paypalClientId), mode: paypal ? (i.paypalEnv === 'sandbox' ? 'test' : 'live') : null },
    defaultProvider: [i.defaultProvider, 'stripe', 'paypal'].find(isConnected) ?? null,
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

// Client ID + Secret d'une app PayPal (developer.paypal.com → Apps &
// Credentials). Vérifiés auprès de PayPal, qui dit aussi s'ils sont Live ou
// Sandbox (test).
export async function savePaypalKeys(teamId, clientId, secret) {
  let id = String(clientId ?? '').trim()
  let key = String(secret ?? '').trim()
  // Les deux collés d'un coup dans le premier champ.
  if (!key && /\s/.test(id)) [id, key] = id.split(/\s+/)
  const format = /^[A-Za-z0-9_-]{20,128}$/
  if (!format.test(id) || !format.test(key ?? '')) {
    throw new PaymentError('Colle le Client ID et le Secret de ton app PayPal (developer.paypal.com → Apps & Credentials).')
  }
  const env = await detectPaypalEnv(id, key)
  if (!env) throw new PaymentError('PayPal refuse ces identifiants. Vérifie le Client ID et le Secret dans developer.paypal.com → Apps & Credentials.')
  const i = { ...getIntegrations(teamId), paypalClientId: id, paypalSecret: key, paypalEnv: env }
  delete i.zettleClientId
  delete i.zettleApiKey
  setSetting('integrations', i, teamId)
}

export function removeIntegration(teamId, provider) {
  const i = { ...getIntegrations(teamId) }
  if (provider === 'stripe') delete i.stripeSecretKey
  if (provider === 'paypal') {
    delete i.paypalClientId
    delete i.paypalSecret
    delete i.paypalEnv
  }
  setSetting('integrations', i, teamId)
}

export function setDefaultProvider(teamId, provider) {
  if (!['stripe', 'paypal'].includes(provider)) throw new PaymentError('Choix invalide.')
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

// ---------- Liens ----------

// baseUrl : adresse de l'app vue par l'admin (ex. https://app.intervia.info),
// pour le lien PayPal /payer/:id.
export async function createPaymentLink(teamId, userId, { amount, description, provider }, { baseUrl } = {}) {
  const value = Math.round(Number(amount) * 100) / 100
  const label = String(description ?? '').trim().slice(0, 200)
  if (!Number.isFinite(value) || value < 1) throw new PaymentError('Indique un montant d’au moins 1 €.')
  if (value > 50000) throw new PaymentError('Montant trop élevé.')
  if (!label) throw new PaymentError('Indique le motif du paiement.')

  const overview = integrationsOverview(teamId)
  const chosen = provider || overview.defaultProvider
  if (!chosen) throw new PaymentError('Ajoute d’abord ta clé Stripe ou PayPal dans Réglages → Intégrations.')
  const keys = getIntegrations(teamId)

  const id = uuid()
  let created
  try {
    if (chosen === 'stripe') {
      if (!keys.stripeSecretKey) throw new PaymentError('Stripe n’est pas relié.')
      created = await createStripeLink(keys.stripeSecretKey, { amount: value, description: label })
    } else if (chosen === 'paypal') {
      const pp = paypalKeys(teamId)
      if (!pp) throw new PaymentError('PayPal n’est pas relié.')
      if (!baseUrl) throw new PaymentError('Adresse de l’app inconnue, réessaie.')
      await checkPaypalKeys(pp).catch(() => {
        throw new PaymentError('PayPal refuse les identifiants enregistrés : mets-les à jour dans Réglages → Intégrations.')
      })
      // La commande PayPal est créée quand le client ouvre le lien (voir paypal.mjs).
      created = { url: `${baseUrl}/payer/${id}`, ref: null }
    } else {
      throw new PaymentError('Choix invalide.')
    }
  } catch (e) {
    if (e instanceof PaymentError) throw e
    console.log(`[paiement] création du lien échouée (${chosen}) : ${e.message}`)
    throw new PaymentError(`Le service de paiement a refusé la demande : ${String(e.message).slice(0, 160)}`)
  }

  db.prepare(
    `INSERT INTO payment_links (id, team_id, provider, amount, currency, description, url, provider_ref, status, created_by, created_at)
     VALUES (?, ?, ?, ?, 'EUR', ?, ?, ?, 'en_attente', ?, ?)`,
  ).run(id, teamId, chosen, value, label, created.url, created.ref, userId, now())
  return db.prepare('SELECT * FROM payment_links WHERE id = ?').get(id)
}

// Passe un lien « payé », une seule fois ; prévient l'admin si demandé (pas
// quand c'est l'admin lui-même qui regarde la liste).
export function markLinkPaid(link, { paidAt = null, ref = null, notify = false } = {}) {
  const r = db
    .prepare("UPDATE payment_links SET status = 'paye', paid_at = ?, provider_ref = COALESCE(?, provider_ref) WHERE id = ? AND status = 'en_attente'")
    .run(paidAt || now(), ref, link.id)
  if (!r.changes) return
  if (notify) notifyAdmin(link.team_id, 'paiement_recu', '💶 Paiement reçu', `${euro(link.amount)} · ${link.description}`, { payment_link_id: link.id })
  broadcast('payments_changed', {}, link.team_id)
}

// Liste des liens ; l'état « payé » des plus récents est revérifié chez le prestataire.
export async function listPaymentLinks(teamId) {
  const keys = getIntegrations(teamId)
  const pp = paypalKeys(teamId)
  const pending = db
    .prepare("SELECT * FROM payment_links WHERE team_id = ? AND status = 'en_attente' ORDER BY created_at DESC LIMIT 15")
    .all(teamId)
  await Promise.all(
    pending.map(async (l) => {
      try {
        if (l.provider === 'stripe' && keys.stripeSecretKey && l.provider_ref) {
          const paidAt = await stripeLinkPaid(keys.stripeSecretKey, l.provider_ref)
          if (paidAt) markLinkPaid(l, { paidAt })
        } else if (l.provider === 'paypal' && pp && l.provider_ref) {
          // Encaisse aussi une commande validée dont le client n'est pas revenu.
          const r = await settlePaypalOrder(pp, l, l.provider_ref)
          if (r.state === 'paid') markLinkPaid(l, { paidAt: r.paidAt })
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
