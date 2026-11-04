import { db, now, uuid } from './db.mjs'
import { ensurePlatformIfNeeded, telnyx } from './telnyx.mjs'
import { UserError } from './telephonyNumbers.mjs'

// Achat de numéros chez l'opérateur « revendeur » (compte Intervia) : la
// commande est réglée par le crédit du compte, pas par l'admin — le numéro est
// actif en quelques secondes quand l'opérateur n'a pas de justificatif à
// vérifier. Rien n'est commandé sans que l'admin ait vu et confirmé le prix.

const PROVIDER = 'telnyx'
const E164_FR = /^\+33[1-9]\d{8}$/

function money(value) {
  const n = Number(value)
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0
}

async function search(zone, extra = {}) {
  const qs = new URLSearchParams({
    'filter[country_code]': 'FR',
    'filter[phone_number_type]': 'local',
    'filter[locality]': zone,
    'filter[features][]': 'voice',
    'filter[limit]': '50',
    ...extra,
  })
  const res = await telnyx('GET', `/available_phone_numbers?${qs}`)
  return (res.data ?? [])
    .filter((n) => E164_FR.test(n.phone_number))
    .map((n) => ({
      number: n.phone_number,
      premium: false,
      upfront: money(n.cost_information?.upfront_cost),
      monthly: money(n.cost_information?.monthly_cost),
      currency: n.cost_information?.currency || 'USD',
    }))
}

export async function availableNumbersTelnyx(zone) {
  if (!zone) throw new UserError('Choisis une ville.')
  const list = await search(zone)
  if (list.length === 0) throw new UserError(`Aucun numéro disponible à ${zone} pour l'instant : essaie une grande ville proche.`)
  return list
}

function checkChoice({ zone, specificNumber }) {
  if (!zone || typeof zone !== 'string') throw new UserError('Choisis une ville.')
  if (specificNumber && !E164_FR.test(specificNumber)) throw new UserError('Numéro invalide.')
}

// Le numéro doit sortir d'une recherche récente pour pouvoir être commandé :
// on le recherche donc à nouveau (prix à jour, toujours libre ?).
async function pick(choice) {
  const list = await search(choice.zone)
  const found = choice.specificNumber ? list.find((n) => n.number === choice.specificNumber) : list[0]
  if (!found) {
    throw new UserError(
      choice.specificNumber
        ? "Ce numéro n'est plus disponible. Choisis-en un autre."
        : `Aucun numéro disponible à ${choice.zone} pour l'instant.`,
    )
  }
  return found
}

function quoteOf(n) {
  const total = money(n.upfront + n.monthly)
  return {
    number: n.number,
    totalTtc: { value: total, currency: n.currency },
    totalHt: null,
    lines: [
      {
        label: 'Mise en service',
        recurring: false,
        total: { value: n.upfront, currency: n.currency },
      },
      {
        label: 'Abonnement du numéro',
        recurring: true,
        total: { value: n.monthly, currency: n.currency },
      },
    ],
  }
}

export async function quoteNumberTelnyx(teamId, choice) {
  checkChoice(choice)
  return quoteOf(await pick(choice))
}

const ordering = new Set()

export async function orderNumberTelnyx(teamId, choice, expectedTotal) {
  checkChoice(choice)
  if (ordering.has(teamId)) throw new UserError('Une commande est déjà en cours de traitement, patiente quelques secondes.')
  ordering.add(teamId)
  try {
    const n = await pick(choice)
    const quote = quoteOf(n)
    if (typeof expectedTotal !== 'number' || Math.abs(quote.totalTtc.value - expectedTotal) > 0.005) {
      throw new UserError('Le prix a changé. Vérifie-le puis confirme à nouveau.')
    }
    const { appId } = await ensurePlatformIfNeeded()
    const requirementGroupId = process.env.TELNYX_REQUIREMENT_GROUP_ID || undefined
    const order = (
      await telnyx('POST', '/number_orders', {
        phone_numbers: [
          {
            phone_number: n.number,
            ...(requirementGroupId ? { requirement_group_id: requirementGroupId } : {}),
          },
        ],
        connection_id: appId,
        customer_reference: `team:${teamId}`,
      })
    ).data

    const id = uuid()
    db.prepare(
      `INSERT INTO telephony_orders (id, team_id, kind, provider, order_id, status, label, specific_number, total_ttc, created_at, updated_at)
       VALUES (?, ?, 'number', ?, ?, 'en_cours', ?, ?, ?, ?, ?)`,
    ).run(
      id,
      teamId,
      PROVIDER,
      order.id,
      `Numéro ${n.number.replace(/^\+33(\d).*/, '0$1')} · ${choice.zone}`,
      n.number,
      quote.totalTtc.value,
      now(),
      now(),
    )
    await syncTelnyxOrder(teamId, db.prepare('SELECT * FROM telephony_orders WHERE id = ?').get(id), order)
    const row = db.prepare('SELECT status FROM telephony_orders WHERE id = ?').get(id)
    return { status: row.status }
  } finally {
    ordering.delete(teamId)
  }
}

// Ajoute le numéro livré à l'équipe (identifiant opérateur gardé pour la résiliation).
async function claimNumber(teamId, e164) {
  const found = await telnyx('GET', `/phone_numbers?${new URLSearchParams({ 'filter[phone_number]': e164 })}`)
  const ref = found.data?.[0]?.id ?? null
  db.prepare(
    `INSERT INTO telephony_numbers (team_id, service_name, billing_account, provider, provider_ref, created_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(team_id, service_name) DO UPDATE SET provider = excluded.provider, provider_ref = excluded.provider_ref`,
  ).run(teamId, e164.replace(/^\+/, ''), PROVIDER, PROVIDER, ref, now())
}

const PENDING_REQUIREMENTS = /requirement-info-(pending|under-review|exception)/

async function syncTelnyxOrder(teamId, row, fresh) {
  const order = fresh ?? (await telnyx('GET', `/number_orders/${row.order_id}`)).data
  const numberStatus = order.phone_numbers?.[0]?.requirements_status ?? ''
  let status = row.status
  if (order.status === 'success') status = 'terminee'
  else if (order.status === 'failure' || order.status === 'cancelled' || order.status === 'deleted') status = 'annulee'
  else if (PENDING_REQUIREMENTS.test(numberStatus) && !order.requirements_met) status = 'documents'
  else status = 'en_cours'

  if (status === 'terminee') await claimNumber(teamId, row.specific_number)
  if (status !== row.status) {
    db.prepare('UPDATE telephony_orders SET status = ?, updated_at = ? WHERE id = ?').run(status, now(), row.id)
  }
}

// Fait avancer les commandes en cours (appelée par la synchro de la minute).
export async function syncTelnyx(teamId) {
  const open = db
    .prepare("SELECT * FROM telephony_orders WHERE team_id = ? AND provider = ? AND status IN ('en_cours', 'documents')")
    .all(teamId, PROVIDER)
  for (const row of open) {
    try {
      await syncTelnyxOrder(teamId, row)
    } catch (e) {
      console.log(`[telephonie] suivi de la commande ${row.order_id} échoué : ${e.message}`)
    }
  }
}

// Résiliation immédiate : le numéro est libéré chez l'opérateur et cesse
// d'être facturé.
export async function releaseNumberTelnyx(teamId, serviceName) {
  const row = db
    .prepare('SELECT * FROM telephony_numbers WHERE team_id = ? AND service_name = ? AND provider = ?')
    .get(teamId, serviceName, PROVIDER)
  if (!row) throw new UserError('Numéro introuvable.')
  if (row.provider_ref) await telnyx('DELETE', `/phone_numbers/${row.provider_ref}`)
  db.prepare('DELETE FROM telephony_numbers WHERE team_id = ? AND service_name = ?').run(teamId, serviceName)
}

export function isTelnyxNumber(teamId, serviceName) {
  return Boolean(
    db
      .prepare('SELECT 1 FROM telephony_numbers WHERE team_id = ? AND service_name = ? AND provider = ?')
      .get(teamId, serviceName, PROVIDER),
  )
}

// Équipe propriétaire d'un numéro appelé (« +33189… »).
export function teamForNumber(e164) {
  return (
    db
      .prepare('SELECT team_id FROM telephony_numbers WHERE service_name = ? AND provider = ?')
      .get(String(e164 ?? '').replace(/^\+/, ''), PROVIDER)?.team_id ?? null
  )
}
