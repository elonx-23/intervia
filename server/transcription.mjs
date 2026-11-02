import OpenAI from 'openai'

import { createInterventionFromCall } from './callExtraction.mjs'
import { db } from './db.mjs'
import { broadcast } from './events.mjs'

// Appelé en tâche de fond par le webhook d'enregistrement (jamais attendu
// par la réponse HTTP à Twilio, qui doit rester rapide) — télécharge
// l'enregistrement (authentifié avec les identifiants Twilio de l'équipe,
// l'URL seule ne suffit pas) puis l'envoie à Whisper. Les deux comptes
// (Twilio, OpenAI) sont indépendants : si la clé OpenAI n'est pas
// configurée, l'enregistrement reste écoutable mais sans texte.
export async function transcribeCallRecording({ callId, recordingUrl, accountSid, authToken, openaiApiKey }) {
  if (!openaiApiKey) {
    db.prepare("UPDATE calls SET transcription_status = NULL WHERE id = ?").run(callId)
    return
  }

  db.prepare("UPDATE calls SET transcription_status = 'en_attente' WHERE id = ?").run(callId)

  try {
    const audioRes = await fetch(`${recordingUrl}.mp3`, {
      headers: { Authorization: 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64') },
    })
    if (!audioRes.ok) throw new Error(`Téléchargement de l'enregistrement échoué (${audioRes.status})`)
    const audioBuffer = Buffer.from(await audioRes.arrayBuffer())

    const openai = new OpenAI({ apiKey: openaiApiKey })
    const transcription = await openai.audio.transcriptions.create({
      file: new File([audioBuffer], 'appel.mp3', { type: 'audio/mpeg' }),
      model: 'whisper-1',
      language: 'fr',
    })

    const call = db.prepare('SELECT team_id FROM calls WHERE id = ?').get(callId)
    db.prepare("UPDATE calls SET transcription = ?, transcription_status = 'ok' WHERE id = ?").run(
      transcription.text,
      callId,
    )
    if (call) broadcast('call_update', { id: callId }, call.team_id)
  } catch (e) {
    console.log(`[telephonie] transcription échouée pour l'appel ${callId} : ${e.message}`)
    db.prepare("UPDATE calls SET transcription_status = 'erreur' WHERE id = ?").run(callId)
    return
  }

  // Appel entrant uniquement (vérifié dans la fonction) : on tente d'en tirer
  // une fiche d'intervention complète, sans rien bloquer si ça échoue.
  const saved = db.prepare('SELECT transcription FROM calls WHERE id = ?').get(callId)
  await createInterventionFromCall({ callId, transcription: saved?.transcription, openaiApiKey })
}
