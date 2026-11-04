import { apiFetch } from '@/lib/api'
import type { PseSession } from '@/lib/auth'

export interface AccountInput {
  firstName: string
  lastName: string
  email: string
  phone: string
}

export async function updateAccount(sessionId: string, data: AccountInput) {
  return apiFetch<PseSession>('/api/auth/me', { method: 'PATCH', sessionId, body: data })
}

export async function changePassword(sessionId: string, currentPassword: string, newPassword: string, confirmPassword: string) {
  return apiFetch<{ ok: true; disconnected: number }>('/api/auth/password', {
    method: 'POST',
    sessionId,
    body: { currentPassword, newPassword, confirmPassword },
  })
}
