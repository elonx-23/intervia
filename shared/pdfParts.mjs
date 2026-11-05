// Éléments communs aux PDF de l'app (devis, factures, rapports
// d'intervention) : même palette, même en-tête avec le logo de l'entreprise,
// mêmes encadrés, même pied de page — une seule identité visuelle.
//
// Polices intégrées de jsPDF (Helvetica, jeu WinAnsi) : accents, « € », « œ »
// et guillemets français passent ; les espaces insécables fines (que produit
// toLocaleString) ne passent PAS — les montants sont donc formatés à la main.

export const A4_W = 210
export const A4_H = 297
export const M = 16 // marge
export const CONTENT_W = A4_W - M * 2

// Palette sobre et lisible à l'impression.
export const INK = [15, 23, 42] // titres, en-tête de tableau, total
export const TEXT = [30, 41, 59]
export const MUTED = [100, 116, 139]
export const LINE = [226, 232, 240]
export const PANEL = [248, 250, 252]
export const ZEBRA = [250, 251, 253]
export const GROUP = [241, 245, 249]
export const GREEN = [21, 128, 61]
export const GREEN_BG = [220, 252, 231]
export const AMBER = [180, 83, 9]
export const AMBER_BG = [254, 243, 199]

/** 1618.1 → « 1 618,10 € » (espaces simples, jamais insécables). */
export function euro(n) {
  const [int, dec] = (Math.round((Number(n) || 0) * 100) / 100).toFixed(2).split('.')
  const sign = int.startsWith('-') ? '-' : ''
  const digits = int.replace('-', '').replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
  return `${sign}${digits},${dec} €`
}

/** « 2026-11-04 » ou ISO complet → « 04/11/2026 » (heure de Paris). */
export function frDate(value) {
  if (!value) return ''
  const s = String(value)
  const d = /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T12:00:00Z`) : new Date(s)
  return d.toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris' })
}

/** ISO → « 14:05 » (heure de Paris). */
export function frTime(value) {
  if (!value) return ''
  return new Date(value).toLocaleTimeString('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit' })
}

export function initials(name) {
  const words = String(name ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  if (words.length === 0) return '—'
  if (words.length === 1) return words[0].slice(0, 3).toUpperCase()
  return words
    .slice(0, 3)
    .map((w) => w[0])
    .join('')
    .toUpperCase()
}

/** set(taille, style, couleur) pour un PDF donné. */
export const fontSetter =
  (pdf) =>
  (size, style = 'normal', color = TEXT) => {
    pdf.setFont('helvetica', style)
    pdf.setFontSize(size)
    pdf.setTextColor(...color)
  }

/**
 * En-tête : logo (ou initiales) + entreprise à gauche, type et numéro du
 * document à droite, filet de séparation à 37 mm.
 */
export function drawBrandHeader(pdf, { company, logoDataUrl, title, subtitle = null, number }) {
  const set = fontSetter(pdf)
  let logoW = 0
  if (logoDataUrl) {
    try {
      const props = pdf.getImageProperties(logoDataUrl)
      const ratio = props.width / props.height || 1
      const h = Math.min(18, 34 / ratio)
      logoW = h * ratio
      pdf.addImage(logoDataUrl, M, 15 + (18 - h) / 2, logoW, h)
    } catch {
      logoW = 0
    }
  }
  if (!logoW) {
    pdf.setFillColor(...INK)
    pdf.roundedRect(M, 15, 16, 16, 3, 3, 'F')
    set(initials(company.name).length > 2 ? 7 : 8.5, 'bold', [255, 255, 255])
    pdf.text(initials(company.name), M + 8, 24.6, { align: 'center' })
    logoW = 16
  }
  const nameX = M + logoW + 5
  set(14, 'bold', INK)
  pdf.text(pdf.splitTextToSize(company.name || '', subtitle ? 84 : 92)[0] ?? '', nameX, 22.5)
  set(8, 'normal', MUTED)
  const sub = [company.legalForm, company.siret && `SIRET ${company.siret}`].filter(Boolean).join(' · ')
  if (sub) pdf.text(sub, nameX, 27.5)

  // Texte aligné à droite avec espacement des lettres : jsPDF n'en tient pas
  // compte dans align: 'right' (le mot dépassait la marge), on le calcule.
  const right = (text, y, charSpace) => {
    const w = pdf.getTextWidth(text) + charSpace * (text.length - 1)
    pdf.text(text, A4_W - M - w, y, { charSpace })
  }
  if (subtitle) {
    set(21, 'bold', INK)
    right(title, 21.5, 0.6)
    set(7.4, 'bold', MUTED)
    right(subtitle, 26.6, 1)
    set(10, 'bold', INK)
    pdf.text(`N° ${number}`, A4_W - M, 32.2, { align: 'right' })
  } else {
    set(21, 'bold', INK)
    right(title, 23, 0.6)
    set(10.5, 'bold', INK)
    pdf.text(`N° ${number}`, A4_W - M, 29.8, { align: 'right' })
  }

  pdf.setDrawColor(...LINE)
  pdf.setLineWidth(0.3)
  pdf.line(M, 37, A4_W - M, 37)
}

/** Rangée « LIBELLÉ / valeur » sous l'en-tête. cols : [[libellé, valeur, x]]. */
export function drawMetaRow(pdf, cols, y = 44) {
  const set = fontSetter(pdf)
  for (const [label, value, x] of cols) {
    set(6.8, 'bold', MUTED)
    pdf.text(label.toUpperCase(), x, y, { charSpace: 0.25 })
    set(10, 'bold', INK)
    pdf.text(value, x, y + 5.5)
  }
}

/** Deux encadrés côte à côte (émetteur / client…). Renvoie leur hauteur. */
export function drawCards(pdf, y, cards) {
  const set = fontSetter(pdf)
  const cardW = (CONTENT_W - 6) / 2
  set(9, 'normal')
  const wrapped = cards.map((c) => c.lines.flatMap((l) => pdf.splitTextToSize(String(l), cardW - 10)))
  const cardH = Math.max(...wrapped.map((w) => w.length)) * 4.4 + 13
  cards.forEach((c, idx) => {
    const x = M + idx * (cardW + 6)
    pdf.setFillColor(...PANEL)
    pdf.setDrawColor(...LINE)
    pdf.setLineWidth(0.25)
    pdf.roundedRect(x, y, cardW, cardH, 2.5, 2.5, 'FD')
    set(6.8, 'bold', MUTED)
    pdf.text(c.label, x + 5, y + 6.5, { charSpace: 0.35 })
    wrapped[idx].forEach((line, li) => {
      set(9, li === 0 ? 'bold' : 'normal', li === 0 ? INK : TEXT)
      pdf.text(line, x + 5, y + 12 + li * 4.4)
    })
  })
  return cardH
}

/** Pied de page sur chaque page : mentions légales + numéro de page. */
export function drawFooters(pdf, footerLines) {
  const set = fontSetter(pdf)
  const pages = pdf.getNumberOfPages()
  for (let p = 1; p <= pages; p++) {
    pdf.setPage(p)
    pdf.setDrawColor(...LINE)
    pdf.setLineWidth(0.25)
    pdf.line(M, A4_H - 18, A4_W - M, A4_H - 18)
    set(6.5, 'normal', MUTED)
    const text = (footerLines ?? []).join('  ·  ')
    const lines = pdf.splitTextToSize(text, CONTENT_W - 24)
    pdf.text(lines, M, A4_H - 13.5)
    pdf.text(`${p} / ${pages}`, A4_W - M, A4_H - 13.5, { align: 'right' })
  }
}
