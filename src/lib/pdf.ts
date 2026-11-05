import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

import { COMPANY, legalClauses, legalFooterLines } from '@/lib/company'
import { renderDocumentPdf } from '../../shared/documentPdf.mjs'
import { renderReportPdf } from '../../shared/reportPdf.mjs'
import type { ReportFull } from '@/lib/reports'
import type { PseDocument } from '@/lib/documents'
import type { Intervention } from '@/lib/interventions'

// Palette reprise d'un vrai modèle de devis/facture du métier (dépannage/
// serrurerie) : pas de bandeau coloré plein, logo + texte noir en en-tête,
// une seule couleur d'accent chaude (beige/tan) réservée aux en-têtes de
// tableau et aux totaux — sobre, très lisible à l'impression.
const ACCENT: [number, number, number] = [230, 194, 153]
const DARK: [number, number, number] = [26, 26, 30]
const GRAY_TEXT: [number, number, number] = [100, 100, 110]
const GRAY_LINE: [number, number, number] = [220, 220, 226]

// Convertit l'image uploadée (servie en tant que fichier statique via
// /uploads/...) en data URL pour jsPDF.addImage, qui ne sait pas charger une
// URL distante directement. Jamais bloquant : une erreur (réseau, format non
// supporté) retombe simplement sur le logo texte par défaut.
async function loadImageAsDataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url)
    const blob = await res.blob()
    return await new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = reject
      reader.readAsDataURL(blob)
    })
  } catch {
    return null
  }
}

// Logo auto-généré tant qu'aucun logo n'a été chargé dans Réglages →
// Entreprise : initiales du nom de la société (ex. "PSE DÉPANNAGE" → "PD"),
// jamais un nom codé en dur — reste pertinent si la société est renommée.
function companyInitials(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return '—'
  if (words.length === 1) return words[0].slice(0, 3).toUpperCase()
  return words
    .slice(0, 3)
    .map((w) => w[0])
    .join('')
    .toUpperCase()
}

function drawLogo(pdf: jsPDF, x: number, y: number, logoDataUrl?: string | null, initials?: string) {
  if (logoDataUrl) {
    try {
      pdf.addImage(logoDataUrl, x, y, 14, 14)
      return
    } catch {
      // image illisible par jsPDF — repli sur le logo texte
    }
  }
  pdf.setFillColor(...DARK)
  pdf.roundedRect(x, y, 14, 14, 3, 3, 'F')
  pdf.setTextColor(255, 255, 255)
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(initials && initials.length > 2 ? 6.5 : 8)
  pdf.text(initials || 'IN', x + 7, y + 8.5, { align: 'center' })
}

// Devis / facture : même modèle que la pièce jointe des emails
// (shared/documentPdf.mjs) — ce que voit le client est ce que voit l'app.
export async function generateDocumentPdf(doc: PseDocument): Promise<jsPDF> {
  const logoDataUrl = COMPANY.logoUrl ? await loadImageAsDataUrl(COMPANY.logoUrl) : null
  return renderDocumentPdf({
    jsPDF,
    autoTable,
    doc,
    company: COMPANY,
    logoDataUrl,
    clauses: legalClauses(),
    footerLines: legalFooterLines(),
  })
}

export async function downloadDocumentPdf(doc: PseDocument) {
  const pdf = await generateDocumentPdf(doc)
  pdf.save(`${doc.number}.pdf`)
}

// URL blob affichable directement dans un <iframe> (page de signature
// publique) — à la différence de downloadDocumentPdf, ne déclenche aucun
// téléchargement. L'appelant doit révoquer l'URL (URL.revokeObjectURL)
// une fois qu'il n'en a plus besoin, pour ne pas fuiter de mémoire à
// chaque régénération (ex. après signature).
export async function getDocumentPdfBlobUrl(doc: PseDocument): Promise<string> {
  const pdf = await generateDocumentPdf(doc)
  return pdf.output('bloburl') as unknown as string
}

// Jamais le nom du technicien ni du gérant sur un document : seule l'entreprise.
export async function downloadRelevePdf(from: string, to: string, interventions: Intervention[]) {
  const pdf = new jsPDF()
  const pageWidth = pdf.internal.pageSize.getWidth()
  const margin = 14

  drawLogo(pdf, margin, 14, null, companyInitials(COMPANY.name))
  pdf.setTextColor(...DARK)
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(15)
  pdf.text(COMPANY.name, margin + 18, 23)

  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(14)
  pdf.text("Relevé d'interventions", margin, 40)
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(9)
  pdf.setTextColor(...GRAY_TEXT)
  pdf.text(`Du ${from} au ${to}`, margin, 46)

  autoTable(pdf, {
    startY: 54,
    margin: { left: margin, right: margin },
    head: [['Référence', 'Client', 'Type', 'Statut', 'Montant']],
    body: interventions.map((i) => [
      i.reference,
      [i.client_first_name, i.client_last_name].filter(Boolean).join(' '),
      i.intervention_type,
      i.status,
      i.amount != null ? `${i.amount.toFixed(2)} €` : '-',
    ]),
    styles: { fontSize: 9, cellPadding: 3, textColor: DARK, lineColor: GRAY_LINE, lineWidth: 0.2 },
    headStyles: { fillColor: ACCENT, textColor: DARK, fontStyle: 'bold', fontSize: 8.5 },
  })

  const total = interventions.reduce((sum, i) => sum + (i.amount ?? 0), 0)
  const finalY = (pdf as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(11)
  pdf.setTextColor(...DARK)
  pdf.text(`Total : ${total.toFixed(2)} €`, margin, finalY)

  const footerY = pdf.internal.pageSize.getHeight() - 14
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(7)
  pdf.setTextColor(...GRAY_TEXT)
  pdf.text(legalFooterLines().join(' — '), pageWidth / 2, footerY, { align: 'center', maxWidth: pageWidth - margin * 2 })

  pdf.save(`releve-${from}-${to}.pdf`)
}

// ---------- Rapport d'intervention (shared/reportPdf.mjs) ----------

type PdfPhoto = { dataUrl: string; width: number; height: number }

// Photo → JPEG réduit (1400 px au plus) : PDF léger, et lisible par jsPDF quel
// que soit le format d'origine (HEIC, PNG, WEBP…). Gardée en mémoire : l'aperçu
// et le partage la réutilisent sans la recharger.
const photoCache = new Map<string, Promise<PdfPhoto | null>>()
function photoForPdf(url: string) {
  if (!photoCache.has(url)) {
    photoCache.set(
      url,
      (async () => {
        try {
          const img = new Image()
          img.src = url
          await img.decode()
          const scale = Math.min(1, 1400 / Math.max(img.naturalWidth, img.naturalHeight))
          const w = Math.max(1, Math.round(img.naturalWidth * scale))
          const h = Math.max(1, Math.round(img.naturalHeight * scale))
          const canvas = document.createElement('canvas')
          canvas.width = w
          canvas.height = h
          const ctx = canvas.getContext('2d')
          if (!ctx) return null
          ctx.fillStyle = '#ffffff'
          ctx.fillRect(0, 0, w, h)
          ctx.drawImage(img, 0, 0, w, h)
          return { dataUrl: canvas.toDataURL('image/jpeg', 0.82), width: w, height: h }
        } catch {
          photoCache.delete(url)
          return null
        }
      })(),
    )
  }
  return photoCache.get(url)!
}

export async function generateReportPdf(report: ReportFull): Promise<jsPDF> {
  const [logoDataUrl, photos] = await Promise.all([
    COMPANY.logoUrl ? loadImageAsDataUrl(COMPANY.logoUrl) : Promise.resolve(null),
    Promise.all(report.photos.slice(0, 12).map(photoForPdf)),
  ])
  return renderReportPdf({
    jsPDF,
    autoTable,
    report,
    document: report.document,
    company: COMPANY,
    logoDataUrl,
    photos: photos.filter((p): p is PdfPhoto => p !== null),
    footerLines: legalFooterLines(),
  })
}

export async function downloadReportPdf(report: ReportFull) {
  const pdf = await generateReportPdf(report)
  pdf.save(`Rapport-${report.number}.pdf`)
}
