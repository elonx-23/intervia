import OpenAI from 'openai'

import { createInterventionFromCall } from './callExtraction.mjs'
import { db } from './db.mjs'
import { broadcast } from './events.mjs'
import { readLocalRecording } from './telnyx.mjs'

// Appels dont la transcription est en cours dans CE processus — évite de
// lancer deux fois Whisper (donc de payer deux fois) quand la synchro
// repasse pendant qu'une transcription longue tourne encore.
const inFlight = new Set()

// OVH publie parfois le fichier audio quelques instants après la fin de
// l'appel : un téléchargement raté sur un appel récent est réessayé à la
// prochaine synchro plutôt que marqué en erreur tout de suite.
const RETRY_WINDOW_MS = 15 * 60 * 1000

const TRANSCRIPTION_MODEL = process.env.OPENAI_TRANSCRIPTION_MODEL || 'gpt-4o-transcribe'
// Contexte donné au modèle de transcription (vocabulaire attendu).
const TRANSCRIPTION_CONTEXT =
  "Appel téléphonique à une entreprise de dépannage à domicile en Île-de-France (serrurerie, plomberie, électricité). Le client donne son nom (parfois épelé lettre par lettre), son numéro de téléphone, son adresse (numéro, rue, avenue, boulevard, code postal, ville ou arrondissement de Paris), l'étage, le digicode, l'interphone, le bâtiment. Porte claquée, serrure, cylindre, fuite, chauffe-eau, disjoncteur, tableau électrique."

// L'URL du fichier fournie par OVH est directement téléchargeable (pas
// d'authentification à envoyer, la signature des appels API ne s'y applique
// pas). Le format (mp3, wav…) est celui que renvoie OVH.
export async function downloadRecording(url) {
  // Enregistrement déjà copié sur le serveur (voir telnyx.mjs storeRecording).
  if (String(url).startsWith('local:')) return readLocalRecording(url)
  const res = await fetch(url, { signal: AbortSignal.timeout(60000) })
  if (!res.ok) throw new Error(`Téléchargement de l'enregistrement échoué (${res.status})`)
  const contentType = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase()
  let extension = 'mp3'
  if (/wav/.test(contentType) || /\.wav(\?|$)/i.test(url)) extension = 'wav'
  else if (/ogg/.test(contentType) || /\.ogg(\?|$)/i.test(url)) extension = 'ogg'
  const mimeByExtension = { mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg' }
  return { buffer: Buffer.from(await res.arrayBuffer()), contentType: mimeByExtension[extension], extension }
}

// Deux écoutes de l'appel en parallèle, que l'IA croise ensuite :
// - l'une sépare les voix (qui parle : le standard ou le client) ;
// - l'autre connaît le vocabulaire du métier (rues, digicodes, noms épelés)
//   et orthographie mieux.
// Si une écoute échoue, l'autre suffit ; si les deux échouent, Whisper.
async function listen(openai, audio) {
  const file = () => new File([audio.buffer], `appel.${audio.extension}`, { type: audio.contentType })
  const [diarized, prompted] = await Promise.allSettled([
    openai.audio.transcriptions.create({
      file: file(),
      model: 'gpt-4o-transcribe-diarize',
      response_format: 'diarized_json',
      chunking_strategy: 'auto',
      language: 'fr',
    }),
    openai.audio.transcriptions.create({ file: file(), model: TRANSCRIPTION_MODEL, language: 'fr', prompt: TRANSCRIPTION_CONTEXT }),
  ])
  if (diarized.status === 'rejected') console.log(`[telephonie] écoute avec interlocuteurs indisponible : ${diarized.reason?.message}`)
  if (prompted.status === 'rejected') console.log(`[telephonie] ${TRANSCRIPTION_MODEL} indisponible : ${prompted.reason?.message}`)
  const segments = diarized.status === 'fulfilled' ? (diarized.value.segments ?? []) : []
  // « A : … » / « B : … », une réplique par ligne (répliques voisines regroupées).
  const turns = []
  for (const seg of segments) {
    const text = String(seg.text ?? '').trim()
    if (!text) continue
    const last = turns[turns.length - 1]
    if (last && last.speaker === seg.speaker) last.text += ` ${text}`
    else turns.push({ speaker: seg.speaker, text })
  }
  const speakers = turns.length ? turns.map((t) => `${t.speaker} : ${t.text}`).join('\n') : null
  const text = prompted.status === 'fulfilled' ? prompted.value.text?.trim() || null : null
  if (speakers || text) return { main: speakers ?? text, alt: speakers && text ? text : null }
  const whisper = await openai.audio.transcriptions.create({
    file: file(),
    model: 'whisper-1',
    language: 'fr',
    prompt: TRANSCRIPTION_CONTEXT,
  })
  return { main: whisper.text, alt: null }
}

// Lancée en tâche de fond par la synchro des appels (jamais attendue par
// une requête HTTP). Les deux comptes (OVH, OpenAI) sont indépendants : sans
// clé OpenAI l'enregistrement reste écoutable mais sans texte, et la
// transcription se fera toute seule dès que la clé sera ajoutée.
export async function transcribeCallRecording({ callId, recordingUrl, openaiApiKey }) {
  if (!openaiApiKey || inFlight.has(callId)) return
  inFlight.add(callId)
  try {
    await transcribe(callId, recordingUrl, openaiApiKey)
  } finally {
    inFlight.delete(callId)
  }
}

async function transcribe(callId, recordingUrl, openaiApiKey) {
  db.prepare("UPDATE calls SET transcription_status = 'en_attente' WHERE id = ?").run(callId)
  const call = db.prepare('SELECT team_id, started_at, ended_at FROM calls WHERE id = ?').get(callId)

  try {
    const audio = await downloadRecording(recordingUrl).catch((e) => {
      const age = Date.now() - new Date(call?.ended_at ?? call?.started_at ?? Date.now()).getTime()
      const retryable = age < RETRY_WINDOW_MS
      db.prepare('UPDATE calls SET transcription_status = ? WHERE id = ?').run(retryable ? null : 'erreur', callId)
      e.handled = true
      throw e
    })

    const heard = await listen(new OpenAI({ apiKey: openaiApiKey }), audio)
    db.prepare("UPDATE calls SET transcription = ?, transcription_alt = ?, transcription_status = 'ok' WHERE id = ?").run(
      heard.main,
      heard.alt,
      callId,
    )
    if (call) broadcast('call_update', { id: callId }, call.team_id)
  } catch (e) {
    console.log(`[telephonie] transcription échouée pour l'appel ${callId} : ${e.message}`)
    if (!e.handled) db.prepare("UPDATE calls SET transcription_status = 'erreur' WHERE id = ?").run(callId)
    if (call) broadcast('call_update', { id: callId }, call.team_id)
    return
  }

  // Appel entrant uniquement (vérifié dans la fonction) : on tente d'en tirer
  // une fiche d'intervention complète, sans rien bloquer si ça échoue.
  const saved = db.prepare('SELECT transcription FROM calls WHERE id = ?').get(callId)
  await createInterventionFromCall({ callId, transcription: saved?.transcription, openaiApiKey })
}
