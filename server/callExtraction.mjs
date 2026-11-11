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

6) to_verify : liste courte (0 à 4 éléments) des informations douteuses que le patron doit vérifier avant d'envoyer le technicien : orthographe incertaine d'un nom, chiffre mal compris, adresse incomplète, contradiction dans l'appel. Ne signale PAS ce qui sera vérifié automatiquement ensuite (code postal manquant, nom complet de la commune, format du téléphone). Liste vide si tout est clair.`

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

  let extracted
  try {
    extracted = await extractFromTranscription(new OpenAI({ apiKey: openaiApiKey }), transcription)
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
  return insertInterventionFromExtraction(call, await finalizeExtraction(call, extracted))
}

// Contrôle et mise en forme de ce que l'IA a compris, avant d'écrire la
// fiche : téléphone au format 06 12 34 56 78, nom et prénom bien écrits,
// adresse confirmée par la Base Adresse Nationale (code postal et ville
// toujours remplis), étage et codes propres. Ce qui reste douteux est listé
// sur la fiche, à vérifier avant d'envoyer le technicien.
export async function finalizeExtraction(call, extracted) {
  const notes = [...(extracted.to_verify ?? [])].map((n) => String(n).trim()).filter(Boolean)

  // Téléphone : le vrai numéro appelant (fiable) ; un autre numéro dicté par
  // le client est signalé, ou pris s'il n'y a pas de numéro appelant.
  // Téléphone : le numéro où le client veut être rappelé s'il l'a dicté
  // (10 chiffres valides), sinon le vrai numéro appelant.
  const caller = formatFrenchPhone(toFrenchNational(call.from_number))
  const dictated = extracted.callback_phone ? formatFrenchPhone(extracted.callback_phone) : null
  let phone = isValidFrenchPhone(caller) ? caller : null
  if (dictated && isValidFrenchPhone(dictated)) {
    if (phone && phoneKey(dictated) !== phoneKey(phone)) notes.push(`Appel reçu d'un autre numéro : ${phone}.`)
    phone = dictated
  } else if (extracted.callback_phone) {
    notes.push(`Numéro dicté incomplet ou mal compris (« ${extracted.callback_phone} ») : à vérifier.`)
  }
  if (!phone) phone = caller // numéro masqué ou étranger : tel quel

  // Zone de l'entreprise (d'après son adresse) pour les communes du même nom.
  const companyCp = companyForTeam(call.team_id).address?.match(/\b(\d{2})\d{3}\b/)?.[1]
  const departments = !companyCp || IDF_DEPARTMENTS.includes(companyCp) ? IDF_DEPARTMENTS : [companyCp]
  const place = await checkAddress(
    { address: extracted.address, postal_code: extracted.postal_code, city: extracted.city },
    { departments },
  )
  // Adresse confirmée par la base nationale : les doutes de l'IA sur la ville
  // ou le code postal n'ont plus lieu d'être.
  if (place.verified) {
    for (let k = notes.length - 1; k >= 0; k--) if (/\b(ville|commune|code postal|arrondissement)\b/i.test(notes[k])) notes.splice(k, 1)
  }
  notes.push(...place.notes)
  if (!extracted.last_name && !extracted.first_name) notes.push("Nom du client non donné pendant l'appel.")

  return {
    ...extracted,
    first_name: formatPersonName(extracted.first_name),
    last_name: formatPersonName(extracted.last_name),
    phone,
    address: place.address,
    postal_code: place.postal_code,
    city: place.city,
    floor: formatFloor(extracted.floor),
    access_codes: formatAccessCodes(extracted.access_codes),
    notes: [...new Set(notes)].slice(0, 8),
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
