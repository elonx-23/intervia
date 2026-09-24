import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

import { COMPANY, legalClauses, legalFooterLines } from '@/lib/company'
import { discountAmount, itemsTotalHT, totalTTC, type DocumentItem, type PseDocument } from '@/lib/documents'
import type { Intervention } from '@/lib/interventions'

// Palette reprise d'un vrai modèle de devis/facture du métier (dépannage/
// serrurerie) : pas de bandeau coloré plein, logo + texte noir en en-tête,
// une seule couleur d'accent chaude (beige/tan) réservée aux en-têtes de
// tableau et aux totaux — sobre, très lisible à l'impression.
const ACCENT: [number, number, number] = [230, 194, 153]
const DARK: [number, number, number] = [26, 26, 30]
const GRAY_TEXT: [number, number, number] = [100, 100, 110]
const GRAY_LINE: [number, number, number] = [220, 220, 226]
const RED: [number, number, number] = [176, 32, 32]
const RED_BG: [number, number, number] = [253, 235, 235]

// Reproduit la hauteur de ligne interne de jspdf-autotable (lineHeightFactor
// 1.15 par défaut, converti pt -> mm) pour que le texte qu'on redessine
// nous-mêmes (désignation en gras + description normale) tombe pile dans la
// hauteur de ligne déjà réservée par le tableau.
function lineHeightMm(fontSizePt: number) {
  return (fontSizePt * 1.15) / (72 / 25.4)
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('fr-FR')
}

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
// jamais le texte "PSE" en dur — reste pertinent si la société est renommée.
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
  pdf.text(initials || 'PSE', x + 7, y + 8.5, { align: 'center' })
}

export async function generateDocumentPdf(doc: PseDocument): Promise<jsPDF> {
  const pdf = new jsPDF()
  const pageWidth = pdf.internal.pageSize.getWidth()
  const margin = 14
  const kindLabel = doc.kind === 'devis' ? 'Devis' : 'Facture'

  const logoDataUrl = COMPANY.logoUrl ? await loadImageAsDataUrl(COMPANY.logoUrl) : null
  drawLogo(pdf, margin, 14, logoDataUrl, companyInitials(COMPANY.name))
  pdf.setTextColor(...DARK)
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(15)
  pdf.text(COMPANY.name, margin + 18, 23)

  // Bloc d'informations du document, aligné à droite — pas de bandeau, juste
  // du texte noir comme sur une vraie facture papier.
  const rightX = pageWidth - margin
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(10)
  pdf.text(`${kindLabel} N° ${doc.number}`, rightX, 16, { align: 'right' })
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(8.5)
  pdf.setTextColor(...GRAY_TEXT)
  pdf.text(`Réalisé${doc.kind === 'facture' ? 'e' : ''} le ${fmtDate(doc.issue_date)}`, rightX, 21.5, { align: 'right' })
  if (doc.kind === 'devis' && doc.validity_date) {
    pdf.text(`Validité : ${fmtDate(doc.validity_date)}`, rightX, 26.5, { align: 'right' })
  }
  if (doc.kind === 'facture' && doc.due_date) {
    pdf.text(`Date échéance : ${fmtDate(doc.due_date)}`, rightX, 26.5, { align: 'right' })
  }

  let infoBottomY = 31

  if (doc.kind === 'facture' && doc.status === 'payee') {
    const boxW = 62
    const boxX = rightX - boxW
    const boxY = infoBottomY + 2
    pdf.setFillColor(...RED_BG)
    pdf.setDrawColor(...RED)
    pdf.setLineWidth(0.4)
    pdf.roundedRect(boxX, boxY, boxW, 14, 2, 2, 'FD')
    pdf.setTextColor(...RED)
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(8.5)
    pdf.text('ACQUITTÉE', boxX + 4, boxY + 5.5)
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(7)
    const paidLine = `Facture payée le ${doc.paid_at ? fmtDate(doc.paid_at) : ''}${doc.payment_method ? ` par ${doc.payment_method.toLowerCase()}.` : '.'}`
    const paidLines = pdf.splitTextToSize(paidLine, boxW - 8)
    pdf.text(paidLines, boxX + 4, boxY + 9.5)
    infoBottomY = boxY + 14
  }

  // Bloc entreprise (gauche) + client (droite).
  let y = Math.max(40, infoBottomY + 8)
  pdf.setTextColor(...DARK)
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(8.5)
  const companyLines = [COMPANY.name, COMPANY.address, 'France', COMPANY.email || 'gestion@pse-depannage.fr']
  companyLines.forEach((line, i) => pdf.text(line, margin, y + i * 4.2))

  pdf.setFont('helvetica', 'bold')
  pdf.text('Adressé à :', rightX, y, { align: 'right' })
  pdf.setFont('helvetica', 'normal')
  const client = [doc.client_first_name, doc.client_last_name].filter(Boolean).join(' ') || '-'
  const clientLines = [client, ...(doc.address ? [doc.address] : []), ...(doc.phone ? [doc.phone] : []), ...(doc.email ? [doc.email] : [])]
  clientLines.forEach((line, i) => pdf.text(line, rightX, y + (i + 1) * 4.2, { align: 'right' }))

  y += Math.max(companyLines.length, clientLines.length + 1) * 4.2 + 8

  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(19)
  pdf.text(kindLabel, margin, y)
  y += 10

  // Tableau des articles groupé par type (Service / Matériel), comme sur les
  // modèles de facture du métier — un en-tête de tableau par groupe.
  const groups: { label: string; items: DocumentItem[] }[] = []
  const services = doc.items.filter((i) => i.itemType === 'service')
  const materiels = doc.items.filter((i) => i.itemType === 'materiel')
  if (services.length) groups.push({ label: 'Service', items: services })
  if (materiels.length) groups.push({ label: 'Matériel', items: materiels })
  if (groups.length === 0) groups.push({ label: 'Désignation', items: [] })

  let tableY = y
  for (const group of groups) {
    autoTable(pdf, {
      startY: tableY,
      margin: { left: margin, right: margin },
      head: [[group.label, 'Qté.', 'PU HT', 'Total HT', 'TVA']],
      body: group.items.map((i) => [
        i.description ? `${i.label}\n${i.description}` : i.label,
        String(i.quantity),
        `${i.unitPrice.toFixed(2)} €`,
        `${(i.quantity * i.unitPrice).toFixed(2)} €`,
        `${doc.vat_rate} %`,
      ]),
      styles: { fontSize: 9, cellPadding: 3.2, textColor: DARK, lineColor: GRAY_LINE, lineWidth: 0.2 },
      headStyles: { fillColor: ACCENT, textColor: DARK, fontStyle: 'bold', fontSize: 8.5 },
      columnStyles: {
        1: { halign: 'right', cellWidth: 16 },
        2: { halign: 'right', cellWidth: 24 },
        3: { halign: 'right', cellWidth: 26 },
        4: { halign: 'right', cellWidth: 16 },
      },
      // Le nom de l'article et sa description partagent une même cellule
      // (une ligne au-dessus de l'autre) — autotable ne sait pas mélanger
      // gras/normal dans une seule chaîne, donc on efface son rendu par
      // défaut et on redessine nous-mêmes : nom en gras, description en
      // texte normal juste en dessous.
      didDrawCell: (data) => {
        if (data.section !== 'body' || data.column.index !== 0) return
        const item = group.items[data.row.index]
        if (!item) return
        const cell = data.cell
        const fontSize = 9
        const lh = lineHeightMm(fontSize)
        const x = cell.x + cell.padding('left')
        const maxWidth = cell.width - cell.padding('left') - cell.padding('right')

        pdf.setFillColor(255, 255, 255)
        pdf.rect(cell.x + 0.3, cell.y + 0.3, cell.width - 0.6, cell.height - 0.6, 'F')

        let ly = cell.y + cell.padding('top') + lh * 0.78
        pdf.setTextColor(...DARK)
        pdf.setFont('helvetica', 'bold')
        pdf.setFontSize(fontSize)
        pdf.text(item.label, x, ly)
        ly += lh

        if (item.description) {
          pdf.setFont('helvetica', 'normal')
          for (const line of pdf.splitTextToSize(item.description, maxWidth)) {
            pdf.text(line, x, ly)
            ly += lh
          }
        }
      },
    })
    tableY = (pdf as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY
  }

  const ht = itemsTotalHT(doc.items)
  const remise = discountAmount(ht, doc.discount_type, doc.discount_value)
  const ttc = totalTTC(doc.items, doc.vat_rate, doc.discount_type, doc.discount_value)
  const vatAmount = ttc - (ht - remise)

  const belowTableY = tableY + 8
  const boxWidth = 78
  const boxX = pageWidth - margin - boxWidth

  // Petit tableau de ventilation de la TVA.
  autoTable(pdf, {
    startY: belowTableY,
    margin: { left: boxX },
    tableWidth: boxWidth,
    head: [['TVA', 'Base HT', 'Montant']],
    body: [[`${doc.vat_rate} %`, `${(ht - remise).toFixed(2)} €`, `${vatAmount.toFixed(2)} €`]],
    styles: { fontSize: 8.5, cellPadding: 2.6, textColor: DARK, lineColor: GRAY_LINE, lineWidth: 0.2 },
    headStyles: { fillColor: ACCENT, textColor: DARK, fontStyle: 'bold', fontSize: 8 },
    columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' } },
  })
  const vatTableEndY = (pdf as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY

  const totalsRows = [['Total HT', `${ht.toFixed(2)} €`]]
  if (remise !== 0) {
    const adj = remise > 0 ? 'Remise' : 'Majoration'
    totalsRows.push([adj, `${remise > 0 ? '-' : '+'}${Math.abs(remise).toFixed(2)} €`])
  }
  totalsRows.push(['Total TVA', `${vatAmount.toFixed(2)} €`])
  totalsRows.push([doc.kind === 'facture' ? 'Net à payer' : 'Total TTC', `${ttc.toFixed(2)} €`])

  autoTable(pdf, {
    startY: vatTableEndY + 4,
    margin: { left: boxX },
    tableWidth: boxWidth,
    body: totalsRows,
    styles: { fontSize: 8.5, cellPadding: 2.6, textColor: DARK, lineColor: GRAY_LINE, lineWidth: 0.2 },
    columnStyles: { 1: { halign: 'right' } },
    didParseCell: (data) => {
      if (data.row.index === totalsRows.length - 1) {
        data.cell.styles.fillColor = ACCENT
        data.cell.styles.fontStyle = 'bold'
      }
    },
  })
  const totalsEndY = (pdf as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY

  // Colonne de gauche : mention légale TVA réduite (si applicable) + signature.
  let leftY = belowTableY
  pdf.setTextColor(...GRAY_TEXT)
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(7.5)
  const leftWidth = boxX - margin - 6
  if (doc.vat_rate < 20) {
    const note =
      doc.kind === 'devis'
        ? `En signant le présent ${kindLabel.toLowerCase()}, j'accepte expressément les conditions générales de vente situées à la suite de ce document. Je certifie que les conditions d'application du taux réduit de la TVA sont remplies en ce que les travaux sont effectués dans des locaux à usage d'habitation de plus de deux ans, ne répondent pas aux conditions d'exclusion prévues par les textes, sont affectés ou destinés à être affectés à l'habitation à l'issue des travaux et portent sur des travaux éligibles.`
        : `Le client a attesté sur le devis signé que les conditions d'application de la TVA réduite sont remplies.`
    const noteLines = pdf.splitTextToSize(note, leftWidth)
    pdf.text(noteLines, margin, leftY)
    leftY += noteLines.length * 3.6 + 6
  }

  if (doc.signature_data) {
    try {
      pdf.setFont('helvetica', 'bold')
      pdf.setFontSize(8.5)
      pdf.setTextColor(...DARK)
      pdf.text('Signature du client', margin, leftY)
      pdf.addImage(doc.signature_data, 'PNG', margin, leftY + 3, 50, 24)
      leftY += 30
    } catch {
      // image invalide — le PDF reste utilisable sans la signature
    }
  }

  let finalY = Math.max(leftY, totalsEndY) + 6

  if (doc.notes) {
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(8)
    pdf.setTextColor(...GRAY_TEXT)
    pdf.text('NOTES', margin, finalY)
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(9)
    pdf.setTextColor(60, 60, 65)
    const noteLines = pdf.splitTextToSize(doc.notes, pageWidth - margin * 2)
    pdf.text(noteLines, margin, finalY + 5)
    finalY += 5 + noteLines.length * 4.5
  }

  // Conditions générales, à la suite du document (référencées dans la
  // mention de signature ci-dessus), avec saut de page automatique.
  const pageHeight = pdf.internal.pageSize.getHeight()
  const footerReserve = 24
  const ensureSpace = () => {
    if (finalY > pageHeight - footerReserve) {
      pdf.addPage()
      finalY = 20
    }
  }

  finalY += 10
  ensureSpace()
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(10)
  pdf.setTextColor(...DARK)
  pdf.text('Conditions générales', margin, finalY)
  finalY += 6

  legalClauses().forEach((clause, idx) => {
    ensureSpace()
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(8.5)
    pdf.setTextColor(...DARK)
    pdf.text(`${idx + 1}. ${clause.title}`, margin, finalY)
    finalY += 4.5

    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(8)
    pdf.setTextColor(...GRAY_TEXT)
    const bodyLines: string[] = pdf.splitTextToSize(clause.body, pageWidth - margin * 2)
    for (const line of bodyLines) {
      ensureSpace()
      pdf.text(line, margin, finalY)
      finalY += 4
    }
    finalY += 3
  })

  // Pied de page centré, sobre — sur chaque page.
  const pageCount = pdf.getNumberOfPages()
  for (let p = 1; p <= pageCount; p++) {
    pdf.setPage(p)
    const footerY = pdf.internal.pageSize.getHeight() - 14
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(7)
    pdf.setTextColor(...GRAY_TEXT)
    pdf.text(legalFooterLines().join(' — '), pageWidth / 2, footerY, { align: 'center', maxWidth: pageWidth - margin * 2 })
  }

  return pdf
}

export async function downloadDocumentPdf(doc: PseDocument) {
  const pdf = await generateDocumentPdf(doc)
  pdf.save(`${doc.number}.pdf`)
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
    ['Date', new Date(data.eventDate).toLocaleDateString('fr-FR')],
    ['Heure', new Date(data.eventDate).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })],
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
  pdf.text('Compte-rendu du technicien', margin, y)
  y += 5
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(9)
  pdf.setTextColor(60, 60, 65)
  const notesLines = pdf.splitTextToSize(notes.trim() || 'Aucune remarque.', pageWidth - margin * 2)
  pdf.text(notesLines, margin, y)

  const footerY = pdf.internal.pageSize.getHeight() - 14
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(7)
  pdf.setTextColor(...GRAY_TEXT)
  pdf.text(legalFooterLines().join(' — '), pageWidth / 2, footerY, { align: 'center', maxWidth: pageWidth - margin * 2 })

  pdf.save(`rapport-${data.reference}.pdf`)
}
