// Mise en forme et vérification des coordonnées d'une fiche d'intervention
// (prise d'appel par l'IA, saisie à la main) : téléphone au format français,
// nom et prénom bien écrits, adresse confirmée par la Base Adresse Nationale
// (api-adresse.data.gouv.fr : gratuite, sans clé) qui donne TOUJOURS le code
// postal et la ville exacts.

/** « 0612345678 », « +33 6 12… », « 06.12… » → « 06 12 34 56 78 ». Sinon tel quel. */
export function formatFrenchPhone(raw) {
  if (!raw) return null
  const s = String(raw).trim()
  let d = s.replace(/[^\d+]/g, '')
  if (d.startsWith('+33')) d = `0${d.slice(3)}`
  else if (d.startsWith('0033')) d = `0${d.slice(4)}`
  else if (/^33\d{9}$/.test(d)) d = `0${d.slice(2)}`
  if (/^0[1-9]\d{8}$/.test(d)) return d.replace(/(\d{2})(?=\d)/g, '$1 ').trim()
  return s || null
}

/** Clé de comparaison d'un numéro (9 derniers chiffres) : 06 12…, 0612…, +33 6 12… = même client. */
export const phoneKey = (raw) =>
  String(raw ?? '')
    .replace(/\D/g, '')
    .slice(-9)

export const isValidFrenchPhone = (raw) => /^0[1-9]( \d{2}){4}$/.test(formatFrenchPhone(raw) ?? '')

const PARTICLES = new Set(['de', 'du', 'des', 'le', 'la', 'les', 'van', 'von', 'da', 'di', 'del', 'della', 'ben', 'el'])

/** « jean-pierre DUPONT » → « Jean-Pierre Dupont » ; « de la fontaine » → « de La Fontaine ». */
export function formatPersonName(raw) {
  const s = String(raw ?? '')
    .replace(/\s+/g, ' ')
    .trim()
  if (!s) return ''
  const cap = (w) => (w ? w.charAt(0).toLocaleUpperCase('fr-FR') + w.slice(1).toLocaleLowerCase('fr-FR') : w)
  return s
    .split(' ')
    .map((word, i, all) => {
      const lower = word.toLocaleLowerCase('fr-FR')
      if (i < all.length - 1 && i > 0 && PARTICLES.has(lower)) return lower
      // d'Artagnan, O'Neil
      if (/^[dl]'/i.test(word) && word.length > 2) return `${lower.slice(0, 2)}${cap(word.slice(2))}`
      return word
        .split('-')
        .map((part) => part.split("'").map(cap).join("'"))
        .join('-')
    })
    .join(' ')
}

/** « 3 » → « 3e étage », « 1 » → « 1er étage », « rdc » → « Rez-de-chaussée ». */
export function formatFloor(raw) {
  const s = String(raw ?? '').trim()
  if (!s) return null
  const low = s.toLocaleLowerCase('fr-FR')
  if (/^(rdc|rez[ -]de[ -]chauss[ée]e)$/.test(low)) return 'Rez-de-chaussée'
  if (/^(ss|sous[ -]sol)$/.test(low)) return 'Sous-sol'
  const n = low.match(/^(\d{1,2})\s*(?:e|ème|eme|er|ère|°)?(?:\s*étage)?$/)
  if (n) return Number(n[1]) === 1 ? '1er étage' : `${Number(n[1])}e étage`
  return s.charAt(0).toLocaleUpperCase('fr-FR') + s.slice(1)
}

/** Codes d'accès sur une ligne propre : « Digicode 4512B · Interphone Martin · Bât. B ». */
export function formatAccessCodes(raw) {
  const s = String(raw ?? '')
    .replace(/\s*[;,|/]\s*/g, ' · ')
    .replace(/\s+/g, ' ')
    // Code dicté caractère par caractère : « 4 5 1 2 B » → « 4512B ».
    .replace(/\b(?:[0-9A-Za-z] ){2,}[0-9A-Za-z]\b/g, (m) => m.replace(/ /g, '').toUpperCase())
    .trim()
  return s
    ? s
        .split(' · ')
        // Un code seul (« 1937 », « 4512B ») est précisé comme tel.
        .map((part) => (/^[0-9A-Z]{3,8}$/.test(part) && /\d/.test(part) ? `Code ${part}` : part))
        .map((part) => part.charAt(0).toLocaleUpperCase('fr-FR') + part.slice(1))
        .join(' · ')
    : null
}

const norm = (s) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

const STREET_TYPES = new Set([
  'rue',
  'avenue',
  'boulevard',
  'place',
  'impasse',
  'allee',
  'quai',
  'chemin',
  'route',
  'square',
  'villa',
  'passage',
  'cours',
  'cite',
  'sentier',
  'voie',
  'esplanade',
  'promenade',
  'residence',
  'hameau',
])
const STREET_ABBREVIATIONS = {
  bd: 'boulevard',
  bld: 'boulevard',
  av: 'avenue',
  ave: 'avenue',
  pl: 'place',
  imp: 'impasse',
  all: 'allee',
  che: 'chemin',
  rte: 'route',
}

// Nom de la voie seul : sans numéro, type de voie ni articles.
const streetCore = (s) =>
  norm(s)
    .replace(/^\d+\s*(?:(?:bis|ter|quater|[a-d])\b)?\s*/, '')
    .split(' ')
    .filter(
      (w, i) =>
        !(i === 0 && (STREET_TYPES.has(w) || STREET_ABBREVIATIONS[w])) &&
        !['de', 'du', 'des', 'la', 'le', 'les', 'l', 'd', 'et'].includes(w),
    )
    .join('')

function levenshtein(a, b) {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    let prev = i - 1
    row[0] = i
    for (let j = 1; j <= b.length; j++) {
      const cur = row[j]
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1))
      prev = cur
    }
  }
  return row[b.length]
}

/** Ressemblance (0 à 1) entre deux noms de voie : « Voltère » ~ « Voltaire » ≈ 0,75. */
export function streetSimilarity(a, b) {
  const x = streetCore(a)
  const y = streetCore(b)
  if (!x || !y) return 0
  return 1 - levenshtein(x, y) / Math.max(x.length, y.length)
}

/** Type de voie (rue, avenue, boulevard…) d'une adresse, ou null. */
function streetType(s) {
  const word = norm(s)
    .replace(/^\d+\s*(?:(?:bis|ter|quater|[a-d])\b)?\s*/, '')
    .split(' ')[0]
  const type = STREET_ABBREVIATIONS[word] ?? word
  return STREET_TYPES.has(type) ? type : null
}

async function ban(query, params = {}) {
  const url = new URL('https://api-adresse.data.gouv.fr/search/')
  url.searchParams.set('q', query)
  url.searchParams.set('limit', '8')
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  // Le service répond parfois lentement : une seconde tentative avant d'abandonner.
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(7000) })
      if (!res.ok) throw new Error(`BAN ${res.status}`)
      return ((await res.json()).features ?? []).map((f) => f.properties)
    } catch (e) {
      if (attempt >= 2) throw e
    }
  }
}

// Départements de l'Île-de-France (zone par défaut des communes ambiguës).
export const IDF_DEPARTMENTS = ['75', '77', '78', '91', '92', '93', '94', '95']
const inArea = (p, departments) => departments.some((d) => String(p.postcode ?? '').startsWith(d))

/**
 * Vérifie l'adresse auprès de la Base Adresse Nationale et la complète.
 * @returns {{ address: string|null, postal_code: string|null, city: string|null, verified: boolean, notes: string[] }}
 */
export async function checkAddress({ address, postal_code, city }, { departments = IDF_DEPARTMENTS } = {}) {
  const notes = []
  const street = String(address ?? '').trim()
  let cp = String(postal_code ?? '').replace(/\D/g, '')
  if (cp && cp.length !== 5) cp = ''
  const town = String(city ?? '').trim()
  const result = { address: street || null, postal_code: cp || null, city: town || null, verified: false, notes }
  if (!street && !cp && !town) return result

  try {
    if (street) {
      const number = street.match(/^(\d+(?:\s?(?:bis|ter|quater|[a-d]))?)\b/i)?.[1]?.replace(/\s+/g, ' ')
      const sameNumber = (c) =>
        c.housenumber && number && c.housenumber.replace(/\s/g, '').toLowerCase() === number.replace(/\s/g, '').toLowerCase()
      const clientType = streetType(street)
      const candidates = await ban([street, cp, town].filter(Boolean).join(' '))
      const usable = candidates.filter((p) => ['housenumber', 'street', 'locality'].includes(p.type))
      // Bonus quand la commune ou le code postal dits par le client concordent ;
      // malus quand le type de voie diffère (rue ≠ boulevard).
      const scored = usable
        .map((p) => {
          let score = p.score ?? 0
          if (cp && p.postcode === cp) score += 0.15
          if (town && norm(p.city).includes(norm(town).split(' ')[0])) score += 0.1
          if (inArea(p, departments)) score += 0.1
          const type = streetType(p.street || p.name)
          if (clientType && type && type !== clientType) score -= 0.3
          return { p, score }
        })
        .sort((a, b) => b.score - a.score)
      // Une faute de frappe se corrige (« Voltère » → « Voltaire »), mais une
      // AUTRE rue ne remplace jamais celle dite par le client.
      const best = scored.find((c) => streetSimilarity(street, c.p.street || c.p.name) >= 0.6)
      const lookalike = scored[0] && scored[0] !== best && scored[0].score >= 0.6 ? scored[0].p : null
      if (!best && lookalike) {
        notes.push(`Rue non trouvée dans la base des adresses (la plus proche : ${lookalike.label}) : gardée telle que dite.`)
      }
      if (best && best.score >= 0.6) {
        const p = best.p
        // Rue trouvée mais pas le numéro : on garde le numéro dit par le client.
        result.address = p.type === 'housenumber' ? p.name : number ? `${number} ${p.name}` : p.name || street
        result.postal_code = p.postcode || result.postal_code
        result.city = p.city || result.city
        result.verified = p.type === 'housenumber'
        if (cp && p.postcode !== cp) notes.push(`Code postal corrigé : ${cp} → ${p.postcode} (d'après l'adresse).`)
        if (p.type !== 'housenumber') {
          // Ce numéro existe peut-être sur la même voie, dans un autre code
          // postal (ex. une longue rue de Paris à cheval sur deux arrondissements).
          let elsewhere = null
          if (number) {
            const wide = await ban([street, town || p.city].filter(Boolean).join(' '))
            elsewhere = wide.find(
              (c) =>
                c.type === 'housenumber' &&
                sameNumber(c) &&
                norm(c.street) === norm(p.street || p.name) &&
                c.postcode !== p.postcode &&
                (c.score ?? 0) >= 0.7,
            )
          }
          if (elsewhere) {
            // Une adresse qui existe vaut mieux qu'une combinaison introuvable :
            // c'est l'adresse réelle qui est retenue (la relecture par l'IA peut
            // encore trancher autrement si l'appel montre un autre numéro).
            result.address = elsewhere.name
            result.postal_code = elsewhere.postcode
            result.city = elsewhere.city
            result.verified = true
            notes.push(
              `Le ${elsewhere.name} se trouve dans le ${elsewhere.postcode} ${elsewhere.city}, pas dans le ${p.postcode} dit par le client : adresse réelle retenue.`,
            )
          } else {
            notes.push(number ? `Numéro ${number} non confirmé dans la base des adresses.` : 'Numéro de rue non donné.')
          }
        }
        return result
      }
      if (!lookalike) notes.push('Adresse non trouvée dans la base nationale des adresses : gardée telle que dite.')
    }
    // Pas d'adresse confirmée : on complète au moins la ville et le code postal.
    if (cp || town) {
      const towns = await ban(cp && !town ? cp : [town, cp].filter(Boolean).join(' '), { type: 'municipality' })
      const fits = (p) => (!cp || p.postcode === cp) && (!town || norm(p.city).startsWith(norm(town).split(' ')[0]))
      // Communes du même nom (Neuilly…) : celles de la zone de l'entreprise d'abord.
      const ranked = towns
        .filter(fits)
        .sort((a, b) => Number(inArea(b, departments)) - Number(inArea(a, departments)) || (b.score ?? 0) - (a.score ?? 0))
      const match = ranked[0] ?? (cp ? null : towns[0])
      if (match && (match.score ?? 0) >= 0.4) {
        if (!result.postal_code) result.postal_code = match.postcode
        if (!result.city || norm(result.city) !== norm(match.city)) result.city = match.city
        const others = [...new Set(ranked.filter((p) => inArea(p, departments) && p.city !== match.city).map((p) => p.city))]
        if (!cp && town && others.length && norm(town) !== norm(match.city)) {
          notes.push(`Commune ambiguë : ${match.city} retenue (autres possibles : ${others.slice(0, 3).join(', ')}).`)
        }
      }
    }
  } catch (e) {
    console.log(`[adresse] vérification indisponible : ${e.message}`)
    notes.push('Adresse non vérifiée (service des adresses indisponible).')
  }
  if (!result.postal_code) notes.push('Code postal non donné.')
  if (!result.city) notes.push('Ville non donnée.')
  return result
}
