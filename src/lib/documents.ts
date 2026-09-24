import { apiFetch, apiUpload } from '@/lib/api'

export type DocumentKind = 'devis' | 'facture'
export type DevisStatus = 'brouillon' | 'envoye' | 'signe' | 'expire'
export type FactureStatus = 'emise' | 'payee'

export const DEVIS_STATUS_LABELS: Record<DevisStatus, string> = {
  brouillon: 'Brouillon',
  envoye: 'Envoyé',
  signe: 'Signé',
  expire: 'Expiré',
}

export const FACTURE_STATUS_LABELS: Record<FactureStatus, string> = {
  emise: 'À acquitter',
  payee: 'Payée',
}

export type DiscountType = 'percent' | 'amount'

export interface DocumentItem {
  label: string
  description?: string
  quantity: number
  unitPrice: number
  itemType: 'service' | 'materiel'
}

export interface PseDocument {
  id: string
  kind: DocumentKind
  number: string
  intervention_id: string | null
  client_first_name: string
  client_last_name: string
  phone: string | null
  address: string | null
  postal_code: string | null
  city: string | null
  email: string | null
  items: DocumentItem[]
  vat_rate: number
  notes: string | null
  issue_date: string
  validity_date: string | null
  due_date: string | null
  discount_type: DiscountType
  discount_value: number
  status: DevisStatus | FactureStatus
  photos_before: string[]
  photos_after: string[]
  public_token: string
  signed_at: string | null
  signature_data: string | null
  paid_at: string | null
  payment_method: string | null
  source_devis_id: string | null
  relance_count: number
  last_relance_at: string | null
  created_by: string | null
  created_at: string
  deleted_at: string | null
  deletion_requested_at: string | null
  deletion_requested_by: string | null
}

export interface DocumentInput {
  interventionId: string | null
  clientFirstName: string
  clientLastName: string
  phone: string
  address: string
  postalCode?: string
  city?: string
  email: string
  items: DocumentItem[]
  vatRate: number
  notes: string
  issueDate?: string
  validityDate: string | null
  dueDate?: string | null
  discountType?: DiscountType
  discountValue?: number
  photosBefore: string[]
}

export function itemsTotalHT(items: DocumentItem[]) {
  return items.reduce((sum, i) => sum + i.quantity * i.unitPrice, 0)
}

export function discountAmount(ht: number, discountType: DiscountType, discountValue: number) {
  if (!discountValue) return 0
  return discountType === 'percent' ? ht * (discountValue / 100) : discountValue
}

// Une majoration est stockée comme une remise négative — le calcul
// (ht - discountAmount) l'ajoute alors naturellement au lieu de le retirer,
// sans avoir besoin d'un champ séparé en base.
export type AdjustmentKind = 'remise' | 'majoration'

export function adjustmentKindOf(discountValue: number): AdjustmentKind {
  return discountValue < 0 ? 'majoration' : 'remise'
}

export function signedDiscountValue(kind: AdjustmentKind, absValue: number) {
  return kind === 'majoration' ? -Math.abs(absValue) : Math.abs(absValue)
}

export function adjustmentLabel(amount: number): { label: string; sign: '+' | '-'; amount: number } {
  return amount >= 0
    ? { label: 'Remise', sign: '-', amount }
    : { label: 'Majoration', sign: '+', amount: -amount }
}

export function totalTTC(
  items: DocumentItem[],
  vatRate: number,
  discountType: DiscountType = 'amount',
  discountValue = 0,
) {
  const ht = itemsTotalHT(items)
  const discounted = Math.max(0, ht - discountAmount(ht, discountType, discountValue))
  return discounted * (1 + vatRate / 100)
}

export async function createDevis(sessionId: string, input: DocumentInput) {
  return apiFetch<PseDocument>('/api/documents', { method: 'POST', sessionId, body: { ...input, kind: 'devis' } })
}

export async function createFactureDirect(sessionId: string, input: DocumentInput) {
  return apiFetch<PseDocument>('/api/documents', { method: 'POST', sessionId, body: { ...input, kind: 'facture' } })
}

export async function updateDocument(
  sessionId: string,
  id: string,
  input: DocumentInput & { photosAfter?: string[] },
) {
  return apiFetch<PseDocument>(`/api/documents/${id}`, { method: 'PATCH', sessionId, body: input })
}

export async function listDocuments(sessionId: string, kind: DocumentKind) {
  return apiFetch<PseDocument[]>(`/api/documents?kind=${kind}`, { sessionId })
}

export async function getDocument(sessionId: string, id: string) {
  return apiFetch<PseDocument>(`/api/documents/${id}`, { sessionId })
}

export async function listDocumentsByIntervention(sessionId: string, interventionId: string) {
  return apiFetch<PseDocument[]>(`/api/documents/by-intervention/${interventionId}`, { sessionId })
}

export async function getDocumentByToken(token: string) {
  return apiFetch<PseDocument>(`/api/documents/token/${token}`)
}

export async function signDocumentPublic(token: string, signatureDataUrl: string) {
  const doc = await apiFetch<PseDocument>(`/api/documents/token/${token}`)
  return apiFetch<PseDocument>(`/api/documents/${doc.id}/sign`, {
    method: 'POST',
    body: { signatureData: signatureDataUrl },
  })
}

export async function convertDevisToFacture(sessionId: string, devisId: string) {
  return apiFetch<PseDocument>(`/api/documents/${devisId}/convert`, { method: 'POST', sessionId })
}

export async function getConvertedFacture(sessionId: string, devisId: string) {
  return apiFetch<PseDocument | null>(`/api/documents/${devisId}/converted-to`, { sessionId })
}

export async function relanceDocument(sessionId: string, id: string) {
  return apiFetch<PseDocument>(`/api/documents/${id}/relance`, { method: 'POST', sessionId })
}

export async function markFacturePaid(sessionId: string, id: string, paymentMethod: string) {
  return apiFetch<PseDocument>(`/api/documents/${id}/pay`, {
    method: 'POST',
    sessionId,
    body: { paymentMethod },
  })
}

export async function markFactureUnpaid(sessionId: string, id: string) {
  return apiFetch<PseDocument>(`/api/documents/${id}/unpay`, { method: 'POST', sessionId })
}

// Crée un vrai lien de paiement Stripe (buy.stripe.com/…, ~50 caractères) —
// contrairement à une session Checkout classique, il résout directement sur
// le domaine de Stripe, sans transiter par notre serveur, et donne une
// matrice QR bien plus simple à scanner.
export async function createStripePaymentLink(sessionId: string, id: string) {
  return apiFetch<{ url: string }>(`/api/documents/${id}/stripe-payment-link`, { method: 'POST', sessionId })
}

export async function duplicateDocument(sessionId: string, id: string) {
  return apiFetch<PseDocument>(`/api/documents/${id}/duplicate`, { method: 'POST', sessionId })
}

export async function deleteDocument(sessionId: string, id: string) {
  return apiFetch<PseDocument>(`/api/documents/${id}`, { method: 'DELETE', sessionId })
}

// Annule une demande de suppression en cours — utilisé par le technicien
// qui se ravise ("Récupérer") ou par un admin qui refuse la demande.
export async function cancelDeletionRequest(sessionId: string, id: string) {
  return apiFetch<PseDocument>(`/api/documents/${id}/cancel-deletion-request`, { method: 'POST', sessionId })
}

// Admin uniquement : confirme une demande de suppression faite par un
// technicien — le document part alors réellement dans la corbeille.
export async function confirmDeletion(sessionId: string, id: string) {
  await apiFetch(`/api/documents/${id}/confirm-deletion`, { method: 'POST', sessionId })
}

export async function listTrash(sessionId: string) {
  return apiFetch<PseDocument[]>('/api/documents/trash/list', { sessionId })
}

export async function restoreDocument(sessionId: string, id: string) {
  return apiFetch<PseDocument>(`/api/documents/${id}/restore`, { method: 'POST', sessionId })
}

export async function permanentlyDeleteDocument(sessionId: string, id: string) {
  await apiFetch(`/api/documents/${id}/permanent`, { method: 'DELETE', sessionId })
}

export async function restoreAllTrash(sessionId: string) {
  await apiFetch('/api/documents/trash/restore-all', { method: 'POST', sessionId })
}

export async function purgeAllTrash(sessionId: string) {
  await apiFetch('/api/documents/trash/purge-all', { method: 'DELETE', sessionId })
}

export async function listUnpaidDocuments(sessionId: string) {
  return apiFetch<PseDocument[]>('/api/documents/unpaid', { sessionId })
}

export async function sendDocumentEmail(sessionId: string, id: string) {
  await apiFetch(`/api/documents/${id}/email`, { method: 'POST', sessionId })
}

export async function uploadDocumentPhoto(file: File, folder: string, sessionId: string) {
  return apiUpload(file, folder, sessionId)
}
