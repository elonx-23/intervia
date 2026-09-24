import { apiFetch } from '@/lib/api'

export interface StripeStatus {
  configured: boolean
  account_id?: string
  business_name?: string | null
  country?: string
  charges_enabled?: boolean
  payouts_enabled?: boolean
  live_mode?: boolean
  key_last4?: string
  webhook_configured?: boolean
  error?: string
}

export interface PaymentRecord {
  id: string
  number: string
  client_name: string
  amount: number
  payment_method: string | null
  stripe_payment_id: string | null
  paid_at: string | null
  technicien_name: string | null
  status: string
}

export async function getStripeStatus(sessionId: string) {
  return apiFetch<StripeStatus>('/api/stripe/status', { sessionId })
}

// Accessible aux techniciens aussi (contrairement à /status, réservé à
// l'admin) — juste de quoi savoir si le lien de paiement est disponible.
export async function isStripeConfigured(sessionId: string) {
  const { configured } = await apiFetch<{ configured: boolean }>('/api/stripe/configured', { sessionId })
  return configured
}

export async function listPayments(sessionId: string) {
  return apiFetch<PaymentRecord[]>('/api/documents/payments', { sessionId })
}
