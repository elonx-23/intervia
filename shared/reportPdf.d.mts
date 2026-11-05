// Types du modèle de rapport d'intervention (shared/reportPdf.mjs).
import type jsPDF from 'jspdf'

export function reportDuration(from: string | null | undefined, to: string | null | undefined): string | null
export function reportSections(notes: string | null | undefined): { title: string | null; lines: string[] }[]
export function renderReportPdf(p: {
  jsPDF: typeof jsPDF
  autoTable: unknown
  report: unknown
  document: unknown
  company: {
    name: string
    legalForm?: string
    address?: string
    siret?: string
    phone?: string
    email?: string
  }
  logoDataUrl: string | null
  photos: { dataUrl: string; width: number; height: number }[]
  footerLines: string[]
}): jsPDF
