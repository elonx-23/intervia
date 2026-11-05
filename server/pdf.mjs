import { readFileSync } from 'node:fs'
import path from 'node:path'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'

import { companyForTeam, companyLegalLines } from './company.mjs'
import { uploadsDir } from './routes/upload.mjs'
import { renderDocumentPdf } from '../shared/documentPdf.mjs'
import { legalClauses } from '../shared/legal.mjs'

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


// Devis / facture en pièce jointe d'email : même modèle que l'app
// (shared/documentPdf.mjs), avec les coordonnées de l'équipe émettrice. Le
// rapport d'intervention, lui, est joint tel que composé par l'app (photos
// comprises, voir routes/reports.mjs).
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
