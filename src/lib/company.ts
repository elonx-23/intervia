import { companyLegalLines, legalClauses as sharedLegalClauses } from '../../shared/legal.mjs'

// Vide tant que les vrais réglages (Réglages → Entreprise, ou l'entreprise
// émettrice d'un document public) ne sont pas chargés : jamais de valeur de
// repli au nom d'Intervia, qui n'est que le logiciel. L'objet est ensuite MUTÉ en place (pas remplacé) par
// applyCompanySettings() une fois les vrais réglages chargés — tous les
// endroits qui lisent COMPANY.xxx au moment de l'affichage (pas à
// l'import) voient donc automatiquement la valeur à jour.
export const COMPANY = {
  name: '',
  legalForm: '',
  capital: '',
  address: '',
  siret: '',
  registration: '',
  vatNumber: '',
  naf: '',
  vatRegime: '',
  phone: '',
  email: '',
  logoUrl: '',
  // Mentions obligatoires des devis / factures (Réglages → Entreprise).
  insurance: '',
  mediator: '',
  devisFee: '',
}

export function applyCompanySettings(data: Partial<typeof COMPANY>) {
  Object.assign(COMPANY, data)
}

// Pied de page légal et conditions générales : un seul texte, partagé avec le
// serveur (shared/legal.mjs). Fonctions (pas des constantes) pour reprendre
// les réglages à jour à chaque appel.
export const legalFooterLines = (): string[] => companyLegalLines(COMPANY)
export const legalClauses = (): { title: string; body: string }[] => sharedLegalClauses(COMPANY)
