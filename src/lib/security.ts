import { apiFetch } from '@/lib/api'

export interface LoginAttempt {
  identifier: string
  method: 'code' | 'email'
  ip: string | null
  created_at: string
}

export interface LoginAttemptsReport {
  failuresLast24h: number
  recentFailures: LoginAttempt[]
}

export function getLoginAttempts(sessionId: string) {
  return apiFetch<LoginAttemptsReport>('/api/auth/security/login-attempts', { sessionId })
}
