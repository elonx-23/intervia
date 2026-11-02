import { apiFetch } from '@/lib/api'
import type { COMPANY } from '@/lib/company'

export type CompanySettings = typeof COMPANY

export async function getCompanySettings(sessionId: string) {
  return apiFetch<CompanySettings>('/api/settings/company', { sessionId })
}

export async function updateCompanySettings(sessionId: string, data: Partial<CompanySettings>) {
  return apiFetch<CompanySettings>('/api/settings/company', { method: 'PATCH', sessionId, body: data })
}

export interface EmailTexts {
  devis: string
  devisSigne: string
  facture: string
  factureAcquittee: string
}

export async function getEmailTexts(sessionId: string) {
  return apiFetch<EmailTexts>('/api/settings/email-texts', { sessionId })
}

export async function updateEmailTexts(sessionId: string, data: Partial<EmailTexts>) {
  return apiFetch<EmailTexts>('/api/settings/email-texts', { method: 'PATCH', sessionId, body: data })
}

export async function getRegion(sessionId: string) {
  return apiFetch<{ region: string }>('/api/settings/region', { sessionId })
}

export async function updateRegion(sessionId: string, region: string) {
  return apiFetch<{ region: string }>('/api/settings/region', { method: 'PATCH', sessionId, body: { region } })
}

export interface TelephonySettings {
  configured: boolean
  accountSid: string
  phoneNumber: string
  forwardingNumber: string
  hasAuthToken: boolean
  hasOpenaiKey: boolean
}

export async function getTelephonySettings(sessionId: string) {
  return apiFetch<TelephonySettings>('/api/telephony/settings', { sessionId })
}

export interface TelephonySettingsInput {
  accountSid?: string
  authToken?: string
  phoneNumber?: string
  forwardingNumber?: string
  openaiApiKey?: string
}

export async function updateTelephonySettings(sessionId: string, data: TelephonySettingsInput) {
  return apiFetch<{ ok: true }>('/api/telephony/settings', { method: 'PATCH', sessionId, body: data })
}
