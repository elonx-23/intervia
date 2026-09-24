import { apiFetch } from '@/lib/api'
import type { COMPANY } from '@/lib/company'

export type CompanySettings = typeof COMPANY

export async function getCompanySettings(sessionId: string) {
  return apiFetch<CompanySettings>('/api/settings/company', { sessionId })
}

export async function updateCompanySettings(sessionId: string, data: Partial<CompanySettings>) {
  return apiFetch<CompanySettings>('/api/settings/company', { method: 'PATCH', sessionId, body: data })
}

export async function getRegion(sessionId: string) {
  return apiFetch<{ region: string }>('/api/settings/region', { sessionId })
}

export async function updateRegion(sessionId: string, region: string) {
  return apiFetch<{ region: string }>('/api/settings/region', { method: 'PATCH', sessionId, body: { region } })
}
