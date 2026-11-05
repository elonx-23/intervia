import OpenAI from 'openai'

import { db } from './db.mjs'
import { getTelephonyConfig } from './ovh.mjs'

// Rapport d'intervention rédigé par l'IA à partir de ce que l'app sait déjà :
// la fiche (motif, adresse, accès), l'heure d'arrivée et de fin, le détail de
// la facture (sinon du devis), le résumé de l'appel du client, les photos —
// plus les éléments ajoutés par l'entreprise (« tentative d'effraction »,
// « cylindre arraché »…). Le rapport doit pouvoir être remis tel quel à
// l'assurance et au propriétaire du logement.

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
    label: "Tentative d'effraction",
    test: /tentative d.?(effraction|cambriolage|intrusion|vol)/i,
    hint: "Tentative d'effraction : décrire factuellement les traces relevées (serrure, cylindre, porte ou encadrement endommagés…) uniquement si elles sont indiquées, puis la remise en sécurité. Recommander le dépôt de plainte et la déclaration à l'assurance habitation, en joignant ce rapport, les photos et la facture, et d'informer le propriétaire ou le syndic si le client est locataire.",
  },
  {
    label: 'Effraction',
    test: /effraction|cambriol|serrure forc|porte forc/i,
    hint: "Effraction / cambriolage : décrire factuellement les traces constatées et la sécurisation réalisée. Recommander le dépôt de plainte et la déclaration à l'assurance dans les délais (en général 2 jours ouvrés après constat pour un vol), en joignant ce rapport, les photos et la facture.",
  },
  {
    label: 'Vandalisme',
    test: /vandal|d[ée]gradation|saccag|\btags?\b|tagu[ée]/i,
    hint: "Vandalisme : décrire factuellement les dégradations constatées et les travaux de remise en état. Recommander le dépôt de plainte et la déclaration à l'assurance, en joignant ce rapport, les photos et la facture.",
  },
  {
    label: 'Porte claquée',
    test: /porte claqu[ée]e|claqu[ée] la porte|enferm[ée] dehors|cl[eé]s? (à|a) l.?int[ée]rieur/i,
    hint: "Porte claquée : préciser la méthode d'ouverture si elle figure dans la facture ou les éléments ajoutés (ex. ouverture fine sans dégât).",
  },
  {
    label: 'Clé cassée',
    test: /cl[eé] cass[ée]e|cass[ée]e dans la serrure/i,
    hint: 'Clé cassée : préciser l’extraction et l’état de la serrure ensuite, si les informations le permettent.',
  },
  {
    label: 'Serrure bloquée',
    test: /serrure (bloqu|gripp|coinc)|porte bloqu|cylindre bloqu/i,
    hint: 'Serrure bloquée : préciser la cause si elle est connue et la solution apportée (déblocage, remplacement).',
  },
  {
    label: 'Bris de glace',
    test: /bris de glace|vitre cass|vitrage cass|carreau cass|vitre bris/i,
    hint: "Bris de glace : décrire le vitrage concerné, la mise en sécurité et le remplacement. Recommander la déclaration à l'assurance (garantie bris de glace).",
  },
  {
    label: 'Dégât des eaux',
    test: /d[ée]g[aâ]t des eaux|inondation|infiltration|fuite/i,
    hint: "Fuite / dégât des eaux : décrire l'origine identifiée si elle est connue et la réparation. Recommander de déclarer le dégât des eaux à l'assurance si des dommages sont constatés, et de prévenir le propriétaire, le syndic ou le voisin concerné.",
  },
  {
    label: 'Panne électrique',
    test: /court-?circuit|panne (de courant|électrique)|disjonct|plus de courant/i,
    hint: 'Panne électrique : décrire la cause trouvée et la remise en service, avec les consignes de sécurité utiles.',
  },
]

export function detectMotifs(text) {
  const found = MOTIFS.filter((m) => m.test.test(text))
  // « Tentative d'effraction » prime sur « Effraction » (pas les deux).
  return found.some((m) => m.label === "Tentative d'effraction") ? found.filter((m) => m.label !== 'Effraction') : found
}

export const aiAvailable = (teamId) => Boolean(getTelephonyConfig(teamId).openaiApiKey)

const dt = (iso) =>
  iso
    ? `${new Date(iso).toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris' })} à ${new Date(iso).toLocaleTimeString('fr-FR', {
        timeZone: 'Europe/Paris',
        hour: '2-digit',
        minute: '2-digit',
      })}`
    : null

function duration(from, to) {
  const min = Math.round((new Date(to) - new Date(from)) / 60000)
  if (!Number.isFinite(min) || min <= 0 || min > 24 * 60) return null
  const h = Math.floor(min / 60)
  return h ? `${h} h${min % 60 ? ` ${String(min % 60).padStart(2, '0')}` : ''}` : `${min} min`
}

const parse = (value, fallback) => {
  try {
    return JSON.parse(value)
  } catch {
    return fallback
  }
}

/**
 * @param {object} p
 * @param {string} p.teamId
 * @param {object} p.report  rapport (colonnes de intervention_reports, déjà décodées)
 * @param {string} p.extra   éléments ajoutés par l'entreprise
 * @returns {Promise<{ title: string, notes: string, motifs: string[] }>}
 */
export async function draftReport({ teamId, report, extra }) {
  const apiKey = getTelephonyConfig(teamId).openaiApiKey
  if (!apiKey) throw Object.assign(new Error("La rédaction par l'IA n'est pas activée."), { status: 400 })

  const i = report.intervention_id
    ? db.prepare('SELECT * FROM interventions WHERE id = ? AND team_id = ?').get(report.intervention_id, teamId)
    : null
  const doc = report.document_id ? db.prepare('SELECT * FROM documents WHERE id = ? AND team_id = ?').get(report.document_id, teamId) : null
  const call = i
    ? db.prepare('SELECT summary FROM calls WHERE intervention_id = ? AND summary IS NOT NULL ORDER BY started_at DESC LIMIT 1').get(i.id)
    : null

  const facts = []
  facts.push(`Client : ${[report.client_first_name, report.client_last_name].filter(Boolean).join(' ') || 'non renseigné'}`)
  facts.push(
    `Adresse de l'intervention : ${[report.address, [report.postal_code, report.city].filter(Boolean).join(' ')].filter(Boolean).join(', ') || 'non renseignée'}`,
  )
  if (i?.floor || i?.access_codes)
    facts.push(`Accès : ${[i.floor && `étage ${i.floor}`, i.access_codes && 'code d’accès communiqué'].filter(Boolean).join(', ')}`)
  if (report.intervention_type) facts.push(`Corps de métier : ${report.intervention_type}`)
  if (i?.description) facts.push(`Motif indiqué sur la fiche : ${i.description}`)
  // Jamais de nom du technicien ni du gérant dans un document : on ne le
  // donne même pas à l'IA.
  if (i?.created_at) facts.push(`Demande reçue : ${dt(i.created_at)}`)
  if (report.arrival_at) facts.push(`Arrivée du technicien sur place : ${dt(report.arrival_at)}`)
  if (report.end_at) facts.push(`Fin de l'intervention : ${dt(report.end_at)}`)
  const length = report.arrival_at && report.end_at ? duration(report.arrival_at, report.end_at) : null
  if (length) facts.push(`Durée sur place : ${length}`)
  if (call?.summary) facts.push(`Résumé de l'appel du client :\n${call.summary}`)

  let motifText = `${i?.description ?? ''} ${call?.summary ?? ''} ${extra ?? ''} ${report.intervention_type ?? ''}`
  if (doc) {
    const items = parse(doc.items, [])
    const lines = items.map(
      (it) =>
        `- ${it.label}${it.description ? ` (${it.description})` : ''}${it.quantity !== 1 ? ` × ${String(it.quantity).replace('.', ',')}` : ''}${it.itemType === 'materiel' ? ' [matériel]' : ' [prestation]'}`,
    )
    facts.push(`Lignes de la ${doc.kind === 'facture' ? 'facture' : 'devis'} ${doc.number} :\n${lines.join('\n')}`)
    motifText += ' ' + items.map((it) => `${it.label} ${it.description ?? ''}`).join(' ')
  } else {
    facts.push('Aucune facture ni devis rattaché.')
  }
  const photos = report.photos?.length ?? 0
  if (photos)
    facts.push(
      `${photos} photo${photos > 1 ? 's' : ''} prise${photos > 1 ? 's' : ''} pendant l'intervention, jointe${photos > 1 ? 's' : ''} au rapport.`,
    )
  if (extra?.trim()) facts.push(`Éléments constatés et ajoutés par l'entreprise (faits avérés, à intégrer au rapport) :\n${extra.trim()}`)

  const motifs = detectMotifs(motifText)

  const system = `Tu rédiges le rapport d'intervention officiel d'une entreprise de dépannage (serrurerie, plomberie, électricité, vitrerie) en France. Il est remis au client et doit pouvoir être transmis tel quel à son assurance et au propriétaire du logement.

Règles :
- Français professionnel, factuel et précis, à la troisième personne (« le technicien », « l'entreprise »), au passé composé.
- N'écris JAMAIS le nom ou le prénom d'une personne de l'entreprise (technicien, gérant, salarié), même s'il apparaît dans les informations : écris « le technicien » ou « l'entreprise ». Désigne le client par « le client ».
- N'invente AUCUN fait : ni dégât, ni mesure, ni marque, ni cause. N'utilise que les informations fournies. Si une information manque, n'en parle pas.
- Les éléments ajoutés par l'entreprise sont des faits constatés : intègre-les clairement là où ils comptent (constat, travaux, recommandations).
- Les travaux et le matériel viennent des lignes de la facture (ou du devis) : reformule-les en phrases ou en liste propres (ex. « Ouverture de porte » → « Ouverture de la porte d'entrée »), sans citer de prix.
- Mentionne l'heure d'arrivée dans le constat si elle est connue. Si des photos sont jointes, signale-le dans le constat (« voir photos jointes »).
- Texte brut, sans markdown ni astérisques. Chaque titre de section seul sur sa ligne, terminé par « : ». Listes avec « - ».

Sections, dans cet ordre (omets une section sans contenu) :
Motif de l'intervention :
Constat à l'arrivée :
Travaux réalisés :
Matériel fourni :
État à la fin de l'intervention :
Recommandations :
${motifs.length > 0 ? `\nMotifs détectés, à prendre en compte :\n${motifs.map((m) => `- ${m.hint}`).join('\n')}\n` : ''}
Réponds uniquement en JSON : {"objet": "une ligne de 100 caractères maximum résumant l'intervention, ex. Ouverture de porte et remplacement du cylindre suite à une tentative d'effraction", "rapport": "le texte du rapport"}`

  const openai = new OpenAI({ apiKey })
  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    temperature: 0.2,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: facts.join('\n') },
    ],
  })
  const out = parse(completion.choices[0].message.content ?? '{}', {})
  const notes = String(out.rapport ?? '')
    .replace(/\*\*/g, '')
    .replace(/^#+\s*/gm, '')
    .replace(/[ \t]+$/gm, '')
    .trim()
  if (!notes) throw new Error('Réponse vide de l’IA')
  const title = String(out.objet ?? '')
    .replace(/\s+/g, ' ')
    .replace(/^["«\s]+|["»\s.]+$/g, '')
    .slice(0, 140)

  return { title, notes, motifs: motifs.map((m) => m.label) }
}
