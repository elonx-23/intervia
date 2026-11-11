import { Router } from 'express'

import { db, now, uuid } from '../db.mjs'
import { hashPassword, passwordError } from '../password.mjs'
import { sendMail } from '../mailer.mjs'
import { rateLimit } from '../rateLimit.mjs'
import { wrapEmail, ctaButton, fallbackLink } from '../emailTemplates.mjs'
import { JoinError, joinTeamByCode, normalizeJoinCode } from '../teamJoin.mjs'
import { sessionPayloadForUser } from '../auth.mjs'
import { recordNewSession } from '../deviceSessions.mjs'
import { SESSION_TTL_DAYS } from './auth.mjs'

export const signupRouter = Router()

const VERIFICATION_TTL_HOURS = 24
const RESET_TTL_HOURS = 2

// Toutes ces routes envoient un email ou tentent un mot de passe — sans
// limite, elles permettent soit de spammer la boîte mail de quelqu'un
// (inscription/renvoi/mot de passe oublié répétés), soit de brute-forcer un
// mot de passe par email connu.
// Par appareil : un patron qui inscrit ses techniciens depuis le même wifi
// ne doit pas être bloqué au bout de quelques comptes.
const emailActionLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 20 })
const passwordAttemptLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 15 })

// L'adresse pour accéder à l'app change selon comment on y accède (réseau
// local, tunnel Cloudflare à domaine aléatoire, futur domaine de prod) — un
// PUBLIC_URL fixe dans .env finit toujours par se désynchroniser. On préfère
// l'origine réelle de la requête du navigateur (fiable sur un POST, envoyée
// par le fetch qui a appelé cette route), PUBLIC_URL n'est plus qu'un filet
// de secours pour un appel fait hors navigateur (ex. script, tâche cron).
function publicUrlFor(req) {
  return req.get('origin') ?? process.env.PUBLIC_URL ?? 'http://localhost:5173'
}

function verificationHtml(link) {
  return wrapEmail({
    preheader: 'Confirme ton adresse email pour activer ton compte Intervia.',
    bodyHtml: `
      <p>Bienvenue sur Intervia !</p>
      <p>Confirme ton adresse email pour activer ton compte.</p>
      ${ctaButton('Confirmer mon email', link)}
      ${fallbackLink(link)}
      <p style="color: #6b6b78; font-size: 12px;">Ce lien expire dans 24h.</p>`,
  })
}

async function sendVerificationEmail(req, userId, email) {
  // Un seul lien valide à la fois : les précédents (ex. envoyés avant un
  // correctif de l'adresse, ou un renvoi demandé) ne doivent plus marcher.
  db.prepare('DELETE FROM email_verifications WHERE user_id = ?').run(userId)

  const token = uuid()
  const expiresAt = new Date(Date.now() + VERIFICATION_TTL_HOURS * 60 * 60 * 1000).toISOString()
  db.prepare('INSERT INTO email_verifications (token, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)').run(
    token,
    userId,
    expiresAt,
    now(),
  )

  const link = `${publicUrlFor(req)}/verifier-email/${token}`
  try {
    await sendMail({
      to: email,
      subject: 'Confirme ton email — Intervia',
      html: verificationHtml(link),
      // Version texte : un email sans elle part plus souvent en indésirables.
      text: `Bienvenue sur Intervia !\n\nConfirme ton adresse email pour activer ton compte : ${link}\n\nCe lien expire dans 24 h.`,
    })
  } catch (e) {
    // Email non configuré en dev local : on ne bloque pas l'inscription,
    // le lien reste consultable dans les logs serveur pour continuer à tester.
    console.log(`[signup] email non envoyé (${e.message}) — lien de vérification : ${link}`)
  }
}

signupRouter.post('/', emailActionLimiter, async (req, res) => {
  const { email, password, firstName, lastName, joinCode } = req.body ?? {}
  const cleanEmail = String(email ?? '')
    .trim()
    .toLowerCase()

  if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
    return res.status(400).json({ error: 'Adresse email invalide.' })
  }
  const pwError = passwordError(password)
  if (pwError) return res.status(400).json({ error: pwError })

  // Code d'équipe du lien d'invitation du patron.
  const pendingJoinCode = normalizeJoinCode(joinCode) || null
  const existing = db.prepare('SELECT * FROM users WHERE email = ?').get(cleanEmail)
  if (existing?.email_verified_at) {
    return res
      .status(400)
      .json({ error: 'Un compte existe déjà avec cet email : connecte-toi (ou utilise « Mot de passe oublié »).', code: 'exists' })
  }

  let userId
  if (existing) {
    // Inscription refaite avant d'avoir confirmé l'email (email jamais reçu,
    // faute corrigée…) : on met le compte à jour au lieu de bloquer.
    userId = existing.id
    db.prepare(
      'UPDATE users SET password_hash = ?, first_name = ?, last_name = ?, pending_join_code = COALESCE(?, pending_join_code) WHERE id = ?',
    ).run(hashPassword(password), firstName ?? null, lastName ?? null, pendingJoinCode, userId)
  } else {
    userId = uuid()
    db.prepare(
      `INSERT INTO users (id, email, password_hash, role, team_id, technicien_id, first_name, last_name, active, created_at, pending_join_code)
       VALUES (?, ?, ?, NULL, NULL, NULL, ?, ?, 1, ?, ?)`,
    ).run(userId, cleanEmail, hashPassword(password), firstName ?? null, lastName ?? null, now(), pendingJoinCode)
  }

  // Technicien invité par son patron (lien avec un code d'équipe valide) :
  // pas d'email de confirmation à attendre, il entre tout de suite dans
  // l'équipe, connecté. C'est le code de l'équipe qui donne l'accès.
  if (pendingJoinCode) {
    try {
      const { user, team } = joinTeamByCode(db.prepare('SELECT * FROM users WHERE id = ?').get(userId), pendingJoinCode)
      db.prepare('UPDATE users SET email_verified_at = COALESCE(email_verified_at, ?) WHERE id = ?').run(now(), userId)
      const sessionId = uuid()
      db.prepare('INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)').run(
        sessionId,
        userId,
        new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString(),
        now(),
      )
      recordNewSession(sessionId, user, req)
      return res.json({
        ok: true,
        team: team.name,
        session: sessionPayloadForUser(db.prepare('SELECT * FROM users WHERE id = ?').get(userId), sessionId),
      })
    } catch (e) {
      if (!(e instanceof JoinError)) throw e
      // Code refusé (faute, équipe complète) : parcours normal par email.
    }
  }

  // Ne jamais attendre l'envoi ici — un SMTP lent ou temporairement
  // injoignable (déjà vu depuis un serveur distant, cf. Gmail qui peut
  // ralentir/bloquer une IP inconnue) bloquerait toute la requête de
  // création de compte, laissant l'écran d'inscription tourner dans le vide
  // alors que le compte est en réalité déjà créé. sendVerificationEmail a
  // déjà son propre try/catch qui journalise l'échec sans jamais lever.
  sendVerificationEmail(req, userId, cleanEmail)

  res.json({ ok: true, resent: Boolean(existing) })
})

// Renvoie un lien de vérification frais — utile si le premier email a été
// perdu, ou pointait vers une adresse inaccessible (ex. lien localhost reçu
// avant le correctif ci-dessus). Réponse identique que le compte existe ou
// non, pour ne pas laisser deviner quels emails sont déjà inscrits.
signupRouter.post('/resend', emailActionLimiter, async (req, res) => {
  const cleanEmail = String(req.body?.email ?? '')
    .trim()
    .toLowerCase()
  const user = db.prepare('SELECT id, email_verified_at FROM users WHERE email = ?').get(cleanEmail)
  if (user && !user.email_verified_at) {
    sendVerificationEmail(req, user.id, cleanEmail)
  }
  res.json({ ok: true })
})

signupRouter.get('/verify/:token', (req, res) => {
  const row = db.prepare('SELECT * FROM email_verifications WHERE token = ?').get(req.params.token)
  if (!row) return res.status(404).json({ error: 'Lien de vérification invalide.' })
  if (new Date(row.expires_at) < new Date()) {
    return res.status(400).json({ error: 'Ce lien a expiré, inscris-toi à nouveau.' })
  }

  // Le lien reste valable jusqu'à son expiration : rouvert une seconde fois
  // (double appui, application mail qui recharge), il ne doit pas afficher
  // « lien invalide » alors que le compte est bien confirmé.
  db.prepare('UPDATE users SET email_verified_at = COALESCE(email_verified_at, ?) WHERE id = ?').run(now(), row.user_id)

  // Inscrit avec le lien d'invitation : il rejoint l'équipe tout de suite.
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(row.user_id)
  if (user?.pending_join_code && !user.role) {
    try {
      const { team } = joinTeamByCode(user, user.pending_join_code)
      return res.json({ ok: true, team: team.name })
    } catch (e) {
      if (!(e instanceof JoinError)) throw e
      return res.json({ ok: true, joinError: e.message })
    }
  }
  res.json({
    ok: true,
    team: user?.role === 'technicien' ? (db.prepare('SELECT name FROM teams WHERE id = ?').get(user.team_id)?.name ?? null) : null,
  })
})

function resetPasswordHtml(link) {
  return wrapEmail({
    preheader: 'Réinitialise ton mot de passe Intervia.',
    bodyHtml: `
      <p>Une demande de réinitialisation de mot de passe a été faite pour ce compte Intervia.</p>
      ${ctaButton('Choisir un nouveau mot de passe', link)}
      ${fallbackLink(link)}
      <p style="color: #6b6b78; font-size: 12px;">Ce lien expire dans 2h. Si tu n'es pas à l'origine de cette demande, ignore cet email — ton mot de passe reste inchangé.</p>`,
  })
}

// Réponse identique que le compte existe ou non, pour ne pas laisser
// deviner quels emails sont inscrits.
signupRouter.post('/forgot-password', emailActionLimiter, async (req, res) => {
  const cleanEmail = String(req.body?.email ?? '')
    .trim()
    .toLowerCase()
  const user = db.prepare('SELECT id FROM users WHERE email = ?').get(cleanEmail)

  if (user) {
    db.prepare('DELETE FROM password_resets WHERE user_id = ?').run(user.id)
    const token = uuid()
    const expiresAt = new Date(Date.now() + RESET_TTL_HOURS * 60 * 60 * 1000).toISOString()
    db.prepare('INSERT INTO password_resets (token, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)').run(
      token,
      user.id,
      expiresAt,
      now(),
    )

    const link = `${publicUrlFor(req)}/reinitialiser-mot-de-passe/${token}`
    // Même raison qu'à l'inscription (voir sendVerificationEmail) : ne
    // jamais laisser un SMTP lent bloquer la réponse HTTP.
    sendMail({ to: cleanEmail, subject: 'Réinitialise ton mot de passe — Intervia', html: resetPasswordHtml(link) }).catch((e) =>
      console.log(`[signup] email de réinitialisation non envoyé (${e.message}) — lien : ${link}`),
    )
  }

  res.json({ ok: true })
})

signupRouter.post('/reset-password', passwordAttemptLimiter, (req, res) => {
  const { token, password } = req.body ?? {}
  const row = db.prepare('SELECT * FROM password_resets WHERE token = ?').get(token)
  if (!row) return res.status(404).json({ error: 'Lien de réinitialisation invalide.' })
  if (new Date(row.expires_at) < new Date()) {
    return res.status(400).json({ error: 'Ce lien a expiré, refais une demande.' })
  }

  const pwError = passwordError(password)
  if (pwError) return res.status(400).json({ error: pwError })

  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(password), row.user_id)
  db.prepare('DELETE FROM password_resets WHERE token = ?').run(row.token)
  // Un mot de passe qui change invalide toutes les sessions existantes — au
  // cas où c'est justement une session volée qui a motivé la réinitialisation.
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(row.user_id)

  res.json({ ok: true })
})
