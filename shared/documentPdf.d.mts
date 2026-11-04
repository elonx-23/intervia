// Types du modèle de PDF partagé (shared/documentPdf.mjs).
import type jsPDF from 'jspdf'

export function euro(n: number): string
export function frDate(value: string | null | undefined): string
export function documentTotals(doc: unknown): { ht: number; remise: number; base: number; vat: number; ttc: number }
export function renderDocumentPdf(p: {
  jsPDF: typeof jsPDF
  autoTable: unknown
  doc: unknown
  company: {
    name: string
    legalForm?: string
    address?: string
    siret?: string
    phone?: string
    email?: string
  }
  logoDataUrl: string | null
  clauses: { title: string; body: string }[]
  footerLines: string[]
}): jsPDF
