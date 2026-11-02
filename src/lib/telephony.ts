import { apiFetch } from '@/lib/api'

export interface TelephonyStatus {
  configured: boolean
  hasOpenaiKey: boolean
  // Numéros 01 branchés chez OVH, tels que renvoyés par OVH (ex. 0033184160184).
  numbers: string[]
  lastSyncAt: string | null
  lastSyncError: string | null
}

export async function getTelephonyStatus(sessionId: string) {
  return apiFetch<TelephonyStatus>('/api/telephony/status', { sessionId })
}

export async function syncCalls(sessionId: string) {
  return apiFetch<{ imported: number; error?: string | null }>('/api/telephony/sync', { method: 'POST', sessionId })
}

export interface CallRecord {
  id: string
  direction: 'inbound' | 'outbound'
  from_number: string | null
  to_number: string | null
  status: string
  duration_seconds: number | null
  recording_url: string | null
  transcription: string | null
  transcription_status: string | null
  started_at: string
  ended_at: string | null
  intervention_id: string | null
  intervention_reference: string | null
  client_name: string | null
}

export async function listCalls(sessionId: string) {
  return apiFetch<CallRecord[]>('/api/telephony/calls', { sessionId })
}

export async function retryTranscription(sessionId: string, callId: string) {
  return apiFetch<{ ok: true }>(`/api/telephony/calls/${callId}/transcribe`, { method: 'POST', sessionId })
}

// Affichage d'un numéro stocké en +33612345678 / 0033184160184 / 0612345678
// sous la forme française lisible « 06 12 34 56 78 ». Tout ce qui n'est pas un
// numéro français (numéro masqué, étranger) est renvoyé tel quel.
export function formatPhone(raw: string | null | undefined) {
  if (!raw) return ''
  const digits = raw.replace(/[\s.\-()]/g, '')
  const national = /^(\+33|0033)(\d{9})$/.exec(digits)?.[2]
  const local = national ? `0${national}` : /^0\d{9}$/.test(digits) ? digits : null
  return local ? local.replace(/(\d{2})(?=\d)/g, '$1 ') : raw
}
