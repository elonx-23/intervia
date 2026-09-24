import { apiFetch } from '@/lib/api'

export interface ClientSummary {
  key: string
  name: string
  phone: string | null
  address: string | null
  devis_count: number
  facture_count: number
  ca_paye: number
  ca_du: number
  last_activity: string
  total_documents: number
}

export async function listClients(sessionId: string) {
  return apiFetch<ClientSummary[]>('/api/documents/clients', { sessionId })
}

export interface ClientMatch {
  key: string
  firstName: string
  lastName: string
  phone: string | null
  address: string | null
  postalCode: string | null
  city: string | null
  email: string | null
}

export async function searchClients(sessionId: string, q: string) {
  return apiFetch<ClientMatch[]>(`/api/documents/search-clients?q=${encodeURIComponent(q)}`, { sessionId })
}
