import { apiFetch } from '@/lib/api'
import type { PseSession } from '@/lib/auth'

export type TeamPlan = 'solo' | 'entreprise' | 'entreprise_plus' | 'ultra'

export function joinTeam(sessionId: string, joinCode: string) {
  return apiFetch<PseSession>('/api/teams/join', { method: 'POST', sessionId, body: { joinCode } })
}

export interface CreateTeamInput {
  name: string
  plan: TeamPlan
  contactEmail?: string
  contactPhone: string
  siret?: string
}

export function createTeam(sessionId: string, input: CreateTeamInput) {
  return apiFetch<{ url: string }>('/api/teams/create', { method: 'POST', sessionId, body: input })
}

export interface MyTeam {
  name: string
  plan: TeamPlan
  joinCode: string
  logoUrl: string | null
  maxTechnicienSeats: number
  usedTechnicienSeats: number
}

export function getMyTeam(sessionId: string) {
  return apiFetch<MyTeam>('/api/teams/me', { sessionId })
}

export interface TeamMembership {
  teamId: string
  name: string
  plan: TeamPlan
  logoUrl: string | null
  active: boolean
}

export function getMemberships(sessionId: string) {
  return apiFetch<TeamMembership[]>('/api/teams/memberships', { sessionId })
}

export function switchTeam(sessionId: string, teamId: string) {
  return apiFetch<PseSession>('/api/teams/switch', { method: 'POST', sessionId, body: { teamId } })
}
