import OpenAI from 'openai'

import { db, now, uuid } from './db.mjs'
import { broadcast } from './events.mjs'
import { notifyAdmin } from './notify.mjs'
import { toFrenchNational } from './phone.mjs'
import { nextReference } from './routes/interventions.mjs'

// Corps de métier : mêmes libellés que les modèles d'articles du frontend
// (src/lib/itemPresets.ts), pour que les articles par défaut se proposent
// tout seuls quand on fait un devis depuis la fiche.
const TRADES = ['Serrurerie', 'Électricité', 'Plomberie', 'Autre']

const nullableString = { type: ['string', 'null'] }

const EXTRACTION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'is_intervention_request',
    'first_name',
    'last_name',
    'address',
    'postal_code',
    'city',
    'floor',
    'access_codes',
    'trade',
    'description',
  ],
  properties: {
    is_intervention_request: { type: 'boolean' },
    first_name: nullableString,
    last_name: nullableString,
    address: nullableString,
    postal_code: nullableString,
    city: nullableString,
    floor: nullableString,
    access_codes: nullableString,
    trade: { type: 'string', enum: TRADES },
    description: nullableString,
  },
}

const SYSTEM_PROMPT = `Tu analyses la transcription d'un appel téléphonique reçu par une entreprise de dépannage à domicile (serrurerie, électricité, plomberie) en France.

Détermine d'abord si l'appelant demande une NOUVELLE intervention. Réponds false pour : faux numéro, démarchage commercial, fournisseur, client qui rappelle au sujet d'une intervention déjà prévue, appel vide ou inaudible.

Puis extrais les informations du client. Règles strictes :
- N'invente rien. Une information qui n'est pas dite clairement dans l'appel vaut null.
- address : numéro et nom de la voie uniquement (sans code postal ni ville).
- floor : l'étage tel que dit (ex. "3e étage", "rez-de-chaussée"), sinon null.
- access_codes : tous les codes et infos d'accès dits (digicode, interphone, bâtiment, escalier, porte), regroupés en une ligne, sinon null.
- trade : le corps de métier du problème. Porte claquée, serrure, clé, blindage, rideau métallique = Serrurerie. Fuite, canalisation, WC, chauffe-eau, débouchage = Plomberie. Panne de courant, disjoncteur, prise, tableau électrique = Électricité. Sinon Autre.
- description : le problème en une ou deux phrases claires, à la troisième personne.`

// Appelé une fois la transcription d'un appel ENTRANT disponible. Si l'IA
// juge qu'il s'agit d'une demande d'intervention, crée la fiche, la relie à
// l'appel et prévient l'admin. Ne lève jamais : un échec d'extraction ne
// doit pas casser l'enregistrement de l'appel lui-même.
export async function createInterventionFromCall({ callId, transcription, openaiApiKey }) {
  const call = db.prepare('SELECT * FROM calls WHERE id = ?').get(callId)
  if (!call || call.direction !== 'inbound' || call.intervention_id || !transcription?.trim()) return null

  let extracted
  try {
    const openai = new OpenAI({ apiKey: openaiApiKey })
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0,
      response_format: {
        type: 'json_schema',
        json_schema: { name: 'fiche_intervention', strict: true, schema: EXTRACTION_SCHEMA },
      },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: transcription },
      ],
    })
    extracted = JSON.parse(completion.choices[0].message.content)
  } catch (e) {
    console.log(`[telephonie] extraction de fiche échouée pour l'appel ${callId} : ${e.message}`)
    return null
  }

  if (!extracted?.is_intervention_request) return null
  return insertInterventionFromExtraction(call, extracted)
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
       intervention_type, description, status, team_id, photos, reminder_count, created_by, created_at, source_call_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'en_attente', ?, '[]', 0, 'appel', ?, ?)`,
  ).run(
    id,
    reference,
    extracted.first_name ?? '',
    extracted.last_name ?? '',
    // Le téléphone vient TOUJOURS du vrai numéro appelant, jamais de l'IA.
    toFrenchNational(call.from_number),
    extracted.address ?? null,
    extracted.postal_code ?? null,
    extracted.city ?? null,
    extracted.floor ?? null,
    extracted.access_codes ?? null,
    trade,
    extracted.description ?? null,
    call.team_id,
    now(),
    call.id,
  )
  db.prepare('UPDATE calls SET intervention_id = ? WHERE id = ?').run(id, call.id)

  const who = [extracted.first_name, extracted.last_name].filter(Boolean).join(' ') || call.from_number || 'Client'
  notifyAdmin(
    call.team_id,
    'fiche_depuis_appel',
    'Nouvelle fiche créée depuis un appel',
    `${reference} — ${who}${trade ? ` — ${trade}` : ''}`,
    { intervention_id: id },
  )
  broadcast('interventions_changed', {}, call.team_id)
  broadcast('call_update', { id: call.id }, call.team_id)
  return id
}
