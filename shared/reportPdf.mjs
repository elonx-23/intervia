// Rapport d'intervention en PDF — même présentation que les devis et les
// factures (shared/pdfParts.mjs) : logo et coordonnées de l'entreprise,
// horaires, client et lieu, objet, compte-rendu par sections, détail des
// travaux et fournitures de la facture, photos, attestation et signatures.
// Pensé pour être remis tel quel à une assurance ou au propriétaire.

import {
  A4_H,
  A4_W,
  AMBER,
  AMBER_BG,
  CONTENT_W,
  GREEN,
  GROUP,
  INK,
  LINE,
  M,
  MUTED,
  PANEL,
  TEXT,
  ZEBRA,
  drawBrandHeader,
  drawCards,
  drawFooters,
  drawMetaRow,
  euro,
  fontSetter,
  frDate,
  frTime,
} from './pdfParts.mjs'

const TOP = 20 // haut de page à partir de la 2e page
const BOTTOM = A4_H - 26 // au-dessus du pied de page

/** « 1 h 25 », « 45 min » — durée entre l'arrivée et la fin (sinon null). */
export function reportDuration(from, to) {
  if (!from || !to) return null
  const min = Math.round((new Date(to) - new Date(from)) / 60000)
  if (!Number.isFinite(min) || min <= 0 || min > 24 * 60) return null
  const h = Math.floor(min / 60)
  return h ? `${h} h${min % 60 ? ` ${String(min % 60).padStart(2, '0')}` : ''}` : `${min} min`
}

const TITLE_LINE = /^[^-•\s].{1,70}:\s*$/

// Compte-rendu → sections { title, lines } (un titre est seul sur sa ligne et
// finit par « : », voir server/aiReport.mjs).
export function reportSections(notes) {
  const sections = []
  let current = { title: null, lines: [] }
  for (const raw of String(notes ?? '').split('\n')) {
    const line = raw.trim()
    if (TITLE_LINE.test(line)) {
      if (current.title || current.lines.some(Boolean)) sections.push(current)
      current = { title: line.replace(/\s*:\s*$/, ''), lines: [] }
    } else {
      current.lines.push(line)
    }
  }
  if (current.title || current.lines.some(Boolean)) sections.push(current)
  return sections.map((s) => ({ ...s, lines: trimBlank(s.lines) })).filter((s) => s.lines.length > 0)
}

function trimBlank(lines) {
  const out = [...lines]
  while (out.length && !out[0]) out.shift()
  while (out.length && !out[out.length - 1]) out.pop()
  return out
}

/**
 * @param {object} p
 * @param {any} p.jsPDF
 * @param {Function} p.autoTable
 * @param {object} p.report     rapport (champs de l'API)
 * @param {object|null} p.document  devis / facture lié (items décodés) ou null
 * @param {object} p.company    coordonnées de l'entreprise
 * @param {string|null} p.logoDataUrl
 * @param {{dataUrl:string,width:number,height:number}[]} p.photos  photos déjà réduites (JPEG)
 * @param {string[]} p.footerLines
 */
export function renderReportPdf({ jsPDF, autoTable, report, document, company, logoDataUrl, photos = [], footerLines }) {
  const pdf = new jsPDF({ unit: 'mm', format: 'a4' })
  const set = fontSetter(pdf)
  let y = 0
  const ensure = (h) => {
    if (y + h > BOTTOM) {
      pdf.addPage()
      y = TOP
    }
  }

  // ===== En-tête =====
  drawBrandHeader(pdf, { company, logoDataUrl, title: 'RAPPORT', subtitle: "D'INTERVENTION", number: report.number || '' })

  // ===== Date et horaires =====
  // Jamais le nom du technicien ni du gérant sur un document de l'app :
  // seule l'entreprise apparaît.
  const when = report.arrival_at ?? report.end_at ?? report.created_at
  const length = reportDuration(report.arrival_at, report.end_at)
  const cols = [[`Date de l'intervention`, frDate(when), M]]
  let x = M + 44
  for (const [label, value] of [
    ['Arrivée sur place', frTime(report.arrival_at)],
    ['Fin', frTime(report.end_at)],
    ['Durée', length],
  ]) {
    if (!value) continue
    cols.push([label, value, x])
    x += label.length > 10 ? 34 : 25
  }
  drawMetaRow(pdf, cols)

  // ===== Entreprise / client et lieu =====
  const client = [report.client_first_name, report.client_last_name].filter(Boolean).join(' ') || 'Client'
  const cityLine = [report.postal_code, report.city].filter(Boolean).join(' ')
  const cardY = 58
  const cardH = drawCards(pdf, cardY, [
    { label: 'ENTREPRISE', lines: [company.name, company.address, company.phone, company.email].filter(Boolean) },
    { label: "CLIENT · LIEU D'INTERVENTION", lines: [client, report.address, cityLine, report.phone, report.email].filter(Boolean) },
  ])
  y = cardY + cardH + 7

  // ===== Objet + motifs =====
  const objet = String(report.title || report.intervention_type || 'Intervention').trim()
  set(10.5, 'bold')
  const objetLines = pdf.splitTextToSize(objet, CONTENT_W - 12)
  const chips = [...(report.motifs ?? [])]
  const chipsH = chips.length ? 7.5 : 0
  const panelH = 9 + objetLines.length * 5 + chipsH + 3
  pdf.setFillColor(...PANEL)
  pdf.setDrawColor(...LINE)
  pdf.setLineWidth(0.25)
  pdf.roundedRect(M, y, CONTENT_W, panelH, 2.5, 2.5, 'FD')
  pdf.setFillColor(...INK)
  pdf.roundedRect(M, y, 1.6, panelH, 0.8, 0.8, 'F')
  set(6.8, 'bold', MUTED)
  pdf.text("OBJET DE L'INTERVENTION", M + 6, y + 6.2, { charSpace: 0.35 })
  const ref = [report.intervention_type, report.intervention?.reference && `Fiche ${report.intervention.reference}`]
    .filter(Boolean)
    .join(' · ')
  if (ref) {
    set(7.4, 'normal', MUTED)
    pdf.text(ref, A4_W - M - 5, y + 6.2, { align: 'right' })
  }
  set(10.5, 'bold', INK)
  objetLines.forEach((l, i) => pdf.text(l, M + 6, y + 11.8 + i * 5))
  if (chips.length) {
    let cx = M + 6
    const cy = y + 11.8 + objetLines.length * 5 - 1
    set(7.4, 'bold', AMBER)
    for (const chip of chips) {
      const w = pdf.getTextWidth(chip) + 6
      if (cx + w > A4_W - M - 4) break
      pdf.setFillColor(...AMBER_BG)
      pdf.roundedRect(cx, cy, w, 5.4, 2.7, 2.7, 'F')
      pdf.text(chip, cx + 3, cy + 3.75)
      cx += w + 2.5
    }
  }
  y += panelH + 9

  // ===== Compte-rendu =====
  const sectionTitle = (title, right) => {
    ensure(16)
    pdf.setFillColor(...INK)
    pdf.roundedRect(M, y - 3.6, 1.2, 4.6, 0.6, 0.6, 'F')
    set(9.6, 'bold', INK)
    pdf.text(title, M + 4, y)
    if (right) {
      set(7.8, 'normal', MUTED)
      pdf.text(right, A4_W - M, y, { align: 'right' })
    }
    y += 6
  }
  const textX = M + 4
  const textW = CONTENT_W - 4
  const sections = reportSections(report.notes)
  if (sections.length === 0) {
    sectionTitle('Compte-rendu')
    set(9.2, 'normal', MUTED)
    pdf.text('Aucun compte-rendu.', textX, y)
    y += 8
  }
  for (const s of sections) {
    sectionTitle(s.title || 'Compte-rendu')
    for (const raw of s.lines) {
      if (!raw) {
        y += 2.2
        continue
      }
      const bullet = /^[-•]\s+/.test(raw)
      const text = bullet ? raw.replace(/^[-•]\s+/, '') : raw
      set(9.2, 'normal', TEXT)
      const lines = pdf.splitTextToSize(text, bullet ? textW - 5 : textW)
      lines.forEach((l, i) => {
        ensure(4.6)
        if (bullet && i === 0) {
          pdf.setFillColor(...MUTED)
          pdf.circle(textX + 1.2, y - 1.15, 0.6, 'F')
        }
        set(9.2, 'normal', TEXT)
        pdf.text(l, bullet ? textX + 5 : textX, y)
        y += 4.6
      })
      y += 0.6
    }
    y += 5
  }

  // ===== Détail des travaux et fournitures (facture / devis lié) =====
  const items = document?.items ?? []
  if (document && items.length) {
    sectionTitle('Détail des travaux et fournitures', `${document.kind === 'facture' ? 'Facture' : 'Devis'} n° ${document.number}`)
    const services = items.filter((i) => i.itemType !== 'materiel')
    const materiel = items.filter((i) => i.itemType === 'materiel')
    const groups = [
      { label: 'PRESTATIONS', items: services },
      { label: 'MATÉRIEL ET FOURNITURES', items: materiel },
    ].filter((g) => g.items.length > 0)
    const body = []
    const meta = []
    let zebra = false
    for (const g of groups) {
      if (groups.length > 1) {
        body.push([{ content: g.label, colSpan: 3 }])
        meta.push({ group: true })
        zebra = false
      }
      for (const item of g.items) {
        body.push([
          item.description ? `${item.label}\n${item.description}` : item.label,
          String(item.quantity).replace('.', ','),
          euro(item.quantity * item.unitPrice),
        ])
        meta.push({ item, zebra })
        zebra = !zebra
      }
    }
    autoTable(pdf, {
      startY: y - 1,
      margin: { left: M, right: M, top: TOP, bottom: 24 },
      theme: 'plain',
      head: [['Désignation', 'Qté', 'Total HT']],
      body,
      styles: {
        font: 'helvetica',
        fontSize: 9,
        textColor: TEXT,
        cellPadding: { top: 3, bottom: 3, left: 3.5, right: 3.5 },
        valign: 'middle',
      },
      headStyles: {
        fillColor: INK,
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 8,
        cellPadding: { top: 3, bottom: 3, left: 3.5, right: 3.5 },
      },
      columnStyles: { 1: { halign: 'right', cellWidth: 16 }, 2: { halign: 'right', cellWidth: 32, fontStyle: 'bold' } },
      didParseCell: (data) => {
        if (data.section === 'head' && data.column.index > 0) data.cell.styles.halign = 'right'
        if (data.section !== 'body') return
        const m = meta[data.row.index]
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
      // Désignation : nom en gras, description en gris dessous.
      didDrawCell: (data) => {
        if (data.section === 'body') {
          pdf.setDrawColor(...LINE)
          pdf.setLineWidth(0.2)
          pdf.line(data.cell.x, data.cell.y + data.cell.height, data.cell.x + data.cell.width, data.cell.y + data.cell.height)
        }
        if (data.section !== 'body' || data.column.index !== 0) return
        const m = meta[data.row.index]
        if (!m?.item) return
        const cell = data.cell
        pdf.setFillColor(...(m.zebra ? ZEBRA : [255, 255, 255]))
        pdf.rect(cell.x + 0.2, cell.y + 0.2, cell.width - 0.4, cell.height - 0.6, 'F')
        const maxW = cell.width - 7
        const label = pdf.splitTextToSize(m.item.label, maxW)
        const desc = m.item.description ? pdf.splitTextToSize(m.item.description, maxW) : []
        let ty = cell.y + (cell.height - (label.length * 3.9 + desc.length * 3.5)) / 2 + 2.9
        set(9, 'bold', INK)
        for (const l of label) {
          pdf.text(l, cell.x + 3.5, ty)
          ty += 3.9
        }
        set(7.8, 'normal', MUTED)
        for (const l of desc) {
          pdf.text(l, cell.x + 3.5, ty)
          ty += 3.5
        }
      },
    })
    y = pdf.lastAutoTable.finalY + 6

    // Totaux, à droite.
    const ht = items.reduce((s, i) => s + i.quantity * i.unitPrice, 0)
    const remise = document.discount_value
      ? document.discount_type === 'percent'
        ? ht * (document.discount_value / 100)
        : document.discount_value
      : 0
    const base = Math.max(0, ht - remise)
    const ttc = base * (1 + (document.vat_rate ?? 0) / 100)
    const rows = [['Total HT', euro(ht)]]
    if (remise) rows.push([remise > 0 ? 'Remise' : 'Majoration', `${remise > 0 ? '-' : '+'}${euro(Math.abs(remise))}`])
    rows.push([`TVA ${String(document.vat_rate ?? 0).replace('.', ',')} %`, euro(ttc - base)])
    const paid = document.kind === 'facture' && document.status === 'payee'
    ensure(rows.length * 7.5 + 22)
    const w = 80
    const tx = A4_W - M - w
    for (const [label, value] of rows) {
      set(9, 'normal', MUTED)
      pdf.text(label, tx + 4, y + 4)
      set(9, 'bold', TEXT)
      pdf.text(value, A4_W - M - 4, y + 4, { align: 'right' })
      pdf.setDrawColor(...LINE)
      pdf.setLineWidth(0.2)
      pdf.line(tx, y + 7, A4_W - M, y + 7)
      y += 7.5
    }
    pdf.setFillColor(...INK)
    pdf.roundedRect(tx, y + 1.5, w, 12, 2.5, 2.5, 'F')
    set(9.2, 'bold', [255, 255, 255])
    pdf.text(paid ? 'Total payé TTC' : 'Total TTC', tx + 4, y + 9.1)
    set(12, 'bold', [255, 255, 255])
    pdf.text(euro(ttc), A4_W - M - 4, y + 9.4, { align: 'right' })
    y += 15
    if (paid) {
      set(7.8, 'bold', GREEN)
      const line = [
        'Facture acquittée',
        document.paid_at && `le ${frDate(document.paid_at)}`,
        document.payment_method && `par ${String(document.payment_method).toLowerCase()}`,
      ]
        .filter(Boolean)
        .join(' ')
      pdf.text(line, A4_W - M, y + 3, { align: 'right' })
      y += 5
    }
    y += 8
  }

  // ===== Photos =====
  const shots = photos.filter((p) => p?.dataUrl)
  if (shots.length) {
    sectionTitle('Photos', `${shots.length} photo${shots.length > 1 ? 's' : ''}`)
    const gap = 6
    const cellW = (CONTENT_W - gap) / 2
    const maxH = 64
    for (let i = 0; i < shots.length; i += 2) {
      const row = shots.slice(i, i + 2).map((p) => {
        const ratio = p.width && p.height ? p.width / p.height : 4 / 3
        let w = cellW
        let h = w / ratio
        if (h > maxH) {
          h = maxH
          w = h * ratio
        }
        return { ...p, w, h }
      })
      const rowH = Math.max(...row.map((p) => p.h)) + 8
      ensure(rowH)
      row.forEach((p, j) => {
        const cx = M + j * (cellW + gap) + (cellW - p.w) / 2
        try {
          pdf.addImage(p.dataUrl, 'JPEG', cx, y, p.w, p.h, undefined, 'FAST')
          pdf.setDrawColor(...LINE)
          pdf.setLineWidth(0.25)
          pdf.rect(cx, y, p.w, p.h, 'S')
        } catch {
          // image illisible : ignorée
        }
        set(7.2, 'normal', MUTED)
        pdf.text(`Photo ${i + j + 1}`, cx, y + p.h + 4)
      })
      y += rowH
    }
    y += 4
  }

  // ===== Attestation + signatures =====
  const lieu = [report.address, cityLine].filter(Boolean).join(', ')
  const attest = `Rapport établi le ${frDate(report.created_at || new Date().toISOString())}${company.name ? ` par ${company.name}` : ''}, à la suite de l'intervention réalisée le ${frDate(when)}${lieu ? ` au ${lieu}` : ''}. Il peut être remis à l'assurance et au propriétaire du logement.`
  set(8.4, 'normal', TEXT)
  const attestLines = pdf.splitTextToSize(attest, CONTENT_W)
  ensure(attestLines.length * 4 + 36)
  pdf.text(attestLines, M, y)
  y += attestLines.length * 4 + 4
  const boxW = (CONTENT_W - 6) / 2
  const boxH = 26
  ;[
    { label: "POUR L'ENTREPRISE", name: company.name || '', hint: 'Signature et cachet' },
    { label: 'LE CLIENT', name: client !== 'Client' ? client : '', hint: 'Date et signature, précédées de « Lu et approuvé »' },
  ].forEach((b, idx) => {
    const bx = M + idx * (boxW + 6)
    pdf.setDrawColor(...LINE)
    pdf.setLineWidth(0.3)
    pdf.setLineDashPattern([1.2, 1], 0)
    pdf.roundedRect(bx, y, boxW, boxH, 2, 2, 'S')
    pdf.setLineDashPattern([], 0)
    set(6.8, 'bold', MUTED)
    pdf.text(b.label, bx + 4, y + 5.5, { charSpace: 0.3 })
    if (b.name) {
      set(9, 'bold', INK)
      pdf.text(pdf.splitTextToSize(b.name, boxW - 8)[0], bx + 4, y + 11)
    }
    if (b.hint) {
      set(6.8, 'normal', MUTED)
      pdf.text(pdf.splitTextToSize(b.hint, boxW - 8), bx + 4, y + boxH - 5.5)
    }
  })
  y += boxH

  drawFooters(pdf, footerLines)
  return pdf
}
