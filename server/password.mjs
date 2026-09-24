import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'

// scrypt (node:crypto natif) plutôt que bcrypt/argon2 : zéro dépendance
// supplémentaire, cohérent avec le reste du projet qui évite les libs
// externes quand le standard suffit.
const KEY_LENGTH = 64

// scrypt est délibérément coûteux en CPU (c'est tout son intérêt contre le
// brute-force hors-ligne) — mais ce coût grandit aussi avec la taille de
// l'entrée. Sans plafond, envoyer un "mot de passe" de plusieurs Mo à
// /api/auth/login-email force le serveur à hacher cette entrée géante à
// chaque tentative : un déni de service par CPU, même avec le rate-limiter
// déjà en place sur la route (qui limite le nombre de tentatives, pas leur
// coût individuel). Aucun mot de passe réel ne dépasse 200 caractères.
const MAX_PASSWORD_LENGTH = 200

export function hashPassword(plain) {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(String(plain).slice(0, MAX_PASSWORD_LENGTH), salt, KEY_LENGTH).toString('hex')
  return `${salt}:${hash}`
}

export function verifyPassword(plain, stored) {
  const [salt, hash] = stored.split(':')
  if (!salt || !hash) return false
  if (typeof plain !== 'string' || plain.length > MAX_PASSWORD_LENGTH) return false
  const candidate = scryptSync(plain, salt, KEY_LENGTH)
  const expected = Buffer.from(hash, 'hex')
  if (candidate.length !== expected.length) return false
  return timingSafeEqual(candidate, expected)
}

// Règles demandées : 6 caractères minimum, au moins une majuscule, au moins
// un caractère spécial. Utilisée à l'inscription côté serveur (source de
// vérité) — le frontend applique la même règle pour un retour immédiat.
export function passwordError(plain) {
  if (!plain || plain.length < 6) return 'Le mot de passe doit contenir au moins 6 caractères.'
  if (plain.length > MAX_PASSWORD_LENGTH) return `Le mot de passe ne peut pas dépasser ${MAX_PASSWORD_LENGTH} caractères.`
  if (!/[A-Z]/.test(plain)) return 'Le mot de passe doit contenir au moins une majuscule.'
  if (!/[^A-Za-z0-9]/.test(plain)) return 'Le mot de passe doit contenir au moins un caractère spécial (@, &, …).'
  return null
}
