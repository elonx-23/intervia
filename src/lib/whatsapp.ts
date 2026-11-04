import { apiFetch } from '@/lib/api'
import type { Intervention } from '@/lib/interventions'

export type ShareCategory = '25' | '50'

export interface WhatsAppContact {
  id: string
  name: string
  phone: string
  category: ShareCategory
}

export interface InterventionShare {
  id: string
  contact_id: string | null
  contact_name: string | null
  phone: string | null
  category: ShareCategory
  // Envoi direct depuis le WhatsApp relié : 'envoi' (en file), 'envoye', 'echec'. null = lien WhatsApp ouvert à la main.
  status: 'envoi' | 'envoye' | 'echec' | null
  error: string | null
  sent_at: string
}

export interface WhatsAppSession {
  status: 'deconnecte' | 'connexion' | 'qr' | 'connecte'
  qr: string | null
  me: { number: string; name: string | null } | null
}

export interface WhatsAppGroup {
  id: string
  name: string
  size: number
}

export interface TakenBy {
  contactId: string
  name: string
  percent: number
}

export const CATEGORY_LABEL: Record<ShareCategory, string> = {
  '25': '25 %',
  '50': '50/50',
}

// ---------- Messages ----------

const plain = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().trim()

// « PARIS 6 » pour Paris (arrondissement d'après le code postal), sinon la ville en capitales.
export function placeLabel(i: Pick<Intervention, 'postal_code' | 'city'>) {
  const cp = String(i.postal_code ?? '').trim()
  const paris = /^75(0\d{2}|116)$/.exec(cp)
  if (paris) return `PARIS ${cp === '75116' ? 16 : Number(cp.slice(3))}`
  if (i.city?.trim()) return plain(i.city)
  return cp
}

// Code métier : OP (serrurerie), PLOMB, ELEC.
export function tradeCode(type: string | null | undefined) {
  const t = plain(type ?? '')
  if (t.startsWith('SERRUR')) return 'OP'
  if (t.startsWith('PLOMB')) return 'PLOMB'
  if (t.startsWith('ELEC')) return 'ELEC'
  return 'DEP'
}

// Message envoyé aux listes 25 % / 50/50 : juste le code, ex. « OP PARIS 6 ».
export function shortCode(i: Pick<Intervention, 'intervention_type' | 'postal_code' | 'city'>) {
  return [tradeCode(i.intervention_type), placeLabel(i)].filter(Boolean).join(' ')
}

// Fiche complète (bouton WhatsApp de la fiche) : courte, une info par ligne.
export function ficheText(i: Intervention) {
  const client = [i.client_first_name, i.client_last_name].filter(Boolean).join(' ')
  const extras = [i.floor && `Étage ${i.floor.replace(/^étage\s*/i, '')}`, i.access_codes && `Code ${i.access_codes}`].filter(Boolean)
  return [
    placeLabel(i),
    i.address,
    i.phone,
    client,
    i.amount != null && `${String(i.amount).replace('.', ',')} €`,
    extras.length > 0 && extras.join(' · '),
  ]
    .filter(Boolean)
    .join('\n')
}

// Lien qui ouvre la conversation WhatsApp du contact avec le message prêt.
export function whatsappLink(phone: string, text: string) {
  const digits = phone.replace(/[^\d+]/g, '')
  const intl = digits.startsWith('+') ? digits.slice(1) : /^0\d{9}$/.test(digits) ? `33${digits.slice(1)}` : digits
  return `https://wa.me/${intl}?text=${encodeURIComponent(text)}`
}

// ---------- API ----------

export const getSession = (sessionId: string) => apiFetch<WhatsAppSession>('/api/whatsapp/session', { sessionId })
export const connectSession = (sessionId: string) => apiFetch<WhatsAppSession>('/api/whatsapp/session/connect', { method: 'POST', sessionId })
export const logoutSession = (sessionId: string) => apiFetch<WhatsAppSession>('/api/whatsapp/session/logout', { method: 'POST', sessionId })
export const listGroups = (sessionId: string) => apiFetch<WhatsAppGroup[]>('/api/whatsapp/groups', { sessionId })

export const sendDirect = (sessionId: string, interventionId: string, contactIds: string[], message: string) =>
  apiFetch<{ shares: InterventionShare[] }>(`/api/whatsapp/interventions/${interventionId}/send`, {
    method: 'POST',
    sessionId,
    body: { contactIds, message },
  })

export const isGroup = (phone: string) => phone.endsWith('@g.us')

export const listContacts = (sessionId: string) => apiFetch<WhatsAppContact[]>('/api/whatsapp/contacts', { sessionId })

export const addContact = (sessionId: string, contact: Omit<WhatsAppContact, 'id'>) =>
  apiFetch<WhatsAppContact>('/api/whatsapp/contacts', {
    method: 'POST',
    sessionId,
    body: contact,
  })

export const deleteContact = (sessionId: string, id: string) =>
  apiFetch<{ ok: true }>(`/api/whatsapp/contacts/${id}`, {
    method: 'DELETE',
    sessionId,
  })

export const getShares = (sessionId: string, interventionId: string) =>
  apiFetch<{ shares: InterventionShare[]; takenBy: TakenBy | null }>(`/api/whatsapp/interventions/${interventionId}/shares`, { sessionId })

export const recordShares = (sessionId: string, interventionId: string, contactIds: string[]) =>
  apiFetch<{ shares: InterventionShare[]; contacts: WhatsAppContact[] }>(`/api/whatsapp/interventions/${interventionId}/shares`, {
    method: 'POST',
    sessionId,
    body: { contactIds },
  })

export const setTakenBy = (sessionId: string, interventionId: string, contactId: string | null) =>
  apiFetch<TakenBy | null>(`/api/whatsapp/interventions/${interventionId}/taken`, { method: 'POST', sessionId, body: { contactId } })
