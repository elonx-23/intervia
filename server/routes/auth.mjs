import { Router } from 'express'

import { db, logLoginAttempt, now, uuid } from '../db.mjs'
import { getCaller, requireAdmin, requireAuth, sessionPayloadForUser } from '../auth.mjs'
import { verifyPassword } from '../password.mjs'
import { rateLimit } from '../rateLimit.mjs'

export const authRouter = Router()

export const SESSION_TTL_DAYS = 30

// Comptée par IP : empêche le brute-force du mot de passe sur un compte
// connu.
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 15 })

authRouter.post('/login-email', loginLimiter, (req, res) => {
  const { email, password } = req.body ?? {}
  if (!email || !password) return res.status(400).json({ error: 'Identifiants invalides.' })
  const cleanEmail = String(email).trim().toLowerCase()

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(cleanEmail)
  if (!user || !verifyPassword(password, user.password_hash)) {
    logLoginAttempt(cleanEmail, 'email', false, req.ip)
    return res.status(401).json({ error: 'Identifiants invalides.' })
  }
  if (!user.active) return res.status(403).json({ error: 'Compte désactivé.' })
  if (!user.email_verified_at) {
    return res.status(403).json({ error: 'Vérifie ton adresse email avant de te connecter (lien envoyé à l’inscription).' })
  }

  logLoginAttempt(cleanEmail, 'email', true, req.ip)

  const sessionId = uuid()
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString()
  db.prepare('INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)').run(
    sessionId,
    user.id,
    expiresAt,
    now(),
  )

  res.json(sessionPayloadForUser(user, sessionId))
})

// Visibilité sur les tentatives de connexion — sans ça, une vague de mots de
// passe essayés en boucle (bloquée par le rate-limiter mais invisible
// autrement) ne serait jamais remarquée par personne. Pas de filtre par
// équipe : les tentatives de connexion (surtout les échecs) ne sont pas
// rattachables à une équipe avant qu'elles ne réussissent, ça reste une vue
// admin globale volontairement — n'importe quel admin peut voir si SON
// serveur est visé.
authRouter.get('/security/login-attempts', requireAuth, requireAdmin, (req, res) => {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const recentFailures = db
    .prepare('SELECT identifier, method, ip, created_at FROM login_attempts WHERE success = 0 AND created_at >= ? ORDER BY created_at DESC LIMIT 100')
    .all(since)
  const failuresLast24h = db
    .prepare("SELECT COUNT(*) AS c FROM login_attempts WHERE success = 0 AND created_at >= datetime('now', '-24 hours')")
    .get().c
  res.json({ failuresLast24h, recentFailures })
})

authRouter.get('/session/active', (req, res) => {
  const sessionId = req.header('x-session-id')
  const caller = getCaller(sessionId)
  if (!caller) return res.json({ active: false, teamSuspended: false })

  let teamSuspended = false
  if (caller.team_id) {
    const team = db.prepare('SELECT status FROM teams WHERE id = ?').get(caller.team_id)
    teamSuspended = team?.status === 'suspended'
  }
  res.json({ active: true, teamSuspended })
})

authRouter.get('/me', requireAuth, (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.caller.user_id)
  res.json(sessionPayloadForUser(user, req.sessionId))
})

// Modifie les coordonnées du compte connecté (pas l'email/mot de passe,
// gérés ailleurs).
authRouter.patch('/me', requireAuth, (req, res) => {
  const { firstName, lastName, phone } = req.body ?? {}

  db.prepare('UPDATE users SET first_name = ?, last_name = ? WHERE id = ?').run(
    firstName ?? null,
    lastName ?? null,
    req.caller.user_id,
  )
  if (req.caller.role === 'technicien' && req.caller.technicien_id) {
    db.prepare('UPDATE technicians SET first_name = ?, last_name = ?, phone = ? WHERE id = ?').run(
      firstName ?? '',
      lastName ?? '',
      phone ?? null,
      req.caller.technicien_id,
    )
  }
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.caller.user_id)
  res.json(sessionPayloadForUser(user, req.sessionId))
})
