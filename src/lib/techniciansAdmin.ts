import { apiFetch } from '@/lib/api'

export interface Technician {
  id: string
  first_name: string
  last_name: string
  phone: string | null
  active: boolean
  created_at: string
}

export async function listTechnicians(sessionId: string) {
  return apiFetch<Technician[]>('/api/technicians', { sessionId })
}

export async function updateTechnician(
  sessionId: string,
  id: string,
  firstName: string,
  lastName: string,
  phone: string,
) {
  await apiFetch(`/api/technicians/${id}`, {
    method: 'PATCH',
    sessionId,
    body: { firstName, lastName, phone },
  })
}

export async function setTechnicianActive(sessionId: string, id: string, active: boolean) {
  await apiFetch(`/api/technicians/${id}/active`, { method: 'POST', sessionId, body: { active } })
}

export async function deleteTechnician(sessionId: string, id: string) {
  await apiFetch(`/api/technicians/${id}`, { method: 'DELETE', sessionId })
}
