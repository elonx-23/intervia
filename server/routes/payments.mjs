import { Router } from 'express'

import { requireAdmin, requireAuth } from '../auth.mjs'
import {
  PaymentError,
  cancelPaymentLink,
  createPaymentLink,
  integrationsOverview,
  listPaymentLinks,
  removeIntegration,
  saveStripeKey,
  saveZettleKeys,
  setDefaultProvider,
} from '../paymentLinks.mjs'

// Réglages → Intégrations (clés de paiement) et page « Lien de paiement ».
export const paymentsRouter = Router()
paymentsRouter.use(requireAuth, requireAdmin)

function fail(res, e) {
  if (e instanceof PaymentError) return res.status(400).json({ error: e.message })
  console.log(`[paiement] ${e.message}`)
  res.status(502).json({ error: 'Erreur, réessaie dans un instant.' })
}

const wrap = (fn) => async (req, res) => {
  try {
    await fn(req, res)
  } catch (e) {
    fail(res, e)
  }
}

paymentsRouter.get('/integrations', (req, res) => res.json(integrationsOverview(req.caller.team_id)))

paymentsRouter.put(
  '/integrations/stripe',
  wrap(async (req, res) => {
    await saveStripeKey(req.caller.team_id, req.body?.secretKey)
    res.json(integrationsOverview(req.caller.team_id))
  }),
)

paymentsRouter.put(
  '/integrations/zettle',
  wrap(async (req, res) => {
    await saveZettleKeys(req.caller.team_id, req.body?.clientId, req.body?.apiKey)
    res.json(integrationsOverview(req.caller.team_id))
  }),
)

paymentsRouter.delete('/integrations/:provider', (req, res) => {
  removeIntegration(req.caller.team_id, req.params.provider)
  res.json(integrationsOverview(req.caller.team_id))
})

paymentsRouter.put(
  '/integrations/default',
  wrap(async (req, res) => {
    setDefaultProvider(req.caller.team_id, req.body?.provider)
    res.json(integrationsOverview(req.caller.team_id))
  }),
)

paymentsRouter.get(
  '/links',
  wrap(async (req, res) => res.json(await listPaymentLinks(req.caller.team_id))),
)

paymentsRouter.post(
  '/links',
  wrap(async (req, res) => res.json(await createPaymentLink(req.caller.team_id, req.caller.user_id, req.body ?? {}))),
)

paymentsRouter.post(
  '/links/:id/cancel',
  wrap(async (req, res) => {
    cancelPaymentLink(req.caller.team_id, req.params.id)
    res.json({ ok: true })
  }),
)
