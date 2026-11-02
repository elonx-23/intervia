import { apiFetch } from '@/lib/api'

export interface TelephonySettings {
  configured: boolean
  accountSid: string
  phoneNumber: string
  forwardingNumber: string
  forwardingNumber2: string
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
  forwardingNumber2?: string
  openaiApiKey?: string
}

export async function updateTelephonySettings(sessionId: string, data: TelephonySettingsInput) {
  return apiFetch<{ ok: true }>('/api/telephony/settings', { method: 'PATCH', sessionId, body: data })
}

export interface AvailableNumber {
  phoneNumber: string
  friendlyName: string
  locality: string | null
  region: string | null
}

export async function searchAvailableNumbers(sessionId: string) {
  return apiFetch<AvailableNumber[]>('/api/telephony/numbers/search', { sessionId })
}

export interface OwnedNumber {
  sid: string
  phoneNumber: string
  friendlyName: string
}

export async function listOwnedNumbers(sessionId: string) {
  return apiFetch<OwnedNumber[]>('/api/telephony/numbers', { sessionId })
}

export async function buyNumber(sessionId: string, phoneNumber: string) {
  return apiFetch<{ sid: string; phoneNumber: string }>('/api/telephony/numbers/buy', {
    method: 'POST',
    sessionId,
    body: { phoneNumber },
  })
}

export async function releaseNumber(sessionId: string, sid: string) {
  return apiFetch<{ ok: true }>(`/api/telephony/numbers/${sid}`, { method: 'DELETE', sessionId })
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
}

export async function listCalls(sessionId: string) {
  return apiFetch<CallRecord[]>('/api/telephony/calls', { sessionId })
}

export async function placeCall(sessionId: string, to: string, ring: 1 | 2 = 1) {
  return apiFetch<{ ok: true; callId: string }>('/api/telephony/call', { method: 'POST', sessionId, body: { to, ring } })
}
