import type { InterventionStatus } from '@/lib/interventions'

// Code couleur d'Intervia, en un seul endroit : une teinte par rubrique, et
// pour chaque statut la teinte qui dit « ce qu'il faut faire ».
//   ambre   = à traiter / en attente d'une action
//   bleu    = attribué, en route
//   violet  = devis (proposition commerciale)
//   cyan    = en cours, appels
//   vert    = réussi, signé, payé, terminé
//   rouge   = problème, retard, manqué
//   ardoise = archivé / clos

export type Tone = 'blue' | 'violet' | 'green' | 'cyan' | 'amber' | 'orange' | 'red' | 'slate'

export const SECTION_TONE = {
  interventions: 'blue',
  devis: 'violet',
  factures: 'green',
  appels: 'cyan',
  paiements: 'amber',
  techniciens: 'orange',
  clients: 'slate',
} as const satisfies Record<string, Tone>

export const INTERVENTION_TONE: Record<InterventionStatus, Tone> = {
  en_attente: 'amber',
  assignee: 'blue',
  acceptee: 'violet',
  en_cours: 'cyan',
  terminee: 'green',
  validee: 'green',
  facturee: 'slate',
}

export function documentTone(kind: 'devis' | 'facture', status: string): Tone {
  if (kind === 'devis') {
    if (status === 'signe') return 'green'
    if (status === 'envoye') return 'violet'
    if (status === 'expire') return 'red'
    return 'slate'
  }
  if (status === 'payee') return 'green'
  if (status === 'emise') return 'amber'
  return 'slate'
}

export function callTone(status: string): Tone {
  if (status === 'terminé') return 'green'
  if (status === 'en-cours') return 'cyan'
  if (status === 'manqué' || status === 'échoué') return 'red'
  return 'slate'
}

// Pastille d'icône (fond doux + icône de la teinte) — classes écrites en
// toutes lettres pour que Tailwind les génère.
export const TONE_ICON: Record<Tone, string> = {
  blue: 'bg-tone-blue-soft text-tone-blue-ink',
  violet: 'bg-tone-violet-soft text-tone-violet-ink',
  green: 'bg-tone-green-soft text-tone-green-ink',
  cyan: 'bg-tone-cyan-soft text-tone-cyan-ink',
  amber: 'bg-tone-amber-soft text-tone-amber-ink',
  orange: 'bg-tone-orange-soft text-tone-orange-ink',
  red: 'bg-tone-red-soft text-tone-red-ink',
  slate: 'bg-tone-slate-soft text-tone-slate-ink',
}

// Liseré coloré à gauche d'une carte (statut d'une fiche dans une liste).
export const TONE_EDGE: Record<Tone, string> = {
  blue: 'before:bg-tone-blue',
  violet: 'before:bg-tone-violet',
  green: 'before:bg-tone-green',
  cyan: 'before:bg-tone-cyan',
  amber: 'before:bg-tone-amber',
  orange: 'before:bg-tone-orange',
  red: 'before:bg-tone-red',
  slate: 'before:bg-tone-slate',
}

// Dates lisibles : « À l'instant », « Il y a 12 min », « Aujourd'hui 14:05 »,
// « Hier 09:30 », « Lun. 3 nov. », « 03/11/2025 ».
export function friendlyDate(iso: string | null | undefined) {
  if (!iso) return ''
  const d = new Date(iso)
  const nowMs = Date.now()
  const diffMin = Math.round((nowMs - d.getTime()) / 60000)
  const time = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
  if (diffMin >= 0 && diffMin < 1) return "À l'instant"
  if (diffMin >= 0 && diffMin < 60) return `Il y a ${diffMin} min`
  const today = new Date()
  const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  const days = Math.round((startOfDay(today) - startOfDay(d)) / 86400000)
  if (days === 0) return `Aujourd'hui ${time}`
  if (days === 1) return `Hier ${time}`
  if (days > 1 && days < 7) return d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })
  if (d.getFullYear() === today.getFullYear()) return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
  return d.toLocaleDateString('fr-FR')
}
