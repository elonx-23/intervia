import { apiFetch } from '@/lib/api'
import type { DocumentEmail, DocumentItem } from '@/lib/documents'

// Rapport d'intervention : un document à part entière (comme un devis ou une
// facture), créé depuis une fiche, un devis ou une facture.
export interface Report {
  id: string
  number: string
  team_id: string
  intervention_id: string | null
  document_id: string | null
  technicien_id: string | null
  technicien_name: string
  client_first_name: string
  client_last_name: string
  phone: string | null
  email: string | null
  address: string | null
  postal_code: string | null
  city: string | null
  intervention_type: string
  title: string
  extra: string
  notes: string
  motifs: string[]
  photos: string[]
  arrival_at: string | null
  end_at: string | null
  created_at: string
  updated_at: string | null
  ai_at: string | null
  created_by_name: string
}

// Devis / facture lié (lignes et totaux pour le PDF).
export interface ReportDocument {
  id: string
  kind: 'devis' | 'facture'
  number: string
  status: string
  issue_date: string
  items: DocumentItem[]
  vat_rate: number
  discount_type: string
  discount_value: number
  paid_at: string | null
  payment_method: string | null
}

export interface ReportFull extends Report {
  document: ReportDocument | null
  intervention: { id: string; reference: string; status: string; description: string | null; created_at: string } | null
  emails: DocumentEmail[]
  ai_available: boolean
}

export type ReportPatch = Partial<
  Pick<
    Report,
    | 'title'
    | 'extra'
    | 'notes'
    | 'technicien_name'
    | 'client_first_name'
    | 'client_last_name'
    | 'phone'
    | 'email'
    | 'address'
    | 'postal_code'
    | 'city'
    | 'intervention_type'
    | 'arrival_at'
    | 'end_at'
    | 'photos'
    | 'motifs'
  >
>

export const listReports = (sessionId: string) => apiFetch<Report[]>('/api/reports', { sessionId })

export const getReport = (sessionId: string, id: string) => apiFetch<ReportFull>(`/api/reports/${id}`, { sessionId })

export const createReport = (sessionId: string, source: { interventionId?: string | null; documentId?: string | null }) =>
  apiFetch<ReportFull>('/api/reports', { method: 'POST', sessionId, body: source })

export const updateReport = (sessionId: string, id: string, patch: ReportPatch) =>
  apiFetch<ReportFull>(`/api/reports/${id}`, { method: 'PATCH', sessionId, body: patch })

export const deleteReport = (sessionId: string, id: string) => apiFetch<{ ok: true }>(`/api/reports/${id}`, { method: 'DELETE', sessionId })

// Rédaction par l'IA (fiche, horaires, facture, appel, photos + éléments ajoutés).
export const draftReportWithAi = (sessionId: string, id: string, extra: string) =>
  apiFetch<ReportFull>(`/api/reports/${id}/ai`, { method: 'POST', sessionId, body: { extra } })

// Le PDF joint est celui de l'aperçu (photos comprises).
export const sendReportEmail = (sessionId: string, id: string, email: string, pdfBase64: string) =>
  apiFetch<ReportFull>(`/api/reports/${id}/email`, { method: 'POST', sessionId, body: { email, pdf: pdfBase64 } })

export const reportClientName = (r: Pick<Report, 'client_first_name' | 'client_last_name'>) =>
  [r.client_first_name, r.client_last_name].filter(Boolean).join(' ')
