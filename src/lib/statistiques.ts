import { apiFetch } from '@/lib/api'
import type { Intervention } from '@/lib/interventions'
import type { PseDocument } from '@/lib/documents'

export interface TechnicienBreakdown {
  technicien_id: string
  name: string
  total_interventions: number
  terminees: number
  ca: number
}

export interface SecteurBreakdown {
  type: string
  total: number
  ca: number
}

export interface AdminStats {
  total_interventions: number
  ca: number
  en_cours: number
  terminees: number
  factures_impayees: number
  ca_impaye: number
  panier_moyen: number
  devis_total: number
  devis_signes: number
  taux_conversion: number | null
  by_technicien: TechnicienBreakdown[]
  by_secteur: SecteurBreakdown[]
}

export interface TechnicienStats {
  total_interventions: number
  ca: number
  terminees: number
  total_interventions_prev: number
  ca_prev: number
  terminees_prev: number
  by_secteur: SecteurBreakdown[]
}

export interface CaPoint {
  date: string
  ca: number
}

export async function getAdminStats(sessionId: string, from: string, to: string) {
  return apiFetch<AdminStats>(`/api/stats/admin?from=${from}&to=${to}`, { sessionId })
}

export async function getAdminTimeseries(sessionId: string, from: string, to: string) {
  return apiFetch<CaPoint[]>(`/api/stats/admin/timeseries?from=${from}&to=${to}`, { sessionId })
}

export async function getTechnicienStats(sessionId: string, from: string, to: string) {
  return apiFetch<TechnicienStats>(`/api/stats/technicien?from=${from}&to=${to}`, { sessionId })
}

export async function getTechnicienTimeseries(sessionId: string, from: string, to: string) {
  return apiFetch<CaPoint[]>(`/api/stats/technicien/timeseries?from=${from}&to=${to}`, { sessionId })
}

export async function listUnpaidForTechnicien(sessionId: string) {
  return apiFetch<PseDocument[]>('/api/documents/unpaid', { sessionId })
}

export async function listReleveInterventions(sessionId: string, from: string, to: string) {
  return apiFetch<Intervention[]>(`/api/stats/releve?from=${from}&to=${to}`, { sessionId })
}
