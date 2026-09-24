import { Router } from 'express'
import express from 'express'

import { db, now } from '../db.mjs'
import { getStripe, getWebhookSecret } from '../stripe.mjs'
import { notifyAdmin } from '../notify.mjs'

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
    // Les métadonnées d'un Payment Link sont censées se retrouver sur la
    // session générée automatiquement quand un client le complète, mais on
    // ne dépend pas uniquement de ça : si jamais ce n'était pas le cas,
    // `session.payment_link` (toujours présent pour un paiement passé par
    // ce biais) permet de retrouver la facture directement via l'id du
    // Payment Link qu'on a nous-mêmes enregistré dessus à sa création.
    const documentId =
      session.metadata?.document_id ??
      (session.payment_link
        ? db.prepare("SELECT id FROM documents WHERE stripe_payment_link_id = ? AND kind = 'facture'").get(session.payment_link)?.id
        : undefined)

    if (documentId) {
      const doc = db.prepare("SELECT * FROM documents WHERE id = ? AND kind = 'facture'").get(documentId)
      // Idempotent : un webhook Stripe peut être livré plusieurs fois pour le
      // même événement — on ne réapplique rien si déjà marquée payée.
      if (doc && doc.status !== 'payee') {
        db.prepare(
          "UPDATE documents SET status='payee', paid_at=?, payment_method='Stripe (paiement en ligne)', stripe_payment_id=? WHERE id=?",
        ).run(now(), session.payment_intent ?? session.id, documentId)
        notifyAdmin(
          doc.team_id,
          'facture_payee_stripe',
          'Facture payée en ligne',
          `Facture ${doc.number} payée via Stripe — ${(session.amount_total / 100).toFixed(2)} €`,
          { document_id: documentId },
        )

        // Le paiement via Payment Link est fait — le désactiver pour qu'il
        // ne puisse plus être réutilisé (relancer un paiement pour une
        // facture déjà payée) une fois scanné/payé une première fois.
        if (doc.stripe_payment_link_id) {
          try {
            await stripe.paymentLinks.update(doc.stripe_payment_link_id, { active: false })
          } catch {
            // pas bloquant pour la confirmation du paiement lui-même
          }
        }
      }
    } else if (teamId) {
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
