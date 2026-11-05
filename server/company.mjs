import { db, getSetting } from './db.mjs'

// Coordonnées de l'entreprise émettrice (Réglages → Entreprise) — ce sont les
// SEULES qui apparaissent sur un devis, une facture, un email client ou une
// page publique. Jamais de valeur de repli au nom d'Intervia (le logiciel) :
// un champ non renseigné reste vide et n'est simplement pas affiché.
const EMPTY_COMPANY = {
  name: '',
  legalForm: '',
  address: '',
  siret: '',
  vatNumber: '',
  naf: '',
  vatRegime: '',
  phone: '',
  email: '',
  logoUrl: '',
  capital: '',
  registration: '',
  insurance: '',
  mediator: '',
  devisFee: '',
}

export function companyForTeam(teamId) {
  const saved = getSetting('company', teamId) ?? {}
  const company = { ...EMPTY_COMPANY, ...saved }
  if (!String(company.name ?? '').trim()) {
    company.name = db.prepare('SELECT name FROM teams WHERE id = ?').get(teamId)?.name ?? ''
  }
  return company
}

// Pied de page légal : partagé avec l'app (shared/legal.mjs).
export { companyLegalLines } from '../shared/legal.mjs'
