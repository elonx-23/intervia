import { apiFetch } from '@/lib/api'

export interface InterventionReport {
  id: string
  intervention_id: string
  team_id: string
  technicien_id: string | null
  notes: string
  created_at: string
}

// Rapport enrichi des champs de l'intervention (jointure faite côté
// serveur) — tout ce qu'il faut pour l'afficher dans la liste Factures ET
// régénérer le PDF sans second aller-retour.
export interface InterventionReportListItem extends InterventionReport {
  i_reference: string
  i_client_first_name: string
  i_client_last_name: string
  i_address: string | null
  i_intervention_type: string
  i_description: string | null
  i_created_at: string
  i_started_at: string | null
  i_completed_at: string | null
}

export async function createReport(sessionId: string, interventionId: string, notes: string) {
  return apiFetch<InterventionReport>('/api/reports', {
    method: 'POST',
    sessionId,
    body: { interventionId, notes },
  })
}

export async function listReports(sessionId: string) {
  return apiFetch<InterventionReportListItem[]>('/api/reports', { sessionId })
}

export async function listReportsByIntervention(sessionId: string, interventionId: string) {
  return apiFetch<InterventionReport[]>(`/api/reports/by-intervention/${interventionId}`, { sessionId })
}
