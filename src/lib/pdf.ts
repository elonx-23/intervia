import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

import { COMPANY, legalClauses, legalFooterLines } from '@/lib/company'
import { renderDocumentPdf } from '../../shared/documentPdf.mjs'
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

export async function downloadRelevePdf(
  technicienName: string,
  from: string,
  to: string,
  interventions: Intervention[],
) {
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
  pdf.text(`${technicienName} — du ${from} au ${to}`, margin, 46)

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

export interface ReportPdfInput {
  reference: string
  clientFirstName: string
  clientLastName: string
  address: string | null
  interventionType: string
  description: string | null
  eventDate: string
  // Heure d'arrivée du technicien et fin d'intervention, si connues.
  arrivalAt?: string | null
  completedAt?: string | null
}

// Texte long du rapport : passe à la page suivante quand il le faut, et met en
// gras les titres de section (« Travaux réalisés : » seul sur sa ligne).
function writeReportText(pdf: jsPDF, text: string, x: number, startY: number, width: number) {
  const pageHeight = pdf.internal.pageSize.getHeight()
  let y = startY
  for (const raw of text.split('\n')) {
    const isTitle = /^[^-•\s].{1,60}:\s*$/.test(raw.trim())
    if (!raw.trim()) {
      y += 2.5
      continue
    }
    pdf.setFont('helvetica', isTitle ? 'bold' : 'normal')
    pdf.setFontSize(isTitle ? 9.5 : 9)
    pdf.setTextColor(...(isTitle ? DARK : ([60, 60, 65] as [number, number, number])))
    if (isTitle) y += 2
    for (const line of pdf.splitTextToSize(raw.trim(), width) as string[]) {
      if (y > pageHeight - 24) {
        pdf.addPage()
        y = 20
      }
      pdf.text(line, x, y)
      y += 4.6
    }
  }
  return y
}


// Rapport d'intervention : date/heure et description reprises de la fiche
// elle-même (jamais ressaisies), plus le texte libre ajouté par le
// technicien — même habillage sobre (logo + texte noir) que les devis/
// factures pour rester cohérent visuellement. Prend une forme allégée (pas
// une `Intervention` complète) : appelé à la fois juste après création
// (où on a la fiche entière) et depuis la liste Factures (où seuls les
// champs joints par le serveur sont disponibles).
export async function downloadReportPdf(technicienName: string, data: ReportPdfInput, notes: string) {
  const pdf = new jsPDF()
  const pageWidth = pdf.internal.pageSize.getWidth()
  const margin = 14

  drawLogo(pdf, margin, 14, null, companyInitials(COMPANY.name))
  pdf.setTextColor(...DARK)
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(15)
  pdf.text(COMPANY.name, margin + 18, 23)

  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(19)
  pdf.text("Rapport d'intervention", margin, 42)

  const client = [data.clientFirstName, data.clientLastName].filter(Boolean).join(' ') || '-'

  const infoRows: [string, string][] = [
    ['Référence', data.reference],
    ['Date', new Date(data.arrivalAt ?? data.eventDate).toLocaleDateString('fr-FR')],
    ...(data.arrivalAt
      ? ([["Heure d'arrivée", new Date(data.arrivalAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })]] as [string, string][])
      : ([['Heure', new Date(data.eventDate).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })]] as [string, string][])),
    ...(data.completedAt
      ? ([["Fin d'intervention", new Date(data.completedAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })]] as [string, string][])
      : []),
    ['Technicien', technicienName],
    ['Client', client],
    ['Adresse', data.address ?? '-'],
    ["Type d'intervention", data.interventionType || '-'],
  ]

  autoTable(pdf, {
    startY: 50,
    margin: { left: margin, right: margin },
    body: infoRows,
    styles: { fontSize: 9.5, cellPadding: 3, textColor: DARK, lineColor: GRAY_LINE, lineWidth: 0.2 },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 45 } },
  })
  let y = (pdf as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10

  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(10)
  pdf.setTextColor(...DARK)
  pdf.text('Description', margin, y)
  y += 5
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(9)
  pdf.setTextColor(...GRAY_TEXT)
  const descLines = pdf.splitTextToSize(data.description || 'Aucune description.', pageWidth - margin * 2)
  pdf.text(descLines, margin, y)
  y += descLines.length * 4.5 + 10

  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(10)
  pdf.setTextColor(...DARK)
  pdf.text("Compte-rendu de l'intervention", margin, y)
  y += 6
  writeReportText(pdf, notes.trim() || 'Aucune remarque.', margin, y, pageWidth - margin * 2)

  // Pied de page légal sur chaque page.
  const footerY = pdf.internal.pageSize.getHeight() - 14
  for (let p = 1; p <= pdf.getNumberOfPages(); p++) {
    pdf.setPage(p)
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(7)
    pdf.setTextColor(...GRAY_TEXT)
    pdf.text(legalFooterLines().join(' — '), pageWidth / 2, footerY, { align: 'center', maxWidth: pageWidth - margin * 2 })
  }

  pdf.save(`rapport-${data.reference}.pdf`)
}
