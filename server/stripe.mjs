import Stripe from 'stripe'

import { getSetting, setSetting } from './db.mjs'

// La clé peut venir de deux endroits : server/.env (configuration manuelle
// au démarrage) ou de la table "settings" (configurée depuis l'écran
// Réglages → Intégrations, sans avoir à toucher un fichier). Les réglages en
// base ont priorité — c'est la source la plus récente si l'admin l'a changée
// depuis l'app. Jamais exposée au frontend telle quelle.
let stripeClient = null
let cachedKey = null

function resolveKey() {
  return getSetting('stripe_secret_key') || process.env.STRIPE_SECRET_KEY || null
}

export function getStripe() {
  const key = resolveKey()
  if (!key) return null
  if (stripeClient && cachedKey === key) return stripeClient
  stripeClient = new Stripe(key)
  cachedKey = key
  return stripeClient
}

export function isStripeConfigured() {
  return Boolean(resolveKey())
}

export function getWebhookSecret() {
  return getSetting('stripe_webhook_secret') || process.env.STRIPE_WEBHOOK_SECRET || null
}

export function setStripeCredentials({ secretKey, webhookSecret }) {
  if (secretKey !== undefined) setSetting('stripe_secret_key', secretKey)
  if (webhookSecret !== undefined) setSetting('stripe_webhook_secret', webhookSecret)
  stripeClient = null
  cachedKey = null
}
