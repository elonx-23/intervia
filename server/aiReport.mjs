import OpenAI from 'openai'

import { db } from './db.mjs'
import { getTelephonyConfig } from './ovh.mjs'

// Rapport d'intervention rédigé par l'IA à partir de ce que l'app sait déjà :
// la fiche (motif, adresse, horaires), l'heure d'arrivée du technicien, le
// détail de la facture (sinon du devis) et le résumé de l'appel du client.
// Quand le motif évoque un sinistre (perte de clés, vandalisme, effraction…),
// le rapport est rédigé pour pouvoir servir à l'assurance.

// Motifs reconnus → consigne donnée à l'IA.
const MOTIFS = [
  {
    label: 'Perte de clés',
    test: /perte de (cl[eé]s?|clefs?)|cl[eé]s? perdues?|clefs? perdues?|perdu (ses|les|mes) cl/i,
    hint: "Perte de clés : préciser que l'accès a été rétabli et, si le cylindre a été remplacé, que les clés perdues ne permettent plus d'ouvrir. Recommander de conserver ce rapport et la facture.",
  },
  {
    label: 'Vol de clés',
    test: /vol de (cl[eé]s?|clefs?)|cl[eé]s? vol[ée]es?/i,
    hint: "Vol de clés : recommander le dépôt de plainte et la déclaration à l'assurance habitation, en joignant ce rapport et la facture.",
  },
  {
    label: 'Vandalisme',
    test: /vandal|d[ée]gradation|saccag|\btags?\b|tagu[ée]/i,
    hint: "Vandalisme : décrire factuellement les dégradations constatées et les travaux de remise en état. Recommander le dépôt de plainte et la déclaration à l'assurance, en joignant ce rapport et la facture.",
  },
  {
    label: 'Effraction',
    test: /effraction|cambriol|forc[ée]e?|tentative d.?intrusion|serrure forc/i,
    hint: "Effraction / cambriolage : décrire factuellement les traces constatées et la sécurisation réalisée. Recommander le dépôt de plainte et la déclaration à l'assurance dans les délais (en général 2 jours ouvrés après constat pour un vol), en joignant ce rapport et la facture.",
  },
  {
    label: 'Porte claquée',
    test: /porte claqu[ée]e|claqu[ée] la porte|enferm[ée] dehors|cl[eé]s? (à|a) l.?int[ée]rieur/i,
    hint: "Porte claquée : préciser la méthode d'ouverture si elle figure dans la facture (ex. ouverture fine sans dégât).",
  },
  {
    label: 'Clé cassée',
    test: /cl[eé] cass[ée]e|cass[ée]e dans la serrure/i,
    hint: 'Clé cassée : préciser l’extraction et l’état de la serrure ensuite, si la facture le permet.',
  },
  {
    label: 'Dégât des eaux',
    test: /d[ée]g[aâ]t des eaux|inondation|infiltration|fuite/i,
    hint: "Fuite / dégât des eaux : décrire l'origine identifiée si connue et la réparation. Recommander de déclarer le dégât des eaux à l'assurance si des dommages sont constatés.",
  },
  {
    label: 'Panne électrique',
    test: /court-?circuit|panne (de courant|électrique)|disjonct|plus de courant/i,
    hint: 'Panne électrique : décrire la cause trouvée et la remise en service, avec les consignes de sécurité utiles.',
  },
]

const euros = (n) => `${Number(n).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} €`
const dt = (iso) =>
  iso
    ? `${new Date(iso).toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris' })} à ${new Date(iso).toLocaleTimeString('fr-FR', {
        timeZone: 'Europe/Paris',
        hour: '2-digit',
        minute: '2-digit',
      })}`
    : null

function documentFor(interventionId) {
  const pick = (kind) =>
    db
      .prepare('SELECT * FROM documents WHERE intervention_id = ? AND kind = ? AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 1')
      .get(interventionId, kind)
  return pick('facture') ?? pick('devis') ?? null
}

function totals(doc) {
  const items = JSON.parse(doc.items || '[]')
  const ht = items.reduce((s, i) => s + i.quantity * i.unitPrice, 0)
  const remise = doc.discount_value ? (doc.discount_type === 'percent' ? ht * (doc.discount_value / 100) : doc.discount_value) : 0
  const base = ht - remise
  return { items, ht, ttc: base * (1 + doc.vat_rate / 100), vat: doc.vat_rate, remise }
}

export function detectMotifs(text) {
  return MOTIFS.filter((m) => m.test.test(text))
}

export async function draftReport({ teamId, interventionId, arrivalAt, technicienName, extraNotes }) {
  const apiKey = getTelephonyConfig(teamId).openaiApiKey
  if (!apiKey) throw Object.assign(new Error("La rédaction automatique n'est pas activée."), { status: 400 })

  const i = db.prepare('SELECT * FROM interventions WHERE id = ? AND team_id = ?').get(interventionId, teamId)
  if (!i) throw Object.assign(new Error('Intervention introuvable.'), { status: 404 })
  const doc = documentFor(i.id)
  const call = db.prepare('SELECT summary FROM calls WHERE intervention_id = ? AND summary IS NOT NULL ORDER BY started_at DESC LIMIT 1').get(i.id)

  const facts = []
  facts.push(`Référence : ${i.reference}`)
  facts.push(`Client : ${[i.client_first_name, i.client_last_name].filter(Boolean).join(' ') || 'non renseigné'}`)
  facts.push(`Adresse : ${[i.address, [i.postal_code, i.city].filter(Boolean).join(' ')].filter(Boolean).join(', ') || 'non renseignée'}`)
  if (i.floor || i.access_codes) facts.push(`Accès : ${[i.floor && `étage ${i.floor}`, i.access_codes].filter(Boolean).join(', ')}`)
  facts.push(`Corps de métier : ${i.intervention_type || 'non précisé'}`)
  facts.push(`Motif indiqué sur la fiche : ${i.description || 'non renseigné'}`)
  facts.push(`Technicien : ${technicienName}`)
  facts.push(`Demande reçue : ${dt(i.created_at)}`)
  const arrival = arrivalAt || i.started_at
  if (arrival) facts.push(`Arrivée du technicien sur place : ${dt(arrival)}`)
  if (i.completed_at) facts.push(`Fin de l'intervention : ${dt(i.completed_at)}`)
  if (call?.summary) facts.push(`Résumé de l'appel du client :\n${call.summary}`)

  let motifText = `${i.description ?? ''} ${call?.summary ?? ''} ${extraNotes ?? ''}`
  if (doc) {
    const t = totals(doc)
    const lines = t.items.map(
      (it) =>
        `- ${it.label}${it.description ? ` (${it.description})` : ''}${it.quantity !== 1 ? ` × ${it.quantity}` : ''} : ${euros(it.quantity * it.unitPrice)} HT${it.itemType === 'materiel' ? ' [matériel]' : ''}`,
    )
    facts.push(`${doc.kind === 'facture' ? 'Facture' : 'Devis'} ${doc.number} :\n${lines.join('\n')}`)
    if (t.remise) facts.push(`Remise : ${euros(t.remise)}`)
    facts.push(`Total : ${euros(t.ht - t.remise)} HT, TVA ${String(t.vat).replace('.', ',')} %, ${euros(t.ttc)} TTC`)
    motifText += ' ' + t.items.map((it) => `${it.label} ${it.description ?? ''}`).join(' ')
  } else {
    facts.push('Aucune facture ni devis rattaché à cette fiche.')
  }
  if (extraNotes?.trim()) facts.push(`Notes du technicien : ${extraNotes.trim()}`)

  const motifs = detectMotifs(motifText)

  const system = `Tu rédiges le rapport d'intervention d'une entreprise de dépannage (serrurerie, plomberie, électricité) en France, à remettre au client et utilisable auprès d'une assurance.

Règles :
- Français professionnel, phrases claires, à la troisième personne (« le technicien », « l'entreprise »).
- N'invente AUCUN fait : n'utilise que les informations fournies. Si une information manque, ne la mentionne pas.
- Les travaux réalisés et le matériel fourni viennent des lignes de la facture (ou du devis) : reformule-les proprement, sans changer les montants.
- Texte brut, sans markdown ni astérisques. Titres de section seuls sur leur ligne, terminés par « : ». Listes avec « - ».

Structure, dans cet ordre (omets une section sans contenu) :
Motif de l'intervention :
Horaires :
Constat à l'arrivée :
Travaux réalisés :
Matériel fourni :
Résultat :
Recommandations :
Montant de l'intervention :

Pour « Montant de l'intervention », indique le total TTC et le numéro de la facture (ou du devis).
${motifs.length > 0 ? `\nMotifs détectés, à prendre en compte :\n${motifs.map((m) => `- ${m.hint}`).join('\n')}` : ''}`

  const openai = new OpenAI({ apiKey })
  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    temperature: 0.2,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: facts.join('\n') },
    ],
  })
  const notes = String(completion.choices[0].message.content ?? '')
    .replace(/\*\*/g, '')
    .replace(/^#+\s*/gm, '')
    .replace(/[ \t]+$/gm, '')
    .trim()

  return {
    notes,
    motifs: motifs.map((m) => m.label),
    arrivalAt: arrival ?? null,
    document: doc ? { kind: doc.kind, number: doc.number } : null,
  }
}
