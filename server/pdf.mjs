import { readFileSync } from 'node:fs'
import path from 'node:path'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'

import { companyForTeam, companyLegalLines } from './company.mjs'
import { uploadsDir } from './routes/upload.mjs'
import { renderDocumentPdf } from '../shared/documentPdf.mjs'

// Miroir de src/lib/pdf.ts (design identique) mais côté serveur — utilisé
// pour joindre le PDF en pièce jointe aux emails, pas seulement pour le
// téléchargement côté client. Dupliqué plutôt que partagé : le client est en
// TypeScript avec des alias de chemin (@/lib/...), le serveur en JS simple,
// pas la peine de mettre en place un module partagé pour ~250 lignes.
//
// Les coordonnées de l'entreprise viennent de Réglages → Entreprise, sans
// aucune valeur de repli au nom du logiciel (voir company.mjs).
const getCompany = companyForTeam

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

const legalFooterLines = companyLegalLines

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
      body: `Sauf mention contraire, le règlement est dû à réception de la facture. ${company.name || "L'entreprise"} accepte les paiements par espèces, carte bancaire ou virement ; le paiement par chèque est accepté jusqu'à 100 €. Toute intervention réalisée en semaine entre 19h et 6h, ainsi que les week-ends et jours fériés, fait l'objet d'une majoration de 100 %.`,
    },
    {
      title: 'Pénalités de retard',
      body: `Conformément à l'article L441-10 du code de commerce, tout retard de paiement entraîne de plein droit l'application de pénalités calculées au taux d'intérêt légal en vigueur, ainsi qu'une indemnité forfaitaire pour frais de recouvrement de 40 €.`,
    },
    {
      title: 'Garantie',
      body: `L'intervention est garantie 6 mois, pièces et main d'œuvre, sauf dégorgement (garanti 7 jours). Une ouverture de porte ne garantit pas le bon état de la serrure, de la porte ni du bâti de la porte. L'intervention d'une tierce personne ou d'une autre entreprise sur les travaux réalisés annule immédiatement la garantie.`,
    },
    {
      title: 'Service après-vente',
      body: `Les demandes de service après-vente sont prises en charge sous 96h. Une réponse écrite est apportée sous 2 à 4 semaines.`,
    },
    {
      title: 'Responsabilité',
      body: `${company.name || "L'entreprise"} ne saurait être tenue responsable des dommages résultant de l'état antérieur des installations, de vices cachés préexistants, ou d'une utilisation non conforme des équipements après intervention.`,
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
  pdf.text(initials || 'IN', x + 7, y + 8.5, { align: 'center' })
}

// Devis / facture en pièce jointe d'email : même modèle que l'app
// (shared/documentPdf.mjs), avec les coordonnées de l'équipe émettrice.
export function generateDocumentPdfBuffer(doc) {
  const company = getCompany(doc.team_id)
  const pdf = renderDocumentPdf({
    jsPDF,
    autoTable,
    doc,
    company,
    logoDataUrl: readLogoDataUrl(company.logoUrl),
    clauses: legalClauses(company),
    footerLines: legalFooterLines(company),
  })
  return Buffer.from(pdf.output('arraybuffer'))
}

// Texte long du rapport : passe à la page suivante quand il le faut, et met en
// gras les titres de section (« Travaux réalisés : » seul sur sa ligne).
function writeReportText(pdf, text, x, startY, width) {
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
    pdf.setTextColor(...(isTitle ? DARK : [60, 60, 65]))
    if (isTitle) y += 2
    for (const line of pdf.splitTextToSize(raw.trim(), width)) {
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

export function generateReportPdfBuffer({ report, intervention, technicienName }) {
  const company = getCompany(intervention.team_id)
  const pdf = new jsPDF()
  const pageWidth = pdf.internal.pageSize.getWidth()
  const margin = 14

  drawLogo(pdf, margin, 14, readLogoDataUrl(company.logoUrl), companyInitials(company.name))
  pdf.setTextColor(...DARK)
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(15)
  pdf.text(company.name, margin + 18, 23)

  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(19)
  pdf.text("Rapport d'intervention", margin, 42)

  const client = [intervention.client_first_name, intervention.client_last_name].filter(Boolean).join(' ') || '-'
  const eventDate = intervention.completed_at ?? intervention.started_at ?? intervention.created_at

  const infoRows = [
    ['Référence', intervention.reference],
    ['Date', fmtDate(report.arrival_at ?? eventDate)],
    ...(report.arrival_at
      ? [["Heure d'arrivée", new Date(report.arrival_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' })]]
      : [['Heure', new Date(eventDate).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' })]]),
    ...(intervention.completed_at
      ? [["Fin d'intervention", new Date(intervention.completed_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' })]]
      : []),
    ['Technicien', technicienName],
    ['Client', client],
    ['Adresse', intervention.address ?? '-'],
    ["Type d'intervention", intervention.intervention_type || '-'],
  ]

  autoTable(pdf, {
    startY: 50,
    margin: { left: margin, right: margin },
    body: infoRows,
    styles: { fontSize: 9.5, cellPadding: 3, textColor: DARK, lineColor: GRAY_LINE, lineWidth: 0.2 },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 45 } },
  })
  let y = pdf.lastAutoTable.finalY + 10

  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(10)
  pdf.setTextColor(...DARK)
  pdf.text('Description', margin, y)
  y += 5
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(9)
  pdf.setTextColor(...GRAY_TEXT)
  const descLines = pdf.splitTextToSize(intervention.description || 'Aucune description.', pageWidth - margin * 2)
  pdf.text(descLines, margin, y)
  y += descLines.length * 4.5 + 10

  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(10)
  pdf.setTextColor(...DARK)
  pdf.text("Compte-rendu de l'intervention", margin, y)
  y += 6
  writeReportText(pdf, report.notes?.trim() || 'Aucune remarque.', margin, y, pageWidth - margin * 2)

  const footerY = pdf.internal.pageSize.getHeight() - 14
  for (let p = 1; p <= pdf.getNumberOfPages(); p++) {
    pdf.setPage(p)
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(7)
    pdf.setTextColor(...GRAY_TEXT)
    pdf.text(legalFooterLines(company).join(' — '), pageWidth / 2, footerY, { align: 'center', maxWidth: pageWidth - margin * 2 })
  }

  return Buffer.from(pdf.output('arraybuffer'))
}
