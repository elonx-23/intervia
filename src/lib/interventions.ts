import { apiFetch } from '@/lib/api'

export type InterventionStatus =
  | 'en_attente'
  | 'assignee'
  | 'acceptee'
  | 'en_cours'
  | 'terminee'
  | 'validee'
  | 'facturee'

export const STATUS_LABELS: Record<InterventionStatus, string> = {
  en_attente: 'En attente',
  assignee: 'Assignée',
  acceptee: 'Acceptée',
  en_cours: 'En cours',
  terminee: 'Terminée',
  validee: 'Validée',
  facturee: 'Facturée',
}

export interface Intervention {
  id: string
  reference: string
  client_first_name: string
  client_last_name: string
  phone: string | null
  address: string | null
  postal_code: string | null
  city: string | null
  intervention_type: string
  description: string | null
  amount: number | null
  status: InterventionStatus
  technicien_id: string | null
  photos: string[]
  reminder_count: number
  created_by: string | null
  created_at: string
  assigned_at: string | null
  accepted_at: string | null
  started_at: string | null
  completed_at: string | null
  validated_at: string | null
}

export interface Technician {
  id: string
  first_name: string
  last_name: string
  phone: string | null
  active: boolean
  created_at: string
}

export interface InterventionInput {
  clientFirstName: string
  clientLastName: string
  phone: string
  address: string
  postalCode: string
  city: string
  interventionType: string
  description: string
  amount: number | null
  technicienId: string | null
}

export async function listInterventions(sessionId: string) {
  return apiFetch<Intervention[]>('/api/interventions', { sessionId })
}

export async function getIntervention(sessionId: string, id: string) {
  return apiFetch<Intervention>(`/api/interventions/${id}`, { sessionId })
}

export async function createIntervention(sessionId: string, input: InterventionInput) {
  return apiFetch<Intervention>('/api/interventions', { method: 'POST', sessionId, body: input })
}

export async function updateIntervention(sessionId: string, id: string, input: InterventionInput) {
  return apiFetch<Intervention>(`/api/interventions/${id}`, { method: 'PATCH', sessionId, body: input })
}

export async function assignIntervention(sessionId: string, id: string, technicienId: string) {
  return apiFetch<Intervention>(`/api/interventions/${id}/assign`, {
    method: 'POST',
    sessionId,
    body: { technicienId },
  })
}

export async function updateInterventionStatus(
  sessionId: string,
  id: string,
  status: InterventionStatus,
) {
  return apiFetch<Intervention>(`/api/interventions/${id}/status`, {
    method: 'POST',
    sessionId,
    body: { status },
  })
}

export async function deleteIntervention(sessionId: string, id: string) {
  await apiFetch(`/api/interventions/${id}`, { method: 'DELETE', sessionId })
}

export async function updateInterventionPhotos(sessionId: string, id: string, photos: string[]) {
  return apiFetch<Intervention>(`/api/interventions/${id}/photos`, {
    method: 'POST',
    sessionId,
    body: { photos },
  })
}

export async function listTechnicians(sessionId: string) {
  return apiFetch<Technician[]>('/api/technicians', { sessionId })
}

export function buildWhatsAppText(intervention: Intervention) {
  const client = [intervention.client_first_name, intervention.client_last_name]
    .filter(Boolean)
    .join(' ')
  const tarif = intervention.amount != null ? `${intervention.amount} €` : 'non défini'
  const lines = [
    client && `Client : ${client}`,
    intervention.address && `Adresse : ${intervention.address}`,
    intervention.intervention_type && `Type : ${intervention.intervention_type}`,
    intervention.description && `Description : ${intervention.description}`,
    `💰 Tarif : ${tarif}`,
  ].filter(Boolean)
  return lines.join('\n')
}
