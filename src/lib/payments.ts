import { apiFetch } from '@/lib/api'

export type PaymentProvider = 'stripe' | 'paypal'

export interface IntegrationsOverview {
  stripe: { connected: boolean; key: string | null; mode: 'live' | 'test' | null }
  paypal: { connected: boolean; clientId: string | null; mode: 'live' | 'test' | null }
  defaultProvider: PaymentProvider | null
}

export interface PaymentLink {
  id: string
  provider: PaymentProvider
  amount: number
  currency: string
  description: string
  url: string
  status: 'en_attente' | 'paye' | 'annule'
  paid_at: string | null
  created_at: string
}

export const PROVIDER_LABEL: Record<PaymentProvider, string> = { stripe: 'Stripe', paypal: 'PayPal' }

export const getIntegrations = (sessionId: string) => apiFetch<IntegrationsOverview>('/api/payments/integrations', { sessionId })
export const saveStripe = (sessionId: string, secretKey: string) =>
  apiFetch<IntegrationsOverview>('/api/payments/integrations/stripe', { method: 'PUT', sessionId, body: { secretKey } })
export const savePaypal = (sessionId: string, clientId: string, secret: string) =>
  apiFetch<IntegrationsOverview>('/api/payments/integrations/paypal', { method: 'PUT', sessionId, body: { clientId, secret } })
export const removeIntegration = (sessionId: string, provider: PaymentProvider) =>
  apiFetch<IntegrationsOverview>(`/api/payments/integrations/${provider}`, { method: 'DELETE', sessionId })
export const setDefaultProvider = (sessionId: string, provider: PaymentProvider) =>
  apiFetch<IntegrationsOverview>('/api/payments/integrations/default', { method: 'PUT', sessionId, body: { provider } })

export const listPaymentLinks = (sessionId: string) => apiFetch<PaymentLink[]>('/api/payments/links', { sessionId })
export const createPaymentLink = (sessionId: string, input: { amount: number; description: string; provider?: PaymentProvider }) =>
  apiFetch<PaymentLink>('/api/payments/links', { method: 'POST', sessionId, body: input })
export const cancelPaymentLink = (sessionId: string, id: string) =>
  apiFetch<{ ok: true }>(`/api/payments/links/${id}/cancel`, { method: 'POST', sessionId })
