import OpenAI from 'openai'

import { companyForTeam } from './company.mjs'
import { db, now, uuid } from './db.mjs'
import { broadcast } from './events.mjs'
import { notifyAdmin } from './notify.mjs'
import {
  IDF_DEPARTMENTS,
  checkAddress,
  formatAccessCodes,
  formatFloor,
  formatFrenchPhone,
  formatPersonName,
  isValidFrenchPhone,
  phoneKey,
} from './contactCheck.mjs'
import { toFrenchNational } from './phone.mjs'
import { nextReference } from './routes/interventions.mjs'

// Corps de métier : mêmes libellés que les modèles d'articles du frontend
// (src/lib/itemPresets.ts), pour que les articles par défaut se proposent
// tout seuls quand on fait un devis depuis la fiche.
const TRADES = ['Serrurerie', 'Électricité', 'Plomberie', 'Autre']

const nullableString = { type: ['string', 'null'] }

// Modèle qui raisonne avant de répondre (bien plus fiable sur les noms, les
// adresses et les chiffres d'un appel), modifiable sans redéployer le code.
const INTAKE_MODEL = process.env.OPENAI_INTAKE_MODEL || 'gpt-5.4-mini'
const FALLBACK_MODEL = 'gpt-4.1-mini'

const EXTRACTION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'summary',
    'dispatch_confirmed',
    'first_name',
    'last_name',
    'name_spelled',
    'callback_phone',
    'address',
    'postal_code',
    'city',
    'floor',
    'access_codes',
    'trade',
    'description',
    'announced_price',
    'to_verify',
  ],
  properties: {
    summary: { type: 'string' },
    dispatch_confirmed: { type: 'boolean' },
    first_name: nullableString,
    last_name: nullableString,
    name_spelled: { type: 'boolean' },
    callback_phone: nullableString,
    address: nullableString,
    postal_code: nullableString,
    city: nullableString,
    floor: nullableString,
    access_codes: nullableString,
    trade: { type: 'string', enum: TRADES },
    description: nullableString,
    announced_price: { type: ['number', 'null'] },
    to_verify: { type: 'array', items: { type: 'string' } },
  },
}

const SYSTEM_PROMPT = `Tu es l'assistant de prise d'appel d'une entreprise de dépannage à domicile (serrurerie, électricité, plomberie) en Île-de-France. Tu reçois la transcription automatique d'un appel entrant et tu remplis la fiche d'intervention. Une fiche fausse envoie le technicien à la mauvaise adresse : sois rigoureux, relis toute la transcription avant de répondre, et vérifie chaque champ.

Tu peux recevoir deux écoutes du même appel : l'une sépare les interlocuteurs (A, B…), l'autre est souvent plus juste sur l'orthographe. Croise-les.

La transcription vient d'une reconnaissance vocale : elle contient des fautes (noms de rues, noms propres, chiffres). Corrige les erreurs évidentes de transcription (ex. « rue de vos girard » → « rue de Vaugirard », « boulevard Voltère » → « boulevard Voltaire ») mais n'invente jamais une information absente.

Le client se corrige souvent en cours d'appel, et le standard répète parfois les informations : garde TOUJOURS la dernière version confirmée par le client.

1) summary : résumé propre de l'appel (pas la transcription) : 2 à 4 lignes commençant par « - », à la troisième personne : qui appelle, le problème, ce qui est convenu (prix annoncé, délai, heure de passage), la suite à donner. Si l'appel ne contient que l'annonce d'accueil, du silence ou un raccroché, une seule ligne qui le dit.

2) dispatch_confirmed : true UNIQUEMENT s'il est clairement convenu qu'un technicien est envoyé chez le client (il accepte le passage, le prix ou le rendez-vous). false sinon : demande de prix ou de renseignement, client qui rappellera, refus, faux numéro, démarchage, fournisseur, suivi d'une intervention déjà prévue, appel vide ou inaudible.

3) Le client :
- first_name / last_name : prénom et nom de famille du CLIENT (jamais ceux du standardiste ou de l'entreprise). Si le client épelle (« D-U-P-O-N-T », « D comme Denis… »), reprends EXACTEMENT cette orthographe et mets name_spelled à true. Sinon, l'orthographe française la plus probable. Écriture : majuscule initiale, le reste en minuscules (Jean-Pierre, Dupont). « Monsieur Dupont » ou « Madame Martin » : seulement le nom de famille, first_name null.
- callback_phone : si le client dicte un numéro où le rappeler (ou demande à être rappelé sur un autre numéro), ses 10 chiffres (ex. 0612345678), sinon null. Ne devine aucun chiffre.

4) L'adresse de l'intervention (pas celle d'un autre lieu cité) :
- address : numéro + complément (bis, ter) + type de voie en toutes lettres + nom de la voie, ex. « 12 bis rue de la Roquette », « 3 avenue du Général-Leclerc ». Sans code postal ni ville.
- postal_code : 5 chiffres. À Paris, l'arrondissement donne le code postal : « Paris 15 » ou « 15e arrondissement » → 75015 ; 1er → 75001 ; 16e → 75016 (75116 pour le nord du 16e si dit). Si seule la ville est dite, null (complété ensuite automatiquement).
- city : nom officiel de la commune, avec majuscules et tirets (Saint-Denis, Boulogne-Billancourt, Neuilly-sur-Seine). « Paris » sans l'arrondissement.
- floor : « Rez-de-chaussée », « 1er étage », « 3e étage », « Sous-sol » ; ajoute la porte si elle est dite (« 3e étage, porte gauche »). Sinon null.
- access_codes : tous les codes et indications d'accès, exactement comme dits (chiffres et lettres sans en inventer). Un code dicté caractère par caractère s'écrit collé (« 4 5 1 2 B » → 4512B). Sur une ligne séparée par « · », ex. « Digicode 4512B · Interphone Martin · Bâtiment B · Escalier 2 ». Sinon null.

5) L'intervention :
- trade : Porte claquée, serrure, clé, cylindre, blindage, rideau métallique = Serrurerie. Fuite, canalisation, WC, évier, chauffe-eau, débouchage = Plomberie. Panne de courant, disjoncteur, prise, tableau électrique = Électricité. Sinon Autre.
- description : le problème en une ou deux phrases claires, à la troisième personne.
- announced_price : prix annoncé au client pendant l'appel, en euros (nombre seul) ; pour une fourchette, le montant le plus bas ; sinon null.

6) to_verify : liste courte (0 à 4 éléments) des informations douteuses (elles seront retranchées par une relecture) : orthographe incertaine d'un nom, chiffre mal compris, adresse incomplète, contradiction dans l'appel. Ne signale PAS ce qui sera vérifié automatiquement ensuite (code postal manquant, nom complet de la commune, format du téléphone). Liste vide si tout est clair.`

const parseExtraction = (completion) => JSON.parse(completion.choices[0].message.content)

async function extractFromTranscription(openai, transcription) {
  const request = {
    response_format: { type: 'json_schema', json_schema: { name: 'fiche_intervention', strict: true, schema: EXTRACTION_SCHEMA } },
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: transcription },
    ],
  }
  try {
    return parseExtraction(await openai.chat.completions.create({ ...request, model: INTAKE_MODEL, reasoning_effort: 'high' }))
  } catch (e) {
    // Modèle indisponible sur le compte : repli sur un modèle classique.
    console.log(`[telephonie] ${INTAKE_MODEL} indisponible (${e.message}), repli sur ${FALLBACK_MODEL}`)
    return parseExtraction(await openai.chat.completions.create({ ...request, model: FALLBACK_MODEL, temperature: 0 }))
  }
}

// Une ligne par point (« - … »), même si le modèle les a renvoyées collées.
export function formatSummary(text) {
  return String(text ?? '')
    .trim()
    .replace(/^-\s*/, '')
    .split(/\s*\n\s*-\s*|\s+-\s+(?=[A-ZÀ-Ý])/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => `- ${l}`)
    .join('\n')
}

// Appelé une fois la transcription d'un appel ENTRANT disponible : enregistre
// un résumé propre de l'appel, et ne crée la fiche d'intervention (reliée à
// l'appel, admin prévenu) QUE si l'envoi d'un technicien a été convenu. Ne lève jamais : un échec d'extraction ne
// doit pas casser l'enregistrement de l'appel lui-même.
export async function createInterventionFromCall({ callId, transcription, openaiApiKey }) {
  const call = db.prepare('SELECT * FROM calls WHERE id = ?').get(callId)
  if (!call || call.direction !== 'inbound' || !transcription?.trim()) return null
  db.prepare('UPDATE calls SET analyzed_at = ? WHERE id = ?').run(now(), callId)

  // Les deux écoutes du même appel (voir transcription.mjs), croisées par l'IA.
  const listening = call.transcription_alt
    ? `Écoute 1 (interlocuteurs séparés : A, B…) :\n${transcription}\n\nÉcoute 2 (même appel, autre transcription, souvent plus juste sur l'orthographe des noms, rues et codes) :\n${call.transcription_alt}`
    : transcription

  const openai = new OpenAI({ apiKey: openaiApiKey })
  let extracted
  try {
    extracted = await extractFromTranscription(openai, listening)
  } catch (e) {
    console.log(`[telephonie] analyse de l'appel ${callId} échouée : ${e.message}`)
    // Réessayée au passage suivant (ex. crédit de transcription épuisé).
    db.prepare('UPDATE calls SET analyzed_at = NULL WHERE id = ?').run(callId)
    return null
  }

  if (extracted?.summary) {
    db.prepare('UPDATE calls SET summary = ? WHERE id = ?').run(formatSummary(extracted.summary), callId)
    broadcast('call_update', { id: callId }, call.team_id)
  }
  if (!extracted?.dispatch_confirmed || call.intervention_id) return null
  return insertInterventionFromExtraction(call, await finalizeExtraction(call, extracted, { openai, listening }))
}

// Contrôle qualité : l'IA relit la fiche proposée en la comparant à l'appel
// et à la base nationale des adresses, et renvoie la fiche finale corrigée.
// Aucun humain ne valide ensuite : c'est elle qui tranche les doutes.
const REVIEW_FIELDS = [
  'first_name',
  'last_name',
  'callback_phone',
  'address',
  'postal_code',
  'city',
  'floor',
  'access_codes',
  'trade',
  'description',
  'announced_price',
]
const REVIEW_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [...REVIEW_FIELDS, 'corrections'],
  properties: {
    ...Object.fromEntries(REVIEW_FIELDS.map((k) => [k, EXTRACTION_SCHEMA.properties[k]])),
    corrections: { type: 'array', items: { type: 'string' } },
  },
}

const REVIEW_PROMPT = `Tu es le contrôle qualité de la prise d'appel d'une entreprise de dépannage à domicile en Île-de-France. Aucun humain ne relira la fiche : le technicien partira directement avec. Compare la fiche proposée à l'appel (une ou deux écoutes de la même conversation) et aux résultats de la base nationale des adresses, puis renvoie la fiche finale, corrigée.

Méthode : pour chaque champ, retrouve dans l'appel ce que le CLIENT a dit en dernier (pas le standardiste), et corrige la fiche si elle s'en écarte. Quand les deux écoutes diffèrent, choisis la version la plus cohérente avec le reste de l'appel.
- first_name / last_name : ceux du client (jamais ceux du standardiste ou de l'entreprise), pas inversés ; orthographe épelée s'il y en a une ; « Monsieur X » / « Madame X » = nom de famille seulement.
- callback_phone : numéro dicté par le client pour le rappeler (10 chiffres), sinon null.
- address / postal_code / city : la base nationale fait foi pour l'orthographe de la voie, le code postal et la ville. Si elle indique que le numéro existe dans un autre code postal, garde l'adresse qui existe, sauf si l'appel montre clairement un autre numéro (chiffre mal entendu).
- floor, access_codes : étage, porte, digicode, interphone, bâtiment, escalier — rien d'oublié, rien de déformé, rien d'inventé. Garde TOUJOURS le libellé de chaque code, caractères collés : « Digicode 4512B · Interphone Martin ».
- trade, description, announced_price : conformes à l'appel.
- Les points incertains signalés : tranche-les toi-même en choisissant la version la plus probable d'après l'appel.
- N'invente jamais : une information qui n'a pas été dite reste null.
- corrections : liste courte de ce que tu as corrigé par rapport à la fiche proposée (vide si rien).`

async function reviewFiche(openai, listening, fiche, place, doubts) {
  const completion = await openai.chat.completions.create({
    model: INTAKE_MODEL,
    reasoning_effort: 'high',
    response_format: { type: 'json_schema', json_schema: { name: 'fiche_finale', strict: true, schema: REVIEW_SCHEMA } },
    messages: [
      { role: 'system', content: REVIEW_PROMPT },
      {
        role: 'user',
        content: JSON.stringify(
          {
            appel: listening,
            fiche_proposee: Object.fromEntries(REVIEW_FIELDS.map((k) => [k, fiche[k] ?? null])),
            base_nationale_des_adresses: { adresse_confirmee: place.verified, remarques: place.notes },
            points_incertains: doubts,
          },
          null,
          1,
        ),
      },
    ],
  })
  return JSON.parse(completion.choices[0].message.content)
}

const sameAddress = (a, b) =>
  ['address', 'postal_code', 'city'].every(
    (k) =>
      String(a[k] ?? '')
        .trim()
        .toLowerCase() ===
      String(b[k] ?? '')
        .trim()
        .toLowerCase(),
  )

// Fiche finale, sans validation humaine :
// 1. adresse vérifiée dans la Base Adresse Nationale (code postal et ville
//    toujours remplis ; numéro trouvé ailleurs → l'adresse réelle) ;
// 2. relecture par l'IA (contrôle qualité) avec l'appel et la vérification
//    d'adresse : elle corrige et tranche les doutes ;
// 3. adresse revérifiée si la relecture l'a changée ;
// 4. téléphone 06 12 34 56 78 (numéro dicté, sinon numéro appelant), nom,
//    prénom, étage et codes mis en forme.
// `notes` garde la trace des corrections automatiques (journal interne).
export async function finalizeExtraction(call, extracted, { openai, listening } = {}) {
  const log = []
  const companyCp = companyForTeam(call.team_id).address?.match(/\b(\d{2})\d{3}\b/)?.[1]
  const departments = !companyCp || IDF_DEPARTMENTS.includes(companyCp) ? IDF_DEPARTMENTS : [companyCp]
  const check = (f) => checkAddress({ address: f.address, postal_code: f.postal_code, city: f.city }, { departments })

  let place = await check(extracted)
  log.push(...place.notes)
  let fiche = { ...extracted, address: place.address, postal_code: place.postal_code, city: place.city }

  if (openai && listening) {
    try {
      const reviewed = await reviewFiche(openai, listening, fiche, place, extracted.to_verify ?? [])
      log.push(...(reviewed.corrections ?? []).map((c) => `Relecture : ${c}`))
      const next = { ...fiche, ...Object.fromEntries(REVIEW_FIELDS.map((k) => [k, reviewed[k]])) }
      if (!sameAddress(next, fiche)) {
        place = await check(next)
        log.push(...place.notes)
      }
      fiche = { ...next, address: place.address, postal_code: place.postal_code, city: place.city }
    } catch (e) {
      console.log(`[telephonie] relecture de la fiche indisponible (${e.message}) : fiche gardée telle quelle`)
    }
  }

  // Téléphone : le numéro où le client veut être rappelé s'il l'a dicté
  // (10 chiffres valides), sinon le vrai numéro appelant.
  const caller = formatFrenchPhone(toFrenchNational(call.from_number))
  const dictated = fiche.callback_phone ? formatFrenchPhone(fiche.callback_phone) : null
  let phone = isValidFrenchPhone(caller) ? caller : null
  if (dictated && isValidFrenchPhone(dictated)) {
    if (phone && phoneKey(dictated) !== phoneKey(phone)) log.push(`Numéro dicté retenu (appel reçu du ${phone}).`)
    phone = dictated
  }
  if (!phone) phone = caller // numéro masqué ou étranger : tel quel

  return {
    ...fiche,
    first_name: formatPersonName(fiche.first_name),
    last_name: formatPersonName(fiche.last_name),
    phone,
    floor: formatFloor(fiche.floor),
    access_codes: formatAccessCodes(fiche.access_codes),
    notes: [...new Set(log)].slice(0, 12),
  }
}

// Séparé de l'appel OpenAI pour pouvoir être testé avec une extraction
// connue, sans dépendre du réseau ni d'une clé.
export function insertInterventionFromExtraction(call, extracted) {
  const id = uuid()
  const reference = nextReference()
  const trade = TRADES.includes(extracted.trade) && extracted.trade !== 'Autre' ? extracted.trade : ''

  db.prepare(
    `INSERT INTO interventions
      (id, reference, client_first_name, client_last_name, phone, address, postal_code, city, floor, access_codes,
       intervention_type, description, amount, status, team_id, photos, reminder_count, created_by, created_at, source_call_id, intake_notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'en_attente', ?, '[]', 0, 'appel', ?, ?, ?)`,
  ).run(
    id,
    reference,
    extracted.first_name ?? '',
    extracted.last_name ?? '',
    // Numéro appelant (ou numéro dicté si l'appel était masqué), au format 06 12 34 56 78.
    extracted.phone ?? formatFrenchPhone(toFrenchNational(call.from_number)),
    extracted.address ?? null,
    extracted.postal_code ?? null,
    extracted.city ?? null,
    extracted.floor ?? null,
    extracted.access_codes ?? null,
    trade,
    extracted.description ?? null,
    typeof extracted.announced_price === 'number' && extracted.announced_price > 0 ? extracted.announced_price : null,
    call.team_id,
    now(),
    call.id,
    extracted.notes?.length ? JSON.stringify(extracted.notes) : null,
  )
  db.prepare('UPDATE calls SET intervention_id = ? WHERE id = ?').run(id, call.id)

  const who = [extracted.first_name, extracted.last_name].filter(Boolean).join(' ') || toFrenchNational(call.from_number) || 'Un client'
  const where = extracted.city ? ` à ${extracted.city}` : ''
  notifyAdmin(
    call.team_id,
    'fiche_depuis_appel',
    '📞 Nouvelle intervention à envoyer',
    trade
      ? `${who} a appelé pour un dépannage en ${trade.toLowerCase()}${where}. La fiche ${reference} est prête.`
      : `${who} a appelé pour un dépannage${where}. La fiche ${reference} est prête.`,
    { intervention_id: id },
  )
  broadcast('interventions_changed', {}, call.team_id)
  broadcast('call_update', { id: call.id }, call.team_id)
  return id
}
