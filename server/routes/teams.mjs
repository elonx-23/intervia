import { Router } from 'express'

import { db, getSetting, now, randomJoinCode, uuid } from '../db.mjs'
import { requireAdmin, requireAuth, sessionPayloadForUser } from '../auth.mjs'
import { getStripe, isStripeConfigured } from '../stripe.mjs'
import { rateLimit } from '../rateLimit.mjs'
import { JoinError, joinTeamByCode, usedTechnicienSeats } from '../teamJoin.mjs'

export const teamsRouter = Router()
teamsRouter.use(requireAuth)

// /create n'attache le compte à l'équipe qu'au retour du webhook Stripe
// (checkout.session.completed) — tant que le paiement n'a pas abouti,
// requireFreshAccount reste vrai indéfiniment. Sans limite, un même compte
// "frais" pouvait donc appeler /create en boucle : une ligne `teams` réelle
// (avec un vrai join_code) et un vrai appel à l'API Stripe à chaque fois,
// jamais payés. /join n'a pas cette faille précise (rejoindre ne crée rien
// de coûteux), mais reste limité pour la même prudence.
const createTeamLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 5 })
const joinTeamLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 20 })

// L'adresse pour accéder à l'app change selon comment on y accède (réseau
// local, tunnel Cloudflare à domaine aléatoire, futur domaine de prod) — un
// PUBLIC_URL fixe dans .env finit toujours par se désynchroniser. On préfère
// l'origine réelle de la requête du navigateur (fiable sur un POST), pour que
// Stripe redirige vers l'adresse effectivement utilisée pour payer.
function publicUrlFor(req) {
  return req.get('origin') ?? process.env.PUBLIC_URL ?? 'http://localhost:5173'
}

// Prix récurrents (centimes) des formules payantes — la formule "rejoindre
// une équipe" (technicien) reste gratuite, aucun passage par Stripe.
const PLAN_PRICING = {
  solo: { label: 'Solo', amount: 2990, maxTechnicienSeats: 0 },
  entreprise: { label: 'Société', amount: 5990, maxTechnicienSeats: 2 },
  entreprise_plus: { label: 'Société+', amount: 14990, maxTechnicienSeats: 10 },
  // Pas de vraie colonne "illimité" en base (INTEGER NOT NULL) — un plafond
  // très haut fait l'affaire en pratique, sans complexifier le schéma.
  ultra: { label: 'Ultra', amount: 25990, maxTechnicienSeats: 999999 },
}

// Créer une équipe (payant, rôle admin) n'a de sens que pour un compte tout
// juste vérifié, pas encore rattaché à une équipe — un compte déjà admin ou
// déjà technicien quelque part n'a rien à faire sur /create. Rejoindre une
// équipe (/join), en revanche, reste ouvert à un technicien déjà membre
// d'autres équipes (freelance multi-entreprises) — seul le rôle admin en
// est exclu, voir /join.
function requireFreshAccount(req, res) {
  if (!req.caller.user_id) {
    res.status(400).json({ error: 'Fonction réservée aux nouveaux comptes.' })
    return false
  }
  if (req.caller.role) {
    res.status(400).json({ error: 'Ce compte est déjà rattaché à une équipe.' })
    return false
  }
  return true
}

// Infos de l'équipe du connecté — sert à afficher le code d'invitation dans
// Réglages → Techniciens, pour que les techniciens s'inscrivent eux-mêmes
// (nouveau système) au lieu que l'admin leur crée un compte à la main.
teamsRouter.get('/me', requireAdmin, (req, res) => {
  const team = db.prepare('SELECT * FROM teams WHERE id = ?').get(req.caller.team_id)
  if (!team) return res.status(404).json({ error: 'Équipe introuvable.' })
  res.json({
    name: team.name,
    plan: team.plan,
    joinCode: team.join_code,
    logoUrl: getSetting('company', team.id)?.logoUrl || null,
    maxTechnicienSeats: team.max_technicien_seats,
    usedTechnicienSeats: usedTechnicienSeats(team.id),
  })
})

// Rejoindre une équipe : ouvert à un compte tout juste vérifié (premier
// rattachement) COMME à un technicien déjà membre d'une ou plusieurs autres
// équipes (freelance qui travaille pour plusieurs entreprises de dépannage)
// — seul un compte admin (déjà propriétaire de sa propre équipe) en est
// exclu. Rejoindre une équipe déjà membre bascule simplement dessus
// (aucune erreur, aucun doublon) plutôt que d'échouer.
teamsRouter.post('/join', joinTeamLimiter, (req, res) => {
  if (!req.caller.user_id) return res.status(400).json({ error: 'Fonction réservée aux comptes email/mot de passe.' })
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.caller.user_id)
  try {
    const { user: updated } = joinTeamByCode(user, req.body?.joinCode)
    res.json(sessionPayloadForUser(updated, req.sessionId))
  } catch (e) {
    if (e instanceof JoinError) return res.status(e.status).json({ error: e.message })
    throw e
  }
})

// Liste des équipes qu'un technicien a rejointes, avec laquelle est
// actuellement active — alimente le sélecteur d'équipe dans Réglages. Rien
// ici ne révèle les données INTERNES d'une équipe (interventions, clients…),
// juste son nom : l'utilisateur sait déjà qu'il en est membre.
teamsRouter.get('/memberships', (req, res) => {
  if (!req.caller.user_id || req.caller.role !== 'technicien') return res.json([])

  const rows = db
    .prepare(
      `SELECT t.id AS team_id, t.name, t.plan
       FROM team_memberships m
       JOIN teams t ON t.id = m.team_id
       WHERE m.user_id = ?
       ORDER BY t.name COLLATE NOCASE`,
    )
    .all(req.caller.user_id)

  // Le logo n'est pas sensible (c'est de l'image de marque, pas une donnée
  // client) — même trust boundary que le nom, déjà visible ici uniquement
  // pour les équipes dont l'utilisateur est réellement membre.
  res.json(
    rows.map((r) => ({
      teamId: r.team_id,
      name: r.name,
      plan: r.plan,
      logoUrl: getSetting('company', r.team_id)?.logoUrl || null,
      active: r.team_id === req.caller.team_id,
    })),
  )
})

// Bascule vers une équipe déjà rejointe (pas de code à retaper) — le compte
// doit déjà avoir une adhésion, sinon c'est /join qu'il faut appeler.
teamsRouter.post('/switch', (req, res) => {
  if (!req.caller.user_id || req.caller.role !== 'technicien') {
    return res.status(400).json({ error: 'Fonction réservée aux comptes technicien.' })
  }
  const { teamId } = req.body ?? {}
  const membership = db
    .prepare('SELECT * FROM team_memberships WHERE user_id = ? AND team_id = ?')
    .get(req.caller.user_id, teamId)
  if (!membership) return res.status(404).json({ error: "Tu n'es pas membre de cette équipe." })

  db.prepare('UPDATE users SET team_id = ?, technicien_id = ? WHERE id = ?').run(
    membership.team_id,
    membership.technicien_id,
    req.caller.user_id,
  )

  const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(req.caller.user_id)
  res.json(sessionPayloadForUser(updated, req.sessionId))
})

// Crée l'équipe tout de suite (statut 'pending') puis renvoie l'URL Stripe
// Checkout — l'équipe ne passe 'active' (et le compte n'est rattaché en
// admin) qu'à la confirmation du webhook, jamais à cet appel (voir
// stripeWebhook.mjs).
teamsRouter.post('/create', createTeamLimiter, async (req, res) => {
  if (!requireFreshAccount(req, res)) return
  const { name, plan, contactEmail, contactPhone, siret } = req.body ?? {}
  const pricing = PLAN_PRICING[plan]
  if (!pricing) return res.status(400).json({ error: 'Formule invalide.' })
  if (!name || !String(name).trim()) return res.status(400).json({ error: "Nom d'entreprise requis." })
  if (!contactPhone || !String(contactPhone).trim()) {
    return res.status(400).json({ error: 'Téléphone de contact requis.' })
  }

  const stripe = getStripe()
  if (!isStripeConfigured() || !stripe) {
    return res.status(400).json({ error: 'Paiement indisponible pour le moment, réessaie plus tard.' })
  }

  const teamId = uuid()
  db.prepare(
    `INSERT INTO teams (id, name, plan, join_code, status, max_technicien_seats, contact_email, contact_phone, siret, created_at)
     VALUES (?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?)`,
  ).run(
    teamId,
    String(name).trim(),
    plan,
    randomJoinCode(),
    pricing.maxTechnicienSeats,
    contactEmail ? String(contactEmail).trim() : null,
    String(contactPhone).trim(),
    siret ? String(siret).trim() : null,
    now(),
  )

  try {
    const checkout = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'eur',
            unit_amount: pricing.amount,
            recurring: { interval: 'month' },
            product_data: { name: `Intervia — Formule ${pricing.label}` },
          },
          quantity: 1,
        },
      ],
      metadata: { team_id: teamId, user_id: req.caller.user_id },
      success_url: `${publicUrlFor(req)}/equipe/paiement?statut=succes`,
      cancel_url: `${publicUrlFor(req)}/equipe/paiement?statut=annule`,
    })
    res.json({ url: checkout.url })
  } catch (e) {
    // Le paiement n'a jamais démarré — pas la peine de laisser une équipe
    // 'pending' orpheline en base.
    db.prepare('DELETE FROM teams WHERE id = ?').run(teamId)
    res.status(500).json({ error: e.message ?? 'Erreur Stripe' })
  }
})
