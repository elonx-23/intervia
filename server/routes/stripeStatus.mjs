import { Router } from 'express'

import { requireAdmin, requireAuth } from '../auth.mjs'
import { getSetting } from '../db.mjs'
import { getStripe, isStripeConfigured, setStripeCredentials } from '../stripe.mjs'

export const stripeStatusRouter = Router()
stripeStatusRouter.use(requireAuth)

// Un technicien ne peut pas configurer Stripe (réservé à l'admin), mais doit
// quand même savoir si c'est déjà fait — sinon impossible de décider côté
// interface s'il faut proposer "Envoyer un lien de paiement" sur une
// facture. Volontairement minimal (juste un booléen) : le reste (compte
// Stripe, 4 derniers chiffres de la clé…) reste réservé à /status, admin
// uniquement.
stripeStatusRouter.get('/configured', (req, res) => {
  res.json({ configured: isStripeConfigured() })
})

// État de la connexion Stripe pour l'écran admin — jamais la clé elle-même,
// juste de quoi confirmer que ça fonctionne et à quel compte c'est relié.
stripeStatusRouter.get('/status', requireAdmin, async (req, res) => {
  if (!isStripeConfigured()) {
    return res.json({ configured: false })
  }

  const stripe = getStripe()
  const key = getSetting('stripe_secret_key') || process.env.STRIPE_SECRET_KEY || ''
  try {
    const account = await stripe.accounts.retrieve()
    res.json({
      configured: true,
      account_id: account.id,
      business_name: account.business_profile?.name ?? account.settings?.dashboard?.display_name ?? null,
      country: account.country,
      charges_enabled: account.charges_enabled,
      payouts_enabled: account.payouts_enabled,
      live_mode: key.includes('_live_'),
      key_last4: key.slice(-4),
      webhook_configured: Boolean(getSetting('stripe_webhook_secret') || process.env.STRIPE_WEBHOOK_SECRET),
    })
  } catch (e) {
    res.json({ configured: true, error: e.message ?? 'Impossible de contacter Stripe' })
  }
})

// Enregistre la clé secrète / le secret webhook depuis Réglages →
// Intégrations. Ni l'un ni l'autre ne sont jamais renvoyés en clair par la
// suite — seul /status expose un indicateur (4 derniers caractères, statut
// configuré ou non).
stripeStatusRouter.post('/credentials', requireAdmin, (req, res) => {
  const { secretKey, webhookSecret } = req.body ?? {}
  if (secretKey !== undefined && secretKey !== '' && !/^(sk|rk)_(live|test)_/.test(secretKey)) {
    return res.status(400).json({ error: 'Clé secrète Stripe invalide (doit commencer par sk_ ou rk_).' })
  }
  setStripeCredentials({
    secretKey: secretKey === '' ? null : secretKey,
    webhookSecret: webhookSecret === '' ? null : webhookSecret,
  })
  res.json({ ok: true })
})
