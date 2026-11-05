// Types des mentions légales et CGV partagées (shared/legal.mjs).
export interface LegalCompany {
  name?: string
  legalForm?: string
  capital?: string
  address?: string
  siret?: string
  registration?: string
  vatNumber?: string
  naf?: string
  vatRegime?: string
  insurance?: string
  mediator?: string
  email?: string
  devisFee?: string
}
export function companyLegalLines(company: LegalCompany): string[]
export function devisFeeMention(company: LegalCompany): string
export const DEVIS_CONSENT: string
export function devisMentions(company: LegalCompany): string[]
export function factureMentions(): string[]
export function legalClauses(company: LegalCompany): { title: string; body: string }[]
