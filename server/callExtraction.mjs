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
    'summary',
    'dispatch_confirmed',
    'first_name',
    'last_name',
    'address',
    'postal_code',
    'city',
    'floor',
    'access_codes',
    'trade',
    'description',
    'announced_price',
  ],
  properties: {
    summary: { type: 'string' },
    dispatch_confirmed: { type: 'boolean' },
    first_name: nullableString,
    last_name: nullableString,
    address: nullableString,
    postal_code: nullableString,
    city: nullableString,
    floor: nullableString,
    access_codes: nullableString,
    trade: { type: 'string', enum: TRADES },
    description: nullableString,
    announced_price: { type: ['number', 'null'] },
  },
}

const SYSTEM_PROMPT = `Tu analyses la transcription d'un appel téléphonique reçu par une entreprise de dépannage à domicile (serrurerie, électricité, plomberie) en France.

1) summary : un résumé propre de l'appel, PAS la transcription mot à mot. 2 à 4 lignes courtes commençant par « - », en français correct, à la troisième personne : qui appelle, le problème, ce qui a été convenu (prix annoncé, délai, heure de passage), la suite à donner. N'invente rien. Si l'appel ne contient que l'annonce d'accueil, du silence ou un raccroché, écris une seule ligne qui le dit (ex. « - Appel sans échange : l'appelant a raccroché pendant l'annonce d'accueil. »).

2) dispatch_confirmed : true UNIQUEMENT si, pendant l'appel, il est clairement convenu qu'un technicien est envoyé chez le client (le client accepte le passage, le prix ou le rendez-vous). false dans tous les autres cas : simple demande de prix ou de renseignement, client qui réfléchit ou rappellera, refus, faux numéro, démarchage, fournisseur, suivi d'une intervention déjà prévue, appel vide ou inaudible.

3) Puis extrais les informations du client. Règles strictes :
- N'invente rien. Une information qui n'est pas dite clairement dans l'appel vaut null.
- address : numéro et nom de la voie uniquement (sans code postal ni ville).
- floor : l'étage tel que dit (ex. "3e étage", "rez-de-chaussée"), sinon null.
- access_codes : tous les codes et infos d'accès dits (digicode, interphone, bâtiment, escalier, porte), regroupés en une ligne, sinon null.
- trade : le corps de métier du problème. Porte claquée, serrure, clé, blindage, rideau métallique = Serrurerie. Fuite, canalisation, WC, chauffe-eau, débouchage = Plomberie. Panne de courant, disjoncteur, prise, tableau électrique = Électricité. Sinon Autre.
- description : le problème en une ou deux phrases claires, à la troisième personne.
- announced_price : le prix annoncé au client pendant l'appel, en euros (nombre seul). Si une fourchette est annoncée, le montant le plus bas. Sinon null.`

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
       intervention_type, description, amount, status, team_id, photos, reminder_count, created_by, created_at, source_call_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'en_attente', ?, '[]', 0, 'appel', ?, ?)`,
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
    typeof extracted.announced_price === 'number' && extracted.announced_price > 0 ? extracted.announced_price : null,
    call.team_id,
    now(),
    call.id,
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
