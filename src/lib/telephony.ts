import { apiFetch } from '@/lib/api'

// ---------- État ----------

export interface TelephonyStatus {
  configured: boolean
  hasOpenaiKey: boolean
  // Numéros 01 de l'équipe, tels que renvoyés par l'opérateur (ex. 0033184160184).
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

// ---------- Réglages ----------

export type LegalForm = 'individual' | 'corporation' | 'association' | 'other'

export interface LegalInfo {
  legalform: string
  organisation: string
  siret: string
  ape: string
  firstname: string
  name: string
  email: string
  phone: string
  streetNumber: string
  streetName: string
  zip: string
  city: string
}

export interface TelephonySettings {
  forwardingNumber: string
  forwardingNumber2: string
  legal: LegalInfo
  recordingAccepted: boolean
  // false tant que les informations du titulaire n'ont jamais été
  // enregistrées (le formulaire n'affiche alors qu'un préremplissage).
  legalSaved?: boolean
}

export type TelephonySettingsInput = Partial<TelephonySettings>

export async function getTelephonySettings(sessionId: string) {
  return apiFetch<TelephonySettings>('/api/telephony/settings', { sessionId })
}

export async function updateTelephonySettings(sessionId: string, data: TelephonySettingsInput) {
  return apiFetch<{ ok: true }>('/api/telephony/settings', { method: 'PATCH', sessionId, body: data })
}

// ---------- Numéros ----------

export type NumberState = 'actif' | 'configuration' | 'a_configurer' | 'erreur' | 'resiliation'
export type OrderStatus = 'a_regler' | 'en_cours' | 'documents' | 'terminee'

export interface OwnedNumber {
  serviceName: string
  state: NumberState
  error: string | null
  recording: boolean
}

export interface NumberOrder {
  id: string
  kind: 'account' | 'number'
  status: OrderStatus
  label: string
  number: string | null
  total: number | null
  actionUrl: string | null
  createdAt: string
}

export interface NumbersOverview {
  configured: boolean
  account: 'none' | 'pending' | 'ready'
  // Ce qui manque avant de pouvoir acheter : 'phone' (aucun téléphone de renvoi), 'legal' (infos entreprise).
  missing: Array<'phone' | 'legal'>
  // Détail de ce qui manque dans les informations de l'entreprise (ex. « SIRET »).
  missingLegal: string[]
  numbers: OwnedNumber[]
  orders: NumberOrder[]
}

export async function getNumbersOverview(sessionId: string) {
  return apiFetch<NumbersOverview>('/api/telephony/numbers', { sessionId })
}

export async function searchZones(sessionId: string, q: string) {
  return apiFetch<string[]>(`/api/telephony/zones?q=${encodeURIComponent(q)}`, { sessionId })
}

export interface AvailableNumber {
  number: string
  // Numéro « premium » : plus facile à retenir, mais plus cher.
  premium: boolean
}

export async function listAvailableNumbers(sessionId: string, zone: string) {
  return apiFetch<AvailableNumber[]>(`/api/telephony/numbers/available?zone=${encodeURIComponent(zone)}`, { sessionId })
}

export interface Price {
  value: number
  currency: string
}

export interface NumberQuote {
  totalTtc: Price
  totalHt: Price | null
  lines: Array<{ label: string; recurring: boolean; total: Price | null }>
}

export interface NumberChoice {
  zone: string
  specificNumber: string | null
}

export async function quoteNumber(sessionId: string, choice: NumberChoice) {
  return apiFetch<NumberQuote>('/api/telephony/numbers/quote', { method: 'POST', sessionId, body: choice })
}

export async function orderNumber(sessionId: string, choice: NumberChoice, expectedTotal: number) {
  return apiFetch<{ status: OrderStatus }>('/api/telephony/numbers/order', {
    method: 'POST',
    sessionId,
    body: { ...choice, expectedTotal },
  })
}

export async function activateAccount(sessionId: string) {
  return apiFetch<{ already: boolean; status?: OrderStatus }>('/api/telephony/account/activate', { method: 'POST', sessionId })
}

export async function dismissOrder(sessionId: string, id: string) {
  return apiFetch<{ ok: true }>(`/api/telephony/orders/${id}/dismiss`, { method: 'POST', sessionId })
}

export async function reconfigureNumber(sessionId: string, serviceName: string) {
  return apiFetch<NumbersOverview>(`/api/telephony/numbers/${serviceName}/configure`, { method: 'POST', sessionId })
}

export async function releaseNumber(sessionId: string, serviceName: string) {
  return apiFetch<{ ok: true }>(`/api/telephony/numbers/${serviceName}`, { method: 'DELETE', sessionId })
}

// ---------- Appels ----------

export interface CallRecord {
  id: string
  direction: 'inbound' | 'outbound'
  from_number: string | null
  to_number: string | null
  status: string
  duration_seconds: number | null
  has_recording: boolean
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

// ---------- Affichage ----------

// Numéro stocké en +33612345678 / 0033184160184 / 0612345678 affiché à la
// française « 06 12 34 56 78 ». Tout ce qui n'est pas un numéro français
// (numéro masqué, étranger) est renvoyé tel quel.
export function formatPhone(raw: string | null | undefined) {
  if (!raw) return ''
  const digits = raw.replace(/[\s.\-()]/g, '')
  const national = /^(\+33|0033)(\d{9})$/.exec(digits)?.[2]
  const local = national ? `0${national}` : /^0\d{9}$/.test(digits) ? digits : null
  return local ? local.replace(/(\d{2})(?=\d)/g, '$1 ') : raw
}

export function formatPrice(price: Price | number | null | undefined) {
  if (price === null || price === undefined) return ''
  const value = typeof price === 'number' ? price : price.value
  const currency = typeof price === 'number' ? 'EUR' : price.currency
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency }).format(value)
}
