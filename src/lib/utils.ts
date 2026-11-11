import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Normalise pour une recherche insensible aux accents/majuscules ("Élodie"
// et "elodie" doivent matcher) — utilisé par les recherches Fiches/Devis/Factures.
export function normalizeSearch(s: string) {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
}

// Date locale au format YYYY-MM-DD — jamais toISOString().slice(0, 10), qui
// convertit en UTC et décale la date d'un jour la nuit dans un fuseau en
// avance sur UTC (Paris/Israël : minuit-3h locales tombent la veille en UTC).
export function isoLocalDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Montant au format français : « 1 471,00 € ».
export function formatEuro(n: number) {
  return `${n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`
}

/** Téléphone français au format « 06 12 34 56 78 » (sinon tel quel). */
export function formatPhone(raw: string | null | undefined) {
  if (!raw) return ''
  let d = String(raw).replace(/[^\d+]/g, '')
  if (d.startsWith('+33')) d = `0${d.slice(3)}`
  else if (d.startsWith('0033')) d = `0${d.slice(4)}`
  if (/^0[1-9]\d{8}$/.test(d)) return d.replace(/(\d{2})(?=\d)/g, '$1 ').trim()
  return String(raw).trim()
}
