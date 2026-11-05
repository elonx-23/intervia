// Mise en page des devis et factures en PDF — UN SEUL modèle, utilisé à la
// fois par l'app (aperçu, téléchargement, partage : src/lib/pdf.ts) et par le
// serveur (pièce jointe des emails : server/pdf.mjs). Le PDF reçu par le
// client est donc exactement celui affiché dans l'app.
//
// Polices intégrées de jsPDF (Helvetica, jeu WinAnsi) : accents, « € », « œ »
// et guillemets français passent ; les espaces insécables fines (que produit
// toLocaleString) ne passent PAS — les montants sont donc formatés à la main.

import {
  A4_H,
  A4_W,
  CONTENT_W,
  GREEN,
  GREEN_BG,
  GROUP,
  INK,
  LINE,
  M,
  MUTED,
  TEXT,
  ZEBRA,
  drawBrandHeader,
  drawCards,
  drawFooters,
  drawMetaRow,
  euro,
  fontSetter,
  frDate,
} from './pdfParts.mjs'

export { euro, frDate }

const pct = (n) => `${String(Number(n) || 0).replace('.', ',')} %`

/** Totaux — mêmes règles que l'app (lib/documents.ts). */
export function documentTotals(doc) {
  const items = doc.items ?? []
  const ht = items.reduce((s, i) => s + i.quantity * i.unitPrice, 0)
  const remise = doc.discount_value ? (doc.discount_type === 'percent' ? ht * (doc.discount_value / 100) : doc.discount_value) : 0
  const base = Math.max(0, ht - remise)
  const ttc = base * (1 + (doc.vat_rate ?? 0) / 100)
  return { ht, remise, base, vat: ttc - base, ttc }
}

/**
 * @param {object} p
 * @param {any} p.jsPDF  constructeur jsPDF
 * @param {Function} p.autoTable  jspdf-autotable
 * @param {object} p.doc  devis / facture (items déjà décodés)
 * @param {object} p.company  coordonnées de l'entreprise émettrice
 * @param {string|null} p.logoDataUrl  logo de l'entreprise (data URL) ou null
 * @param {{title:string, body:string}[]} p.clauses  conditions générales
 * @param {string[]} p.footerLines  mentions légales du pied de page
 */
export function renderDocumentPdf({ jsPDF, autoTable, doc, company, logoDataUrl, clauses, footerLines }) {
  const pdf = new jsPDF({ unit: 'mm', format: 'a4' })
  const isDevis = doc.kind === 'devis'
  const kind = isDevis ? 'DEVIS' : 'FACTURE'
  const t = documentTotals(doc)
  const set = fontSetter(pdf)
  const lastY = () => pdf.lastAutoTable.finalY

  // ===== En-tête : logo + entreprise / type et numéro du document =====
  drawBrandHeader(pdf, { company, logoDataUrl, title: kind, number: doc.number })

  // ===== Dates clés + tampon (acquittée / signé) =====
  const meta = [[`Date d'émission`, frDate(doc.issue_date)]]
  if (isDevis && doc.validity_date) meta.push(['Valable jusqu’au', frDate(doc.validity_date)])
  if (!isDevis && doc.due_date) meta.push(['Échéance', frDate(doc.due_date)])
  drawMetaRow(
    pdf,
    meta.map(([label, value], idx) => [label, value, M + idx * 46]),
  )
  const stamp =
    !isDevis && doc.status === 'payee'
      ? {
          title: 'ACQUITTÉE',
          line: [doc.paid_at && `le ${frDate(doc.paid_at)}`, doc.payment_method && `par ${String(doc.payment_method).toLowerCase()}`]
            .filter(Boolean)
            .join(' '),
        }
      : isDevis && doc.status === 'signe'
        ? { title: 'SIGNÉ', line: doc.signed_at ? `le ${frDate(doc.signed_at)}` : '' }
        : null
  if (stamp) {
    const w = 52
    const x = A4_W - M - w
    pdf.setFillColor(...GREEN_BG)
    pdf.setDrawColor(...GREEN)
    pdf.setLineWidth(0.35)
    pdf.roundedRect(x, 40, w, 12, 2, 2, 'FD')
    set(9, 'bold', GREEN)
    pdf.text(stamp.title, x + w / 2, 45, { align: 'center', charSpace: 0.5 })
    if (stamp.line) {
      set(7, 'normal', GREEN)
      pdf.text(stamp.line, x + w / 2, 49.3, { align: 'center' })
    }
  }

  // ===== Émetteur / Client =====
  const cardY = 58
  const client = [doc.client_first_name, doc.client_last_name].filter(Boolean).join(' ') || 'Client'
  const cityLine = [doc.postal_code, doc.city].filter(Boolean).join(' ')
  const cardH = drawCards(pdf, cardY, [
    { label: 'ÉMETTEUR', lines: [company.name, company.address, company.phone, company.email].filter(Boolean) },
    { label: 'CLIENT', lines: [client, doc.address, cityLine, doc.phone, doc.email].filter(Boolean) },
  ])

  // ===== Articles =====
  const services = (doc.items ?? []).filter((i) => i.itemType !== 'materiel')
  const materiel = (doc.items ?? []).filter((i) => i.itemType === 'materiel')
  const groups = [
    { label: 'PRESTATIONS', items: services },
    { label: 'MATÉRIEL ET FOURNITURES', items: materiel },
  ].filter((g) => g.items.length > 0)
  const showGroups = groups.length > 1
  const body = []
  const meta2 = [] // par ligne : { group } ou { item, zebra }
  let zebra = false
  for (const g of groups) {
    if (showGroups) {
      body.push([{ content: g.label, colSpan: 5 }])
      meta2.push({ group: true })
      zebra = false
    }
    for (const item of g.items) {
      body.push([
        item.description ? `${item.label}\n${item.description}` : item.label,
        String(item.quantity).replace('.', ','),
        euro(item.unitPrice),
        pct(doc.vat_rate),
        euro(item.quantity * item.unitPrice),
      ])
      meta2.push({ item, zebra })
      zebra = !zebra
    }
  }
  if (body.length === 0) {
    body.push([{ content: 'Aucun article', colSpan: 5 }])
    meta2.push({ group: true })
  }

  autoTable(pdf, {
    startY: cardY + cardH + 8,
    margin: { left: M, right: M, top: 20, bottom: 24 },
    theme: 'plain',
    head: [['Désignation', 'Qté', 'PU HT', 'TVA', 'Total HT']],
    body,
    styles: {
      font: 'helvetica',
      fontSize: 9,
      textColor: TEXT,
      cellPadding: { top: 3.3, bottom: 3.3, left: 3.5, right: 3.5 },
      valign: 'middle',
    },
    headStyles: {
      fillColor: INK,
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8,
      cellPadding: { top: 3.2, bottom: 3.2, left: 3.5, right: 3.5 },
    },
    columnStyles: {
      1: { halign: 'right', cellWidth: 15 },
      2: { halign: 'right', cellWidth: 27 },
      3: { halign: 'right', cellWidth: 16 },
      4: { halign: 'right', cellWidth: 29, fontStyle: 'bold' },
    },
    didParseCell: (data) => {
      if (data.section === 'head' && data.column.index > 0) data.cell.styles.halign = 'right'
      if (data.section !== 'body') return
      const m = meta2[data.row.index]
      if (m?.group) {
        data.cell.styles.fillColor = GROUP
        data.cell.styles.fontStyle = 'bold'
        data.cell.styles.fontSize = 7.2
        data.cell.styles.textColor = MUTED
        data.cell.styles.cellPadding = { top: 2.2, bottom: 2.2, left: 3.5, right: 3.5 }
      } else if (m?.zebra) {
        data.cell.styles.fillColor = ZEBRA
      }
    },
    // Désignation : nom en gras, description en gris dessous (autotable ne
    // mélange pas gras/normal dans une cellule : on redessine la cellule).
    didDrawCell: (data) => {
      if (data.section === 'body') {
        pdf.setDrawColor(...LINE)
        pdf.setLineWidth(0.2)
        pdf.line(data.cell.x, data.cell.y + data.cell.height, data.cell.x + data.cell.width, data.cell.y + data.cell.height)
      }
      if (data.section !== 'body' || data.column.index !== 0) return
      const m = meta2[data.row.index]
      if (!m?.item) return
      const cell = data.cell
      const fill = m.zebra ? ZEBRA : [255, 255, 255]
      pdf.setFillColor(...fill)
      pdf.rect(cell.x + 0.2, cell.y + 0.2, cell.width - 0.4, cell.height - 0.6, 'F')
      const x = cell.x + 3.5
      const maxW = cell.width - 7
      const label = pdf.splitTextToSize(m.item.label, maxW)
      const desc = m.item.description ? pdf.splitTextToSize(m.item.description, maxW) : []
      const lh = 3.9
      const blockH = label.length * lh + desc.length * 3.5
      let y = cell.y + (cell.height - blockH) / 2 + 2.9
      set(9, 'bold', INK)
      for (const l of label) {
        pdf.text(l, x, y)
        y += lh
      }
      set(7.8, 'normal', MUTED)
      for (const l of desc) {
        pdf.text(l, x, y)
        y += 3.5
      }
    },
  })

  // ===== Totaux (à droite) et mentions / signature (à gauche) =====
  let y = lastY() + 8
  const pageBottom = A4_H - 26
  if (y + 52 > pageBottom) {
    pdf.addPage()
    y = 20
  }
  const totalsW = 80
  const tx = A4_W - M - totalsW
  const rows = [['Total HT', euro(t.ht)]]
  if (t.remise) rows.push([t.remise > 0 ? 'Remise' : 'Majoration', `${t.remise > 0 ? '-' : '+'}${euro(Math.abs(t.remise))}`])
  if (t.remise) rows.push(['Total HT après remise', euro(t.base)])
  rows.push([`TVA ${pct(doc.vat_rate)}`, euro(t.vat)])
  let ty = y
  for (const [label, value] of rows) {
    set(9, 'normal', MUTED)
    pdf.text(label, tx + 4, ty + 4)
    set(9, 'bold', TEXT)
    pdf.text(value, A4_W - M - 4, ty + 4, { align: 'right' })
    pdf.setDrawColor(...LINE)
    pdf.setLineWidth(0.2)
    pdf.line(tx, ty + 7, A4_W - M, ty + 7)
    ty += 7.5
  }
  pdf.setFillColor(...INK)
  pdf.roundedRect(tx, ty + 1.5, totalsW, 13, 2.5, 2.5, 'F')
  set(9.5, 'bold', [255, 255, 255])
  pdf.text(isDevis ? 'Total TTC' : doc.status === 'payee' ? 'Total payé TTC' : 'Net à payer TTC', tx + 4, ty + 9.6)
  set(13, 'bold', [255, 255, 255])
  pdf.text(euro(t.ttc), A4_W - M - 4, ty + 9.9, { align: 'right' })
  const totalsEnd = ty + 15

  // Colonne de gauche.
  const leftW = tx - M - 8
  let ly = y
  if ((doc.vat_rate ?? 20) < 20) {
    const note = isDevis
      ? "En signant ce devis, le client accepte les conditions générales ci-après et certifie que les conditions d'application du taux réduit de TVA sont remplies (locaux d'habitation achevés depuis plus de deux ans, travaux éligibles)."
      : "Le client a attesté, sur le devis signé, que les conditions d'application du taux réduit de TVA sont remplies."
    set(7.2, 'normal', MUTED)
    const lines = pdf.splitTextToSize(note, leftW)
    pdf.text(lines, M, ly + 2)
    ly += lines.length * 3.2 + 5
  }
  // Devis : cadre « Bon pour accord » (ou signature déjà apposée).
  if (isDevis || doc.signature_data) {
    const boxH = 30
    pdf.setDrawColor(...LINE)
    pdf.setLineWidth(0.3)
    pdf.setLineDashPattern([1.2, 1], 0)
    pdf.roundedRect(M, ly, leftW, boxH, 2, 2, 'S')
    pdf.setLineDashPattern([], 0)
    set(7.2, 'bold', MUTED)
    pdf.text(isDevis ? 'BON POUR ACCORD' : 'SIGNATURE DU CLIENT', M + 4, ly + 5.5, { charSpace: 0.3 })
    if (doc.signature_data) {
      try {
        pdf.addImage(doc.signature_data, 'PNG', M + 4, ly + 8, 44, 19)
      } catch {
        // signature illisible : le cadre reste vide
      }
      if (doc.signed_at) {
        set(7.2, 'normal', MUTED)
        pdf.text(`Signé le ${frDate(doc.signed_at)}`, M + leftW - 4, ly + boxH - 3.5, { align: 'right' })
      }
    } else if (isDevis && doc.status === 'signe') {
      set(9, 'bold', GREEN)
      pdf.text(doc.signed_at ? `Accepté le ${frDate(doc.signed_at)}` : 'Accepté par le client', M + 4, ly + 13)
    } else {
      set(7.2, 'normal', MUTED)
      pdf.text(pdf.splitTextToSize('Date, signature et mention manuscrite « Bon pour accord »', leftW - 8), M + 4, ly + 10)
    }
    ly += boxH + 4
  }

  let cy = Math.max(ly, totalsEnd) + 8

  // ===== Notes =====
  if (doc.notes && String(doc.notes).trim()) {
    const lines = (set(8.6, 'normal'), pdf.splitTextToSize(String(doc.notes).trim(), CONTENT_W))
    if (cy + 8 + lines.length * 4 > pageBottom) {
      pdf.addPage()
      cy = 20
    }
    set(6.8, 'bold', MUTED)
    pdf.text('NOTES', M, cy, { charSpace: 0.35 })
    set(8.6, 'normal', TEXT)
    pdf.text(lines, M, cy + 5)
    cy += 5 + lines.length * 4 + 6
  }

  // ===== Conditions générales : deux colonnes compactes =====
  if (clauses?.length) {
    // Hauteur estimée sur deux colonnes : si elles ne tiennent pas en entier
    // sous le document, elles passent ensemble sur une page dédiée (comme au
    // dos d'une facture papier) plutôt que d'être coupées entre deux pages.
    const estColW = (CONTENT_W - 8) / 2
    let estLines = 0
    for (const c of clauses) {
      set(7, 'bold')
      estLines += pdf.splitTextToSize(`00. ${c.title}`, estColW).length
      set(6.8, 'normal')
      estLines += pdf.splitTextToSize(c.body, estColW).length + 0.7
    }
    const estHeight = (estLines * 3.05) / 2 + 12
    if (cy + estHeight > pageBottom) {
      pdf.addPage()
      cy = 20
    }
    set(8.5, 'bold', INK)
    pdf.text('Conditions générales de vente', M, cy)
    cy += 5
    const colW = (CONTENT_W - 8) / 2
    const lh = 3.05
    let col = 0
    let x = M
    const top = cy
    let yy = cy
    const nextColumn = () => {
      if (col === 0) {
        col = 1
        x = M + colW + 8
        yy = top
      } else {
        pdf.addPage()
        col = 0
        x = M
        yy = 20
      }
    }
    clauses.forEach((c, idx) => {
      set(7, 'bold', TEXT)
      const titleLines = pdf.splitTextToSize(`${idx + 1}. ${c.title}`, colW)
      set(6.8, 'normal', MUTED)
      const bodyLines = pdf.splitTextToSize(c.body, colW)
      if (yy + (titleLines.length + Math.min(2, bodyLines.length)) * lh > pageBottom) nextColumn()
      set(7, 'bold', TEXT)
      for (const l of titleLines) {
        pdf.text(l, x, yy)
        yy += lh
      }
      set(6.8, 'normal', MUTED)
      for (const l of bodyLines) {
        if (yy > pageBottom) nextColumn()
        pdf.text(l, x, yy)
        yy += lh
      }
      yy += 2
    })
  }

  // ===== Pied de page sur chaque page : mentions légales + numéro de page =====
  drawFooters(pdf, footerLines)

  return pdf
}
