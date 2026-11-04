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
}

export function companyForTeam(teamId) {
  const saved = getSetting('company', teamId) ?? {}
  const company = { ...EMPTY_COMPANY, ...saved }
  if (!String(company.name ?? '').trim()) {
    company.name = db.prepare('SELECT name FROM teams WHERE id = ?').get(teamId)?.name ?? ''
  }
  return company
}

// Pied de page légal : uniquement les morceaux renseignés.
export function companyLegalLines(company) {
  const join = (parts) => parts.filter((p) => String(p ?? '').trim()).join(' — ')
  return [
    join([company.name, company.legalForm, company.address]),
    join([company.siret && `SIRET ${company.siret}`, company.vatNumber && `TVA ${company.vatNumber}`, company.naf && `NAF ${company.naf}`]),
    company.vatRegime,
  ].filter((l) => String(l ?? '').trim())
}
