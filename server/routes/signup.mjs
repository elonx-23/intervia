import { Router } from 'express'

import { db, now, uuid } from '../db.mjs'
import { hashPassword, passwordError } from '../password.mjs'
import { sendMail } from '../mailer.mjs'
import { rateLimit } from '../rateLimit.mjs'

export const signupRouter = Router()

const VERIFICATION_TTL_HOURS = 24
const RESET_TTL_HOURS = 2

// Toutes ces routes envoient un email ou tentent un mot de passe — sans
// limite, elles permettent soit de spammer la boîte mail de quelqu'un
// (inscription/renvoi/mot de passe oublié répétés), soit de brute-forcer un
// mot de passe par email connu.
const emailActionLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 6 })
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
  return `
    <div style="font-family: -apple-system, Helvetica, Arial, sans-serif; color: #1e1e23; max-width: 480px; margin: 0 auto;">
      <p>Bienvenue sur Intervia !</p>
      <p>Confirme ton adresse email pour activer ton compte.</p>
      <p style="text-align: center; margin: 28px 0;">
        <a href="${link}" style="background: #2563eb; color: #ffffff; text-decoration: none; padding: 12px 28px; border-radius: 999px; font-weight: 600; display: inline-block;">Confirmer mon email</a>
      </p>
      <p style="color: #6b6b78; font-size: 12px; margin-top: 24px;">
        Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur :<br />
        <a href="${link}" style="color: #2563eb;">${link}</a>
      </p>
      <p>Ce lien expire dans 24h.</p>
    </div>`
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
    await sendMail({ to: email, subject: 'Confirme ton email — Intervia', html: verificationHtml(link) })
  } catch (e) {
    // Email non configuré en dev local : on ne bloque pas l'inscription,
    // le lien reste consultable dans les logs serveur pour continuer à tester.
    console.log(`[signup] email non envoyé (${e.message}) — lien de vérification : ${link}`)
  }
}

signupRouter.post('/', emailActionLimiter, async (req, res) => {
  const { email, password, firstName, lastName } = req.body ?? {}
  const cleanEmail = String(email ?? '').trim().toLowerCase()

  if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
    return res.status(400).json({ error: 'Adresse email invalide.' })
  }
  const pwError = passwordError(password)
  if (pwError) return res.status(400).json({ error: pwError })

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(cleanEmail)
  if (existing) return res.status(400).json({ error: 'Cet email est déjà utilisé.' })

  const userId = uuid()
  db.prepare(
    `INSERT INTO users (id, email, password_hash, role, team_id, technicien_id, first_name, last_name, active, created_at)
     VALUES (?, ?, ?, NULL, NULL, NULL, ?, ?, 1, ?)`,
  ).run(userId, cleanEmail, hashPassword(password), firstName ?? null, lastName ?? null, now())

  await sendVerificationEmail(req, userId, cleanEmail)

  res.json({ ok: true })
})

// Renvoie un lien de vérification frais — utile si le premier email a été
// perdu, ou pointait vers une adresse inaccessible (ex. lien localhost reçu
// avant le correctif ci-dessus). Réponse identique que le compte existe ou
// non, pour ne pas laisser deviner quels emails sont déjà inscrits.
signupRouter.post('/resend', emailActionLimiter, async (req, res) => {
  const cleanEmail = String(req.body?.email ?? '').trim().toLowerCase()
  const user = db.prepare('SELECT id, email_verified_at FROM users WHERE email = ?').get(cleanEmail)
  if (user && !user.email_verified_at) {
    await sendVerificationEmail(req, user.id, cleanEmail)
  }
  res.json({ ok: true })
})

signupRouter.get('/verify/:token', (req, res) => {
  const row = db.prepare('SELECT * FROM email_verifications WHERE token = ?').get(req.params.token)
  if (!row) return res.status(404).json({ error: 'Lien de vérification invalide.' })
  if (new Date(row.expires_at) < new Date()) {
    return res.status(400).json({ error: 'Ce lien a expiré, inscris-toi à nouveau.' })
  }

  db.prepare('UPDATE users SET email_verified_at = ? WHERE id = ?').run(now(), row.user_id)
  db.prepare('DELETE FROM email_verifications WHERE token = ?').run(row.token)

  res.json({ ok: true })
})

function resetPasswordHtml(link) {
  return `
    <div style="font-family: -apple-system, Helvetica, Arial, sans-serif; color: #1e1e23; max-width: 480px; margin: 0 auto;">
      <p>Une demande de réinitialisation de mot de passe a été faite pour ce compte Intervia.</p>
      <p style="text-align: center; margin: 28px 0;">
        <a href="${link}" style="background: #2563eb; color: #ffffff; text-decoration: none; padding: 12px 28px; border-radius: 999px; font-weight: 600; display: inline-block;">Choisir un nouveau mot de passe</a>
      </p>
      <p style="color: #6b6b78; font-size: 12px; margin-top: 24px;">
        Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur :<br />
        <a href="${link}" style="color: #2563eb;">${link}</a>
      </p>
      <p>Ce lien expire dans 2h. Si tu n'es pas à l'origine de cette demande, ignore cet email — ton mot de passe reste inchangé.</p>
    </div>`
}

// Réponse identique que le compte existe ou non, pour ne pas laisser
// deviner quels emails sont inscrits.
signupRouter.post('/forgot-password', emailActionLimiter, async (req, res) => {
  const cleanEmail = String(req.body?.email ?? '').trim().toLowerCase()
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
    try {
      await sendMail({ to: cleanEmail, subject: 'Réinitialise ton mot de passe — Intervia', html: resetPasswordHtml(link) })
    } catch (e) {
      console.log(`[signup] email de réinitialisation non envoyé (${e.message}) — lien : ${link}`)
    }
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
