import { Router } from 'express'
import express from 'express'

import { db } from '../db.mjs'
import { getStripe, getWebhookSecret } from '../stripe.mjs'

export const stripeWebhookRouter = Router()

// Corps brut requis pour la vérification de signature Stripe — cette route
// doit être montée AVANT express.json() dans index.mjs, sinon le corps est
// déjà parsé en JSON et la vérification de signature échoue.
stripeWebhookRouter.post('/', express.raw({ type: 'application/json' }), async (req, res) => {
  const stripe = getStripe()
  const secret = getWebhookSecret()
  if (!stripe || !secret) {
    return res.status(400).json({ error: 'Webhook Stripe non configuré' })
  }

  let event
  try {
    event = stripe.webhooks.constructEvent(req.body, req.headers['stripe-signature'], secret)
  } catch (e) {
    return res.status(400).json({ error: `Signature invalide : ${e.message}` })
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object
    const teamId = session.metadata?.team_id

    if (teamId) {
      // Abonnement de création d'équipe (Solo/Société) — l'équipe passe
      // 'active' et le compte à l'origine du paiement devient admin de
      // cette équipe. Idempotent (statut déjà 'active' → no-op).
      const team = db.prepare('SELECT * FROM teams WHERE id = ?').get(teamId)
      const userId = session.metadata?.user_id
      if (team && team.status !== 'active') {
        db.prepare(
          "UPDATE teams SET status='active', stripe_customer_id=?, stripe_subscription_id=? WHERE id=?",
        ).run(session.customer, session.subscription, teamId)
        if (userId) {
          db.prepare("UPDATE users SET role='admin', team_id=? WHERE id=? AND role IS NULL").run(teamId, userId)
        }
      }
    }
  }

  // Cycle de vie de l'abonnement après activation : carte refusée à un
  // renouvellement, ou résiliation — l'équipe est bloquée jusqu'à
  // régularisation (les données restent intactes, juste l'accès coupé).
  if (event.type === 'invoice.payment_failed' || event.type === 'customer.subscription.deleted') {
    const obj = event.data.object
    const subscriptionId = event.type === 'invoice.payment_failed' ? obj.subscription : obj.id
    if (subscriptionId) {
      db.prepare("UPDATE teams SET status='suspended' WHERE stripe_subscription_id=?").run(subscriptionId)
    }
  }

  res.json({ received: true })
})
