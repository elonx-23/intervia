import { readFileSync } from 'node:fs'
import path from 'node:path'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'

import { getSetting } from './db.mjs'
import { uploadsDir } from './routes/upload.mjs'

// Miroir de src/lib/pdf.ts (design identique) mais côté serveur — utilisé
// pour joindre le PDF en pièce jointe aux emails, pas seulement pour le
// téléchargement côté client. Dupliqué plutôt que partagé : le client est en
// TypeScript avec des alias de chemin (@/lib/...), le serveur en JS simple,
// pas la peine de mettre en place un module partagé pour ~250 lignes.
//
// Les coordonnées de l'entreprise viennent maintenant de Réglages →
// Entreprise (table "settings"), pas d'une constante figée — ces valeurs ne
// servent que de repli tant que rien n'a été configuré.
const DEFAULT_COMPANY = {
  name: 'PSE DÉPANNAGE',
  legalForm: 'SARL',
  address: '58 rue de Monceau, 75008 Paris',
  siret: '99474318500013',
  vatNumber: 'FR26994743185',
  naf: '4322A',
  vatRegime: 'TVA sur les encaissements',
  phone: '',
  email: '',
  logoUrl: '',
}

function getCompany(teamId) {
  return { ...DEFAULT_COMPANY, ...(getSetting('company', teamId) ?? {}) }
}

// Lit le logo uploadé (server/uploads/logo/...) et le renvoie en base64
// utilisable par jsPDF.addImage — jamais bloquant : n'importe quelle erreur
// (fichier manquant, format non supporté) fait simplement retomber sur le
// logo texte "PSE" par défaut plutôt que de casser la génération du PDF.
//
// `logoUrl` vient de Réglages → Entreprise (settings.mjs PATCH /company),
// enregistré sans validation de format — donc pleinement contrôlable par
// n'importe quel admin. L'ancienne vérification (`startsWith('/uploads/')`
// sur la chaîne brute, puis un remplacement de texte suivi d'un `path.join`)
// ne protège PAS contre `../..` : `path.join(uploadsDir, '../../.env')`
// ressort littéralement en dehors de `uploadsDir`, et `readFileSync` lit
// alors n'importe quel fichier lisible par le process (potentiellement
// `server/.env` et ses vrais secrets). Le seul contrôle fiable est de
// résoudre le chemin final en absolu et vérifier qu'il reste bien À
// L'INTÉRIEUR de `uploadsDir` une fois résolu — pas sur la chaîne d'origine.
function readLogoDataUrl(logoUrl) {
  if (!logoUrl || !logoUrl.startsWith('/uploads/')) return null
  try {
    const relative = logoUrl.replace('/uploads/', '')
    const resolvedUploadsDir = path.resolve(uploadsDir) + path.sep
    const filePath = path.resolve(uploadsDir, relative)
    if (!filePath.startsWith(resolvedUploadsDir)) return null

    const ext = path.extname(filePath).slice(1).toLowerCase() || 'png'
    const mime = ext === 'jpg' ? 'jpeg' : ext
    const buffer = readFileSync(filePath)
    return `data:image/${mime};base64,${buffer.toString('base64')}`
  } catch {
    return null
  }
}

function legalFooterLines(company) {
  return [
    `${company.name} — ${company.legalForm} — ${company.address}`,
    `SIRET ${company.siret} — TVA ${company.vatNumber} — NAF ${company.naf}`,
    company.vatRegime,
  ]
}

// Miroir de LEGAL_CLAUSES dans src/lib/company.ts.
function legalClauses(company) {
  return [
    {
      title: 'Acceptation du devis',
      body: `Le devis est valable pour la durée indiquée. La signature du client vaut acceptation ferme des prestations, quantités et prix qui y figurent.`,
    },
    {
      title: 'Exécution des travaux',
      body: `Les travaux sont réalisés selon les règles de l'art. Toute prestation supplémentaire constatée sur place et non prévue au devis initial fait l'objet d'un accord préalable du client avant réalisation.`,
    },
    {
      title: 'Modalités de paiement',
      body: `Sauf mention contraire, le règlement est dû à réception de la facture. ${company.name} accepte les paiements par espèces, carte bancaire, virement ou chèque.`,
    },
    {
      title: 'Pénalités de retard',
      body: `Conformément à l'article L441-10 du code de commerce, tout retard de paiement entraîne de plein droit l'application de pénalités calculées au taux d'intérêt légal en vigueur, ainsi qu'une indemnité forfaitaire pour frais de recouvrement de 40 €.`,
    },
    {
      title: 'Garantie',
      body: `Les pièces et équipements posés bénéficient de la garantie du fabricant. La main d'œuvre est garantie contre tout défaut d'installation pendant une durée raisonnable après intervention, sur présentation de la facture.`,
    },
    {
      title: 'Responsabilité',
      body: `${company.name} ne saurait être tenue responsable des dommages résultant de l'état antérieur des installations, de vices cachés préexistants, ou d'une utilisation non conforme des équipements après intervention.`,
    },
    {
      title: 'Litiges et juridiction compétente',
      body: `En cas de différend, les parties s'engagent à rechercher une solution amiable. À défaut d'accord, le litige relève de la juridiction compétente du ressort du siège de l'entreprise.`,
    },
  ]
}

const ACCENT = [230, 194, 153]
const DARK = [26, 26, 30]
const GRAY_TEXT = [100, 100, 110]
const GRAY_LINE = [220, 220, 226]
const RED = [176, 32, 32]
const RED_BG = [253, 235, 235]

function itemsTotalHT(items) {
  return items.reduce((sum, i) => sum + i.quantity * i.unitPrice, 0)
}

function discountAmount(ht, discountType, discountValue) {
  if (!discountValue) return 0
  return discountType === 'percent' ? ht * (discountValue / 100) : discountValue
}

function fmtDate(iso) {
  return new Date(iso).toLocaleDateString('fr-FR')
}

// Reproduit la hauteur de ligne interne de jspdf-autotable (lineHeightFactor
// 1.15 par défaut, converti pt -> mm) pour que le texte qu'on redessine
// nous-mêmes (désignation en gras + description normale) tombe pile dans la
// hauteur de ligne déjà réservée par le tableau.
function lineHeightMm(fontSizePt) {
  return (fontSizePt * 1.15) / (72 / 25.4)
}

// Logo auto-généré tant qu'aucun logo n'a été chargé dans Réglages →
// Entreprise : initiales du nom de la société (ex. "PSE DÉPANNAGE" → "PD"),
// jamais le texte "PSE" en dur — reste pertinent si la société est renommée.
function companyInitials(name) {
  const words = (name || '').trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return '—'
  if (words.length === 1) return words[0].slice(0, 3).toUpperCase()
  return words
    .slice(0, 3)
    .map((w) => w[0])
    .join('')
    .toUpperCase()
}

function drawLogo(pdf, x, y, logoDataUrl, initials) {
  if (logoDataUrl) {
    try {
      pdf.addImage(logoDataUrl, x, y, 14, 14)
      return
    } catch {
      // image illisible par jsPDF (format exotique…) — repli sur le logo texte
    }
  }
  pdf.setFillColor(...DARK)
  pdf.roundedRect(x, y, 14, 14, 3, 3, 'F')
  pdf.setTextColor(255, 255, 255)
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(initials && initials.length > 2 ? 6.5 : 8)
  pdf.text(initials || 'PSE', x + 7, y + 8.5, { align: 'center' })
}

export function generateDocumentPdfBuffer(doc) {
  const company = getCompany(doc.team_id)
  const pdf = new jsPDF()
  const pageWidth = pdf.internal.pageSize.getWidth()
  const margin = 14
  const kindLabel = doc.kind === 'devis' ? 'Devis' : 'Facture'

  drawLogo(pdf, margin, 14, readLogoDataUrl(company.logoUrl), companyInitials(company.name))
  pdf.setTextColor(...DARK)
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(15)
  pdf.text(company.name, margin + 18, 23)

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

  let y = Math.max(40, infoBottomY + 8)
  pdf.setTextColor(...DARK)
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(8.5)
  const companyLines = [company.name, company.address, 'France', company.email || 'gestion@pse-depannage.fr']
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

  const groups = []
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
      // Le nom de l'article et sa description partagent une même cellule —
      // autotable ne sait pas mélanger gras/normal dans une seule chaîne,
      // donc on efface son rendu par défaut et on redessine nous-mêmes.
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
    tableY = pdf.lastAutoTable.finalY
  }

  const ht = itemsTotalHT(doc.items)
  const remise = discountAmount(ht, doc.discount_type, doc.discount_value)
  const ttc = Math.max(0, ht - remise) * (1 + doc.vat_rate / 100)
  const vatAmount = ttc - (ht - remise)

  const belowTableY = tableY + 8
  const boxWidth = 78
  const boxX = pageWidth - margin - boxWidth

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
  const vatTableEndY = pdf.lastAutoTable.finalY

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
  const totalsEndY = pdf.lastAutoTable.finalY

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

  legalClauses(company).forEach((clause, idx) => {
    ensureSpace()
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(8.5)
    pdf.setTextColor(...DARK)
    pdf.text(`${idx + 1}. ${clause.title}`, margin, finalY)
    finalY += 4.5

    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(8)
    pdf.setTextColor(...GRAY_TEXT)
    const bodyLines = pdf.splitTextToSize(clause.body, pageWidth - margin * 2)
    for (const line of bodyLines) {
      ensureSpace()
      pdf.text(line, margin, finalY)
      finalY += 4
    }
    finalY += 3
  })

  const pageCount = pdf.getNumberOfPages()
  for (let p = 1; p <= pageCount; p++) {
    pdf.setPage(p)
    const footerY = pdf.internal.pageSize.getHeight() - 14
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(7)
    pdf.setTextColor(...GRAY_TEXT)
    pdf.text(legalFooterLines(company).join(' — '), pageWidth / 2, footerY, { align: 'center', maxWidth: pageWidth - margin * 2 })
  }

  return Buffer.from(pdf.output('arraybuffer'))
}
