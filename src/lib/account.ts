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
