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

// Appareil connecté au compte (Réglages → Sécurité).
export interface ConnectedDevice {
  handle: string
  device: string
  ip: string | null
  location: string | null
  createdAt: string
  lastSeenAt: string
  current: boolean
}

export function getDevices(sessionId: string) {
  return apiFetch<ConnectedDevice[]>('/api/auth/security/devices', { sessionId })
}

// handle = « autres » pour déconnecter tous les appareils sauf celui-ci.
export function disconnectDevice(sessionId: string, handle: string) {
  return apiFetch<{ disconnected: number }>(`/api/auth/security/devices/${handle}`, { method: 'DELETE', sessionId })
}
