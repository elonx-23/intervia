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
