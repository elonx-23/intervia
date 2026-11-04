import OpenAI from 'openai'

import { getTelephonyConfig } from './ovh.mjs'

// « Génération automatique » : l'admin colle le message d'un technicien
// (client, adresse, lignes avec prix, totaux) et reçoit un brouillon de devis
// propre — intitulés reformulés, MONTANTS INCHANGÉS, totaux recontrôlés.

const nullableString = { type: ['string', 'null'] }

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['first_name', 'last_name', 'phone', 'email', 'address', 'postal_code', 'city', 'items', 'stated_total_ht', 'stated_total_ttc', 'notes'],
  properties: {
    first_name: nullableString,
    last_name: nullableString,
    phone: nullableString,
    email: nullableString,
    address: nullableString,
    postal_code: nullableString,
    city: nullableString,
    items: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['label', 'description', 'quantity', 'unit_price_ht', 'item_type'],
        properties: {
          label: { type: 'string' },
          description: nullableString,
          quantity: { type: 'number' },
          unit_price_ht: { type: 'number' },
          item_type: { type: 'string', enum: ['service', 'materiel'] },
        },
      },
    },
    stated_total_ht: { type: ['number', 'null'] },
    stated_total_ttc: { type: ['number', 'null'] },
    notes: nullableString,
  },
}

const PROMPT = `Tu reçois le message d'un technicien d'une entreprise de dépannage (serrurerie, plomberie, électricité) en France, qui donne les infos d'un client et les lignes d'un devis. Tu prépares un devis professionnel prêt à envoyer.

Client :
- Sépare prénom et nom (« Alouarti Hamza » : nom Alouarti, prénom Hamza ; en cas de doute, le premier mot est le nom de famille).
- address : numéro et voie uniquement. postal_code et city séparément ; corrige l'orthographe évidente de la ville (« Bezon » → « Bezons »).
- N'invente rien : une info absente vaut null.

Lignes du devis :
- Une ligne par prestation ou fourniture du message, dans le même ordre. N'en ajoute pas, n'en retire pas.
- unit_price_ht : le montant EXACT écrit par le technicien pour la ligne (considéré HT), sans aucune modification. quantity : 1 sauf quantité indiquée.
- label : intitulé court et professionnel, avec majuscule, sans faute (ex. « Déplacement », « Ouverture de porte en urgence », « Remplacement du cylindre »).
- description : une phrase claire et rassurante qui précise la prestation, sans promesse inventée (ex. pour l'ouverture : « Ouverture de porte spécialisée suite à une perte de clés, réalisée en urgence. »).
- item_type : « materiel » pour une pièce ou fourniture (cylindre, serrure, pièce), sinon « service ».

Totaux : stated_total_ht et stated_total_ttc sont les totaux écrits dans le message (nombres), sinon null. notes : toute info utile restante, sinon null.`

const round2 = (n) => Math.round(n * 100) / 100
const VAT_RATES = [5.5, 10, 20]

export async function draftDevisFromText(teamId, text) {
  const apiKey = getTelephonyConfig(teamId).openaiApiKey
  if (!apiKey) throw Object.assign(new Error("La génération automatique n'est pas activée."), { status: 400 })
  const input = String(text ?? '').trim().slice(0, 6000)
  if (input.length < 10) throw Object.assign(new Error('Colle le message du technicien.'), { status: 400 })

  const openai = new OpenAI({ apiKey })
  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    temperature: 0,
    response_format: { type: 'json_schema', json_schema: { name: 'devis', strict: true, schema: SCHEMA } },
    messages: [
      { role: 'system', content: PROMPT },
      { role: 'user', content: input },
    ],
  })
  const d = JSON.parse(completion.choices[0].message.content)

  const items = d.items
    .filter((i) => i.label?.trim() && Number.isFinite(i.unit_price_ht) && i.unit_price_ht !== 0)
    .map((i) => ({
      label: i.label.trim(),
      description: i.description?.trim() || '',
      quantity: i.quantity > 0 ? i.quantity : 1,
      unitPrice: round2(i.unit_price_ht),
      itemType: i.item_type === 'materiel' ? 'materiel' : 'service',
    }))
  const totalHt = round2(items.reduce((s, i) => s + i.quantity * i.unitPrice, 0))

  // TVA déduite des totaux écrits (TTC / HT), arrondie au taux légal le plus proche.
  let vatRate = 10
  const baseHt = d.stated_total_ht ?? totalHt
  if (d.stated_total_ttc && baseHt > 0) {
    const ratio = (d.stated_total_ttc / baseHt - 1) * 100
    vatRate = VAT_RATES.reduce((best, r) => (Math.abs(r - ratio) < Math.abs(best - ratio) ? r : best), 10)
  }

  const warnings = []
  if (d.stated_total_ht != null && Math.abs(d.stated_total_ht - totalHt) > 0.01) {
    warnings.push(`Le total des lignes (${totalHt.toFixed(2)} € HT) ne correspond pas au total écrit (${d.stated_total_ht.toFixed(2)} € HT) : vérifie les lignes.`)
  }
  const ttc = round2(totalHt * (1 + vatRate / 100))
  if (d.stated_total_ttc != null && Math.abs(d.stated_total_ttc - ttc) > 0.05) {
    warnings.push(`Le TTC calculé (${ttc.toFixed(2)} €) diffère du TTC écrit (${d.stated_total_ttc.toFixed(2)} €).`)
  }

  return {
    clientFirstName: d.first_name ?? '',
    clientLastName: d.last_name ?? '',
    phone: d.phone ?? '',
    email: d.email ?? '',
    address: d.address ?? '',
    postalCode: d.postal_code ?? '',
    city: d.city ?? '',
    items,
    vatRate,
    notes: d.notes ?? '',
    totals: { ht: totalHt, ttc },
    warnings,
  }
}
