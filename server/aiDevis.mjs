import OpenAI from 'openai'

import { getTelephonyConfig } from './ovh.mjs'

// « Génération automatique » : l'admin colle le message d'un technicien
// (client, adresse, lignes avec prix, totaux) et reçoit un brouillon de devis
// propre — intitulés reformulés, MONTANTS INCHANGÉS, totaux recontrôlés.

const nullableString = { type: ['string', 'null'] }

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['first_name', 'last_name', 'phone', 'email', 'address', 'postal_code', 'city', 'items', 'prices_are_ttc', 'stated_vat_rate', 'stated_total_ht', 'stated_total_ttc', 'notes'],
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
        required: ['label', 'description', 'quantity', 'unit_price', 'item_type'],
        properties: {
          label: { type: 'string' },
          description: nullableString,
          quantity: { type: 'number' },
          unit_price: { type: 'number' },
          item_type: { type: 'string', enum: ['service', 'materiel'] },
        },
      },
    },
    prices_are_ttc: { type: 'boolean' },
    stated_vat_rate: { type: ['number', 'null'] },
    stated_total_ht: { type: ['number', 'null'] },
    stated_total_ttc: { type: ['number', 'null'] },
    notes: nullableString,
  },
}

const PROMPT = `Tu reçois le message d'un technicien d'une entreprise de dépannage (serrurerie, plomberie, électricité) en France, qui donne les infos d'un client et les lignes d'un devis. Les messages sont écrits vite, chacun à sa façon : ordre variable, fautes, abréviations, prix avant ou après l'intitulé, « : », « - », « € », « eur », lignes collées. Tu dois les déchiffrer pour produire un devis professionnel prêt à envoyer.

Client :
- Sépare prénom et nom (« Alouarti Hamza » : nom Alouarti, prénom Hamza ; en cas de doute, le premier mot est le nom de famille). « M. »/« Mme » ne font pas partie du nom.
- address : numéro et voie uniquement. postal_code (5 chiffres) et city séparément, même s'ils sont sur des lignes différentes ou collés à l'adresse ; corrige l'orthographe évidente de la ville (« Bezon » → « Bezons »). Paris 6 / Paris 6e → city Paris, postal_code 75006.
- phone : le numéro du client. email : son e-mail. N'invente rien : une info absente vaut null.

Lignes du devis :
- Une ligne par prestation, fourniture ou remise du message, dans le même ordre. N'en ajoute pas, n'en retire pas. Ignore ce qui n'est pas une ligne (salutations, dates, totaux, signature).
- unit_price : le montant EXACT écrit pour la ligne, sans aucune modification ni arrondi (« 1618,1 » = 1618.1). Si la ligne indique une quantité (« 2x », « x2 », « 2 cylindres à 120 »), quantity = cette quantité et unit_price = le prix unitaire ; si seul le total de la ligne est donné, quantity = 1. Une remise s'écrit en montant négatif avec le label « Remise ».
- Abréviations courantes : dep/dépl = Déplacement, MO = Main d'œuvre, cyl = Cylindre, ouv = Ouverture de porte, fourniture/pose.
- label : intitulé court et professionnel, avec majuscule, sans faute, fidèle à ce que dit la ligne. Tu ne reprends le label d'un article du CATALOGUE QUE si c'est exactement la même prestation (même objet, même cas) ; dans le doute, ou si l'article du catalogue est plus précis ou différent (ex. « porte claquée » alors que la ligne parle de perte de clés), écris ton propre intitulé. Ne transforme jamais une ligne en un autre type de prestation. Le prix reste TOUJOURS celui du message.
- description : une phrase claire qui précise la prestation, sans promesse inventée.
- item_type : « materiel » pour une pièce ou fourniture (cylindre, serrure, verrou, pièce), sinon « service ».

Prix et TVA :
- prices_are_ttc : true seulement si les prix des lignes sont clairement TTC (marqués TTC, ou leur somme égale le total TTC écrit). Sinon false (les prix sont HT par défaut).
- stated_vat_rate : le taux de TVA écrit (« TVA 10% » → 10), sinon null.
- stated_total_ht / stated_total_ttc : les totaux écrits, sinon null.
- notes : une info utile restante (délai, garantie, remarque), sinon null.`

const round2 = (n) => Math.round(n * 100) / 100

// « Ouverture de Porte Claquée » → « Ouverture de porte claquée » (les sigles en capitales restent).
function sentenceCase(label) {
  const words = String(label).trim().split(/\s+/)
  return words
    .map((w, i) => {
      if (i === 0) return w.charAt(0).toUpperCase() + w.slice(1)
      return /^[A-ZÀ-Ý][a-zà-ÿ'’-]+$/.test(w) ? w.toLowerCase() : w
    })
    .join(' ')
}

// Catalogue d'articles de l'app (intitulé + description), pour reprendre les
// mêmes libellés quand une ligne correspond.
function catalogText(catalog) {
  if (!Array.isArray(catalog)) return ''
  return catalog
    .slice(0, 150)
    .map((c) => `- ${String(c?.label ?? '').slice(0, 120)}${c?.description ? ` : ${String(c.description).slice(0, 200)}` : ''}`)
    .filter((l) => l.length > 2)
    .join('\n')
}
const VAT_RATES = [5.5, 10, 20]

export async function draftDevisFromText(teamId, text, catalog = []) {
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
      { role: 'user', content: `CATALOGUE des articles de l'entreprise :\n${catalogText(catalog) || '(vide)'}\n\nMESSAGE DU TECHNICIEN :\n${input}` },
    ],
  })
  const d = JSON.parse(completion.choices[0].message.content)

  const lines = d.items.filter((i) => i.label?.trim() && Number.isFinite(i.unit_price) && i.unit_price !== 0)
  const rawSum = lines.reduce((s, i) => s + (i.quantity > 0 ? i.quantity : 1) * i.unit_price, 0)

  // HT ou TTC : tranché par le calcul quand un total est écrit (plus fiable
  // que l'avis du modèle) — la somme des lignes égale au total HT ⇒ HT ;
  // égale au total TTC ⇒ TTC.
  const near = (a, b) => a != null && Math.abs(a - b) < 0.02
  if (near(d.stated_total_ht, rawSum)) d.prices_are_ttc = false
  else if (near(d.stated_total_ttc, rawSum)) d.prices_are_ttc = true
  const nearestRate = (ratio) => VAT_RATES.reduce((best, r) => (Math.abs(r - ratio) < Math.abs(best - ratio) ? r : best), 10)

  // TVA : celle écrite, sinon déduite des totaux écrits (TTC / HT), sinon 10 %.
  let vatRate = 10
  if (d.stated_vat_rate && VAT_RATES.includes(d.stated_vat_rate)) vatRate = d.stated_vat_rate
  else if (d.stated_total_ttc && (d.stated_total_ht || (!d.prices_are_ttc && rawSum > 0))) {
    vatRate = nearestRate((d.stated_total_ttc / (d.stated_total_ht ?? rawSum) - 1) * 100)
  }

  // Prix donnés TTC : convertis en HT (le devis est toujours saisi HT).
  const toHt = (price) => (d.prices_are_ttc ? round2(price / (1 + vatRate / 100)) : round2(price))
  const items = lines.map((i) => ({
    label: sentenceCase(i.label),
    description: i.description?.trim() || '',
    quantity: i.quantity > 0 ? i.quantity : 1,
    unitPrice: toHt(i.unit_price),
    itemType: i.item_type === 'materiel' ? 'materiel' : 'service',
  }))
  const totalHt = round2(items.reduce((s, i) => s + i.quantity * i.unitPrice, 0))

  const warnings = []
  if (d.prices_are_ttc) warnings.push(`Les prix du message étaient TTC : ils ont été convertis en HT (TVA ${String(vatRate).replace('.', ',')} %).`)
  if (items.length === 0) warnings.push("Aucune ligne avec un prix n'a été trouvée dans le message.")
  if (d.stated_total_ht != null && Math.abs(d.stated_total_ht - totalHt) > 0.01) {
    warnings.push(`Le total des lignes (${totalHt.toFixed(2)} € HT) ne correspond pas au total écrit (${d.stated_total_ht.toFixed(2)} € HT) : vérifie les lignes.`)
  }
  const ttc = round2(totalHt * (1 + vatRate / 100))
  if (d.stated_total_ttc != null && Math.abs(d.stated_total_ttc - ttc) > 0.05) {
    warnings.push(`Le TTC calculé (${ttc.toFixed(2)} €) diffère du TTC écrit (${d.stated_total_ttc.toFixed(2)} €).`)
  }

  // Civilités jamais prises pour un prénom ou un nom.
  const civ = /^(m|mr|mme|mlle|monsieur|madame|mademoiselle)\.?$/i
  let first = (d.first_name ?? '').trim()
  let last = (d.last_name ?? '').trim()
  if (civ.test(first)) first = ''
  if (civ.test(last)) last = ''
  first = first.replace(/^(m|mr|mme|mlle|monsieur|madame)\.?\s+/i, '')
  last = last.replace(/^(m|mr|mme|mlle|monsieur|madame)\.?\s+/i, '')

  return {
    clientFirstName: first,
    clientLastName: last,
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
