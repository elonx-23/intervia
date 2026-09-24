import { apiFetch } from '@/lib/api'

export function signup(email: string, password: string, firstName: string, lastName: string) {
  return apiFetch<{ ok: true }>('/api/signup', {
    method: 'POST',
    body: { email, password, firstName, lastName },
  })
}

export function verifyEmail(token: string) {
  return apiFetch<{ ok: true }>(`/api/signup/verify/${encodeURIComponent(token)}`)
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
