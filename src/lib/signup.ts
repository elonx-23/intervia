import { apiFetch } from '@/lib/api'

export function signup(email: string, password: string, firstName: string, lastName: string, joinCode?: string | null) {
  return apiFetch<{ ok: true }>('/api/signup', {
    method: 'POST',
    body: { email, password, firstName, lastName, joinCode: joinCode || undefined },
  })
}

// team : équipe rejointe automatiquement (inscription par lien d'invitation).
export function verifyEmail(token: string) {
  return apiFetch<{ ok: true; team?: string | null; joinError?: string }>(`/api/signup/verify/${encodeURIComponent(token)}`)
}

// Code d'équipe reçu par lien d'invitation, gardé le temps de l'inscription.
const JOIN_CODE_KEY = 'pse_join_code'
export const normalizeJoinCode = (v: string | null | undefined) =>
  String(v ?? '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 20)
export function rememberJoinCode(code: string) {
  try {
    localStorage.setItem(JOIN_CODE_KEY, code)
  } catch {
    // stockage indisponible : le code reste gardé avec le compte côté serveur
  }
}
export function rememberedJoinCode() {
  try {
    return normalizeJoinCode(localStorage.getItem(JOIN_CODE_KEY))
  } catch {
    return ''
  }
}
export function forgetJoinCode() {
  try {
    localStorage.removeItem(JOIN_CODE_KEY)
  } catch {
    // rien à faire
  }
}

export function resendVerificationEmail(email: string) {
  return apiFetch<{ ok: true }>('/api/signup/resend', { method: 'POST', body: { email } })
}

export function forgotPassword(email: string) {
  return apiFetch<{ ok: true }>('/api/signup/forgot-password', { method: 'POST', body: { email } })
}

export function resetPassword(token: string, password: string) {
  return apiFetch<{ ok: true }>('/api/signup/reset-password', { method: 'POST', body: { token, password } })
}

// Mêmes règles que server/password.mjs::passwordError — retour immédiat
// côté client, le serveur reste la source de vérité.
export function passwordError(password: string): string | null {
  if (!password || password.length < 6) return 'Le mot de passe doit contenir au moins 6 caractères.'
  if (!/[A-Z]/.test(password)) return 'Le mot de passe doit contenir au moins une majuscule.'
  if (!/[^A-Za-z0-9]/.test(password)) return 'Le mot de passe doit contenir au moins un caractère spécial (@, &, …).'
  return null
}
