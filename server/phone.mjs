// Formats de numéros : l'opérateur donne des numéros en 0033…, +33… ou 06…
// selon l'endroit, alors que toutes les fiches clients existantes sont au
// format français (0612345678) — et la liste Clients regroupe par numéro
// exact, donc sans conversion le même client apparaîtrait en double.

// Forme canonique stockée sur un appel : +33612345678.
export function toE164(raw) {
  if (!raw) return null
  const n = String(raw).replace(/[\s.\-()]/g, '')
  if (n.startsWith('+')) return n
  if (n.startsWith('00')) return `+${n.slice(2)}`
  if (/^0\d{9}$/.test(n)) return `+33${n.slice(1)}`
  return n
}

// Forme des fiches d'intervention : 0612345678. Tout ce qui n'est pas un
// numéro français (numéro masqué, étranger) reste tel quel.
export function toFrenchNational(number) {
  if (number && /^\+33\d{9}$/.test(number)) return `0${number.slice(3)}`
  return number ?? null
}
