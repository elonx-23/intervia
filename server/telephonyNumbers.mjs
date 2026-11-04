import crypto from "node:crypto";

import { db, now, uuid } from "./db.mjs";
import {
  OperatorError,
  getTelephonyConfig,
  hideProvider,
  isTelephonyConfigured,
  operatorCredentials,
  operatorDelete,
  operatorGet,
  operatorPost,
  operatorPublicGet,
  operatorPut,
  providerErrorMessage,
  updateTelephonyConfig,
} from "./ovh.mjs";
import { toE164 } from "./phone.mjs";
import { telnyxEnabledFor } from "./telnyx.mjs";

// Achat, activation et configuration des numéros 01 de l'équipe. Tout est
// déclenché par l'admin depuis l'espace Téléphonie, et rien n'est commandé sans
// qu'il ait vu et confirmé le prix exact (voir orderNumber).

// Erreur dont le message est destiné tel quel à l'écran de l'admin.
export class UserError extends Error {}

const enc = encodeURIComponent;
const AGENT_PREFIX = "Intervia · ";
const POLL_MS = Number(process.env.TELEPHONY_POLL_MS) || 2000;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function creds(teamId) {
  if (!isTelephonyConfigured(teamId))
    throw new UserError(
      "La téléphonie n'est pas encore branchée sur ton compte.",
    );
  return operatorCredentials(getTelephonyConfig(teamId));
}

// Un message d'erreur destiné à l'écran : celui de l'admin tel quel, ou la
// traduction (sans nom de fournisseur) d'une erreur de l'opérateur. Toute autre
// erreur (bug interne) reste générique : jamais de détail technique à l'écran.
export function errorForScreen(e) {
  if (e instanceof UserError) return e.message;
  if (
    e instanceof OperatorError ||
    e?.name === "TimeoutError" ||
    e?.name === "AbortError"
  )
    return providerErrorMessage(e);
  return "Erreur serveur, réessaie dans un instant.";
}

// ---------- Numéros de téléphone ----------

// Numéro français valide (fixe ou mobile) en +33…, sinon null.
// Tolère les écritures courantes : « 06 12 34 56 78 », « 06.12… », « +33 6… »,
// « +33 (0)6… », « 0033 6… ».
export function normalizeFrenchPhone(raw) {
  const e164 = toE164(String(raw ?? "").replace(/\(0\)/g, ""));
  return e164 && /^\+33[1-9]\d{8}$/.test(e164) ? e164 : null;
}

// SIRET réduit à ses chiffres : « 123 456 789 00012 », « 123.456.789.00012 »
// ou « 123-456-789-00012 » sont acceptés tels que l'admin les a tapés.
const siretDigits = (raw) => String(raw ?? "").replace(/\D/g, "");

// Informations du titulaire telles qu'utilisées pour la commande : si le
// téléphone du contact est vide, on reprend le premier téléphone de renvoi.
export function effectiveLegal(cfg) {
  const legal = { ...(cfg?.legal ?? {}) };
  if (!String(legal.phone ?? "").trim() && cfg?.forwardingNumber)
    legal.phone = cfg.forwardingNumber;
  return legal;
}

// Format attendu par l'opérateur pour un numéro appelé : 0033612345678.
function toProviderNumber(e164) {
  return `00${String(e164).replace(/^\+/, "")}`;
}

// ---------- Informations légales ----------

// Obligatoires pour attribuer un numéro 01 à une entreprise (identité du titulaire).
export const LEGAL_FORMS = new Set([
  "individual",
  "corporation",
  "association",
  "personalcorporation",
  "administration",
  "other",
]);

export function missingLegalFields(legal) {
  const l = legal ?? {};
  const siret = siretDigits(l.siret);
  const missing = [];
  if (!LEGAL_FORMS.has(l.legalform)) missing.push("forme juridique");
  if (!String(l.firstname ?? "").trim()) missing.push("prénom");
  if (!String(l.name ?? "").trim()) missing.push("nom");
  if (!/^\S+@\S+\.\S+$/.test(String(l.email ?? ""))) missing.push("e-mail");
  if (!normalizeFrenchPhone(l.phone)) missing.push("téléphone du contact");
  if (!String(l.streetName ?? "").trim()) missing.push("adresse");
  if (!/^\d{5}$/.test(String(l.zip ?? ""))) missing.push("code postal");
  if (!String(l.city ?? "").trim()) missing.push("ville");
  if (l.legalform !== "individual" && !String(l.organisation ?? "").trim())
    missing.push("raison sociale");
  if ((l.legalform !== "individual" || siret) && !/^\d{14}$/.test(siret))
    missing.push("SIRET à 14 chiffres");
  return missing;
}

function legalOrThrow(teamId) {
  const legal = effectiveLegal(getTelephonyConfig(teamId));
  const missing = missingLegalFields(legal);
  if (missing.length > 0) {
    throw new UserError(
      `Complète d'abord les informations de l'entreprise dans Réglages (${missing.join(", ")}).`,
    );
  }
  return legal;
}

// Paramètres d'une commande de numéro géographique.
function orderParams(legal, { zone, specificNumber }) {
  const params = {
    country: "fr",
    offer: "alias",
    zone,
    displayUniversalDirectory: false,
    retractation: true,
    legalform: legal.legalform,
    firstname: legal.firstname.trim(),
    name: legal.name.trim(),
    email: legal.email.trim(),
    phone: normalizeFrenchPhone(legal.phone).replace(/^\+33/, "+33."),
    streetName: legal.streetName.trim(),
    zip: legal.zip,
    city: legal.city.trim(),
  };
  const streetNumber = String(legal.streetNumber ?? "").trim();
  const organisation = String(legal.organisation ?? "").trim();
  const siret = siretDigits(legal.siret);
  const ape = String(legal.ape ?? "").trim();
  if (streetNumber) params.streetNumber = streetNumber;
  if (organisation) {
    params.organisation = organisation;
    params.socialNomination = organisation;
  }
  if (siret) params.siret = siret;
  if (ape) params.ape = ape;
  if (specificNumber) params.specificNumber = specificNumber;
  return params;
}

const asQuery = (params) =>
  Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)]));

// ---------- Recherche (catalogue public, rien n'est commandé) ----------

export async function searchZones(axiom) {
  // L'opérateur exige au moins 3 caractères (« Pa » est refusé).
  if (axiom && axiom.replace(/[^\p{L}\p{N}]/gu, "").length < 3) return [];
  const zones = await operatorPublicGet("/telephony/number/zones", {
    country: "fr",
    ...(axiom ? { axiom } : {}),
  });
  return zones.slice(0, 50);
}

// Numéros libres d'une ville. Le catalogue liste aussi des numéros « premium »
// que la commande refuse ensuite (« no longer available », vu en production
// sur les deux premiers numéros premium de Paris) : on ne propose donc que les
// numéros standards.
export async function availableNumbers(zone) {
  if (!zone) throw new UserError("Choisis une ville.");
  const list = await operatorPublicGet("/telephony/number/specificNumbers", {
    country: "fr",
    type: "geographic",
    zone,
  });
  return list
    .filter((n) => !n.isPremium)
    .slice(0, 200)
    .map((n) => ({ number: n.number, premium: false }));
}

// Le numéro choisi a été pris entre-temps (ou n'était pas réellement libre) :
// message clair plutôt que l'erreur brute de l'opérateur.
function numberGoneOrThrow(e, choice) {
  if (
    choice.specificNumber &&
    e instanceof OperatorError &&
    /no(t)? longer available|not available/i.test(e.message)
  ) {
    throw new UserError(
      "Ce numéro n'est plus disponible. Choisis-en un autre dans la liste, ou prends « Numéro attribué automatiquement ».",
    );
  }
  throw e;
}

// Indicatif national d'un numéro (« 01 » … « 05 ») : un numéro géographique ne
// commence pas toujours par 01 (Lyon et Marseille sont en 04, par exemple).
function prefixOf(number) {
  const m = /^(?:\+33|0033)([1-5])/.exec(String(number ?? ""));
  return m ? `0${m[1]}` : null;
}

// ---------- Compte de téléphonie ----------

async function activeBillingAccount(c) {
  for (const id of await operatorGet(c, "/telephony/")) {
    const info = await operatorGet(c, `/telephony/${enc(id)}`);
    if (!info.status || info.status === "enabled") return id;
  }
  return null;
}

async function currentNumbers(c) {
  const names = [];
  for (const ba of await operatorGet(c, "/telephony/")) {
    names.push(...(await operatorGet(c, `/telephony/${enc(ba)}/number`)));
  }
  return names;
}

// ---------- Commandes ----------

function priceOf(p) {
  return p && typeof p.value === "number"
    ? { value: p.value, currency: p.currencyCode || "EUR" }
    : null;
}

function summarizeOrder(order) {
  const totalTtc = priceOf(order.prices?.withTax);
  if (!totalTtc)
    throw new UserError(
      "Le prix de la commande est indisponible, réessaie dans un instant.",
    );
  return {
    totalTtc,
    totalHt: priceOf(order.prices?.withoutTax),
    lines: (order.details ?? [])
      .map((d) => ({
        label: hideProvider(d.description),
        recurring: d.detailType === "DURATION",
        total: priceOf(d.totalPrice),
      }))
      .filter((l) => l.label),
  };
}

const euros = (value) => `${value.toFixed(2).replace(".", ",")} €`;

// Règle la commande avec le moyen de paiement enregistré de l'équipe. Renvoie
// false (sans erreur) dès que ce n'est pas possible — droits insuffisants,
// aucun moyen enregistré, validation bancaire demandée — l'admin finalise alors
// le paiement lui-même via le lien de la commande.
const PAYMENT_MEAN_BY_TYPE = {
  CREDIT_CARD: "creditCard",
  SEPA_DIRECT_DEBIT: "bankAccount",
  PAYPAL: "paypal",
};

async function tryPay(c, orderId) {
  try {
    const available = (
      await operatorGet(
        c,
        `/me/order/${orderId}/availableRegisteredPaymentMean`,
      )
    ).map((m) => m.paymentMean);
    let method = null;
    const defaults = await operatorGet(c, "/me/payment/method", {
      default: "true",
    });
    if (defaults.length > 0)
      method = await operatorGet(c, `/me/payment/method/${defaults[0]}`);

    let body = null;
    const mean = method && PAYMENT_MEAN_BY_TYPE[method.paymentType];
    if (mean && available.includes(mean) && method.paymentMeanId)
      body = { paymentMean: mean, paymentMeanId: method.paymentMeanId };
    else if (available.includes("deferredPaymentAccount"))
      body = { paymentMean: "deferredPaymentAccount" };
    else if (available.includes("ovhAccount"))
      body = { paymentMean: "ovhAccount" };
    if (!body) return false;

    await operatorPost(
      c,
      `/me/order/${orderId}/payWithRegisteredPaymentMean`,
      body,
    );
    return true;
  } catch {
    return false;
  }
}

function insertOrder(teamId, fields) {
  const id = uuid();
  db.prepare(
    `INSERT INTO telephony_orders (id, team_id, kind, order_id, status, label, specific_number, numbers_before, total_ttc, payment_url, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    teamId,
    fields.kind,
    fields.orderId ?? null,
    fields.status,
    fields.label,
    fields.specificNumber ?? null,
    fields.numbersBefore ? JSON.stringify(fields.numbersBefore) : null,
    fields.total ?? null,
    fields.paymentUrl ?? null,
    now(),
    now(),
  );
  return id;
}

// Règle une commande qui vient d'être créée : payée par l'app, ou à finaliser
// par l'admin via le lien. Même une commande à 0 € peut devoir être validée chez
// l'opérateur : on tente donc toujours le règlement, et on garde le lien de la
// commande au cas où elle n'avancerait pas (voir numbersOverview).
async function settle(c, order, total) {
  const paid = order.orderId ? await tryPay(c, order.orderId) : false;
  return {
    status: paid || total === 0 ? "en_cours" : "a_regler",
    paymentUrl: paid ? null : (order.url ?? null),
  };
}

const ordering = new Set();

function guardAgainstDoubleOrder(teamId, kind) {
  if (ordering.has(teamId))
    throw new UserError(
      "Une commande est déjà en cours de traitement, patiente quelques secondes.",
    );
  const since = new Date(Date.now() - 48 * 3600 * 1000).toISOString();
  const unpaid = db
    .prepare(
      "SELECT 1 FROM telephony_orders WHERE team_id = ? AND kind = ? AND status = 'a_regler' AND created_at > ?",
    )
    .get(teamId, kind, since);
  if (unpaid) {
    throw new UserError(
      "Une commande est en attente de paiement : règle-la ou annule-la avant d'en passer une autre.",
    );
  }
}

// Active la téléphonie de l'équipe (compte gratuit chez l'opérateur) — à faire
// une seule fois, avant le premier achat de numéro.
export async function activateAccount(teamId) {
  guardAgainstDoubleOrder(teamId, "account");
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const inProgress = db
    .prepare(
      "SELECT 1 FROM telephony_orders WHERE team_id = ? AND kind = 'account' AND status IN ('en_cours', 'documents') AND created_at > ?",
    )
    .get(teamId, since);
  if (inProgress) return { already: false, status: "en_cours" };
  ordering.add(teamId);
  try {
    const c = creds(teamId);
    if ((await operatorGet(c, "/telephony/")).length > 0)
      return { already: true };
    const order = await operatorPost(c, "/order/telephony/new");
    const total = priceOf(order.prices?.withTax)?.value ?? 0;
    const outcome = await settle(c, order, total);
    insertOrder(teamId, {
      kind: "account",
      orderId: order.orderId,
      status: outcome.status,
      label: "Activation de la téléphonie",
      total,
      paymentUrl: outcome.paymentUrl,
    });
    return { already: false, status: outcome.status };
  } finally {
    ordering.delete(teamId);
  }
}

function checkChoice({ zone, specificNumber }) {
  if (!zone || typeof zone !== "string")
    throw new UserError("Choisis une ville.");
  if (specificNumber && !/^00\d{10,13}$/.test(specificNumber))
    throw new UserError("Numéro invalide.");
}

// Prix exact d'un numéro, sans rien commander (simulation de commande).
export async function quoteNumber(teamId, choice) {
  checkChoice(choice);
  const c = creds(teamId);
  const legal = legalOrThrow(teamId);
  const billingAccount = await activeBillingAccount(c);
  if (!billingAccount)
    throw new UserError(
      "Active d'abord la téléphonie avant d'acheter un numéro.",
    );
  const order = await operatorGet(
    c,
    `/order/telephony/${enc(billingAccount)}/numberGeographic`,
    asQuery(orderParams(legal, choice)),
  ).catch((e) => numberGoneOrThrow(e, choice));
  return summarizeOrder(order);
}

// Commande réellement le numéro. Le prix confirmé par l'admin (expectedTotal,
// celui qu'il a vu dans la fenêtre de confirmation) est recontrôlé juste avant :
// s'il a changé entre-temps, rien n'est commandé.
export async function orderNumber(teamId, choice, expectedTotal) {
  checkChoice(choice);
  guardAgainstDoubleOrder(teamId, "number");
  ordering.add(teamId);
  try {
    const c = creds(teamId);
    const legal = legalOrThrow(teamId);
    const billingAccount = await activeBillingAccount(c);
    if (!billingAccount)
      throw new UserError(
        "Active d'abord la téléphonie avant d'acheter un numéro.",
      );

    const params = orderParams(legal, choice);
    const path = `/order/telephony/${enc(billingAccount)}/numberGeographic`;
    const quote = summarizeOrder(
      await operatorGet(c, path, asQuery(params)).catch((e) =>
        numberGoneOrThrow(e, choice),
      ),
    );
    if (
      typeof expectedTotal !== "number" ||
      Math.abs(quote.totalTtc.value - expectedTotal) > 0.005
    ) {
      throw new UserError(
        `Le prix a changé (${euros(quote.totalTtc.value)} TTC). Vérifie-le puis confirme à nouveau.`,
      );
    }

    const numbersBefore = await currentNumbers(c);
    const order = await operatorPost(c, path, params).catch((e) =>
      numberGoneOrThrow(e, choice),
    );
    const outcome = await settle(c, order, quote.totalTtc.value);
    insertOrder(teamId, {
      kind: "number",
      orderId: order.orderId,
      status: outcome.status,
      label: choice.specificNumber
        ? `Numéro ${prefixOf(choice.specificNumber) ?? "fixe"} · ${choice.zone}`
        : `Numéro fixe attribué · ${choice.zone}`,
      specificNumber: choice.specificNumber ?? null,
      numbersBefore,
      total: quote.totalTtc.value,
      paymentUrl: outcome.paymentUrl,
    });
    return { status: outcome.status };
  } finally {
    ordering.delete(teamId);
  }
}

// Masque une commande de la liste (ex. paiement abandonné) — débloque aussi
// une nouvelle commande.
export function dismissOrder(teamId, id) {
  db.prepare(
    "UPDATE telephony_orders SET status = 'annulee', updated_at = ? WHERE id = ? AND team_id = ? AND status = 'a_regler'",
  ).run(now(), id, teamId);
}

// L'admin a réglé la commande lui-même via le lien. Sans le droit de lire les
// commandes, l'app ne peut pas le constater avant que le numéro apparaisse
// (de quelques minutes à quelques heures) : on la passe donc « en cours » sur
// sa parole. Si l'opérateur répond qu'elle n'est pas payée, syncOrders la
// remet « à régler ».
export function markOrderPaid(teamId, id) {
  db.prepare(
    "UPDATE telephony_orders SET status = 'en_cours', paid_reported_at = ?, updated_at = ? WHERE id = ? AND team_id = ? AND status = 'a_regler'",
  ).run(now(), now(), id, teamId);
}

// ---------- Configuration d'un numéro : renvoi vers les téléphones + enregistrement ----------

export function desiredConfig(teamId) {
  const cfg = getTelephonyConfig(teamId);
  const phones = [
    ...new Set(
      [cfg.forwardingNumber, cfg.forwardingNumber2]
        .map(normalizeFrenchPhone)
        .filter(Boolean),
    ),
  ];
  return { phones, record: Boolean(cfg.recordingAccepted) };
}

export const configHash = (desired) =>
  crypto
    .createHash("sha1")
    .update(JSON.stringify(desired))
    .digest("hex")
    .slice(0, 16);

// Attend que le numéro soit passé en « file d'appels » (changement asynchrone
// chez l'opérateur). false = pas encore, on reprendra à la prochaine synchro.
async function waitForFeature(c, ba, sn, taskId) {
  for (let i = 0; i < 15; i++) {
    const number = await operatorGet(c, `/telephony/${ba}/number/${sn}`);
    if (number.featureType === "easyHunting") return true;
    if (taskId) {
      const task = await operatorGet(
        c,
        `/telephony/${ba}/service/${sn}/task/${taskId}`,
      ).catch(() => null);
      if (task?.status === "error")
        throw new UserError(
          `La configuration du numéro a échoué : ${hideProvider(task.message) || "erreur inconnue"}.`,
        );
    }
    await sleep(POLL_MS);
  }
  return false;
}

async function ensureQueue(c, base, desired) {
  // L'appelant n'a aucun choix à faire (pas de touche pour refuser). L'annonce
  // « appel enregistré » reste diffusée par l'opérateur dès que l'enregistrement
  // est actif : elle ne se désactive pas, et la loi impose d'informer l'appelant.
  const settings = {
    strategy: "ringAll",
    record: desired.record,
    askForRecordDisabling: false,
  };
  const queueIds = await operatorGet(c, `${base}/hunting/queue`);
  if (queueIds.length === 0) {
    const queue = await operatorPost(c, `${base}/hunting/queue`, {
      ...settings,
      maxMember: 5,
      maxWaitTime: 45,
    });
    return queue.queueId;
  }
  await operatorPut(c, `${base}/hunting/queue/${queueIds[0]}`, settings);
  return queueIds[0];
}

async function ensureAgents(c, base, queueId, phones) {
  const wanted = phones.map((p, i) => ({
    number: toProviderNumber(p),
    e164: p,
    label: `${AGENT_PREFIX}Téléphone ${i + 1}`,
  }));
  const agents = [];
  for (const id of await operatorGet(c, `${base}/hunting/agent`))
    agents.push(await operatorGet(c, `${base}/hunting/agent/${id}`));
  const assigned = new Set(
    (await operatorGet(c, `${base}/hunting/queue/${queueId}/agent`)).map(
      Number,
    ),
  );

  // Retire les agents créés par l'app dont le téléphone n'est plus voulu.
  for (const agent of agents) {
    if (
      !agent.description?.startsWith(AGENT_PREFIX) ||
      wanted.some((w) => w.e164 === toE164(agent.number))
    )
      continue;
    if (assigned.has(agent.agentId))
      await operatorDelete(
        c,
        `${base}/hunting/agent/${agent.agentId}/queue/${queueId}`,
      );
    await operatorDelete(c, `${base}/hunting/agent/${agent.agentId}`);
  }

  for (const [position, w] of wanted.entries()) {
    let agent = agents.find((a) => toE164(a.number) === w.e164);
    if (!agent) {
      agent = await operatorPost(c, `${base}/hunting/agent`, {
        number: w.number,
        description: w.label,
        status: "available",
        timeout: 25,
        simultaneousLines: 1,
        wrapUpTime: 0,
      });
    } else if (agent.status !== "available") {
      await operatorPut(c, `${base}/hunting/agent/${agent.agentId}`, {
        status: "available",
      });
    }
    if (!assigned.has(agent.agentId)) {
      await operatorPost(c, `${base}/hunting/agent/${agent.agentId}/queue`, {
        queueId,
        position,
      });
    }
  }
}

const configuring = new Set();

// Applique au numéro la configuration voulue : groupe d'appels qui sonne sur
// tous les téléphones en même temps, avec enregistrement si accepté.
// Idempotent : peut être relancé à volonté.
export async function configureNumber(teamId, row) {
  const key = `${teamId}:${row.service_name}`;
  if (configuring.has(key)) return;
  configuring.add(key);
  const desired = desiredConfig(teamId);
  db.prepare(
    "UPDATE telephony_numbers SET last_attempt_at = ? WHERE team_id = ? AND service_name = ?",
  ).run(now(), teamId, row.service_name);
  try {
    if (desired.phones.length === 0)
      throw new UserError(
        "Ajoute au moins un téléphone dans Réglages pour activer le renvoi.",
      );
    const c = creds(teamId);
    const ba = enc(row.billing_account);
    const sn = enc(row.service_name);

    const number = await operatorGet(c, `/telephony/${ba}/number/${sn}`);
    if (number.featureType !== "easyHunting") {
      const task = await operatorPost(
        c,
        `/telephony/${ba}/number/${sn}/changeFeatureType`,
        { featureType: "easyHunting" },
      );
      if (!(await waitForFeature(c, ba, sn, task?.taskId))) return;
    }

    const base = `/telephony/${ba}/easyHunting/${sn}`;
    await operatorPut(c, base, {
      strategy: "ringAll",
      showCallerNumber: "caller",
      maxWaitTime: 45,
    });
    const queueId = await ensureQueue(c, base, desired);
    await ensureAgents(c, base, queueId, desired.phones);

    db.prepare(
      "UPDATE telephony_numbers SET config_hash = ?, last_error = NULL, configured_at = ? WHERE team_id = ? AND service_name = ?",
    ).run(configHash(desired), now(), teamId, row.service_name);
  } catch (e) {
    console.log(
      `[telephonie] configuration du numéro ${row.service_name} échouée : ${e.message}`,
    );
    db.prepare(
      "UPDATE telephony_numbers SET last_error = ? WHERE team_id = ? AND service_name = ?",
    ).run(errorForScreen(e), teamId, row.service_name);
  } finally {
    configuring.delete(key);
  }
}

// Relance la configuration tout de suite (bouton « Réessayer »).
export async function reconfigureNow(teamId, serviceName) {
  const row = db
    .prepare(
      "SELECT * FROM telephony_numbers WHERE team_id = ? AND service_name = ?",
    )
    .get(teamId, serviceName);
  if (!row) throw new UserError("Numéro introuvable.");
  await configureNumber(teamId, row);
}

// Résilie un numéro (pris en compte à la prochaine échéance de facturation,
// annulable chez l'opérateur d'ici là).
export async function releaseNumber(teamId, serviceName) {
  const row = db
    .prepare(
      "SELECT * FROM telephony_numbers WHERE team_id = ? AND service_name = ?",
    )
    .get(teamId, serviceName);
  if (!row) throw new UserError("Numéro introuvable.");
  await operatorDelete(
    creds(teamId),
    `/telephony/${enc(row.billing_account)}/service/${enc(serviceName)}`,
    {
      reason: "other",
      details: "Résiliation depuis l'application",
    },
  );
  db.prepare(
    "UPDATE telephony_numbers SET terminating_at = ? WHERE team_id = ? AND service_name = ?",
  ).run(now(), teamId, serviceName);
}

// ---------- Synchronisation (appelée chaque minute par telephonySync) ----------

// Après un échec, on attend avant de réessayer (inutile de marteler l'opérateur
// toutes les minutes) ; modifier un réglage téléphonie lève cette attente.
const RETRY_AFTER_ERROR_MS = 3 * 60 * 1000;

// Met à jour la liste des numéros et applique la configuration voulue à ceux
// qui ne l'ont pas (nouvel achat, téléphone modifié).
export async function syncNumbers(teamId, c) {
  const accounts = await operatorGet(c, "/telephony/");
  const seen = new Set();
  for (const ba of accounts) {
    for (const sn of await operatorGet(c, `/telephony/${enc(ba)}/number`)) {
      seen.add(sn);
      db.prepare(
        `INSERT INTO telephony_numbers (team_id, service_name, billing_account, created_at) VALUES (?, ?, ?, ?)
         ON CONFLICT(team_id, service_name) DO UPDATE SET billing_account = excluded.billing_account`,
      ).run(teamId, sn, ba, now());
    }
  }

  const billingAccount = accounts[0] ?? null;
  if ((getTelephonyConfig(teamId).billingAccount ?? null) !== billingAccount)
    updateTelephonyConfig(teamId, { billingAccount });

  // Les numéros d'un autre opérateur (provider renseigné) ne sont jamais touchés ici.
  const rows = db
    .prepare(
      "SELECT * FROM telephony_numbers WHERE team_id = ? AND provider IS NULL",
    )
    .all(teamId);
  for (const row of rows) {
    if (!seen.has(row.service_name)) {
      db.prepare(
        "DELETE FROM telephony_numbers WHERE team_id = ? AND service_name = ?",
      ).run(teamId, row.service_name);
    }
  }

  const desired = desiredConfig(teamId);
  const hash = configHash(desired);
  for (const row of rows) {
    if (
      !seen.has(row.service_name) ||
      row.terminating_at ||
      desired.phones.length === 0 ||
      row.config_hash === hash
    )
      continue;
    if (
      row.last_error &&
      row.last_attempt_at &&
      Date.now() - new Date(row.last_attempt_at).getTime() <
        RETRY_AFTER_ERROR_MS
    )
      continue;
    await configureNumber(teamId, row);
  }
  return { accounts, numbers: [...seen] };
}

const ORDER_STATUS_BY_PROVIDER = {
  notPaid: "a_regler",
  checking: "en_cours",
  delivering: "en_cours",
  documentsRequested: "documents",
  delivered: "terminee",
  cancelling: "annulee",
  cancelled: "annulee",
};

// Fait avancer les commandes en cours : par le statut de la commande quand les
// droits le permettent, sinon en regardant si le compte / le numéro commandé est apparu.
export async function syncOrders(teamId, c, { accounts, numbers }) {
  const open = db
    .prepare(
      "SELECT * FROM telephony_orders WHERE team_id = ? AND provider IS NULL AND status IN ('a_regler', 'en_cours', 'documents')",
    )
    .all(teamId);
  const claimed = new Set();
  for (const order of open) {
    let status = null;
    if (order.order_id) {
      try {
        status =
          ORDER_STATUS_BY_PROVIDER[
            await operatorGet(c, `/me/order/${order.order_id}/status`)
          ] ?? null;
      } catch {
        // droits insuffisants pour lire la commande : on déduit ci-dessous
      }
    }

    let foundNumber = null;
    if (order.kind === "number") {
      const before = new Set(
        order.numbers_before ? JSON.parse(order.numbers_before) : [],
      );
      foundNumber =
        numbers.find(
          (n) =>
            !before.has(n) &&
            !claimed.has(n) &&
            (!order.specific_number || n === order.specific_number),
        ) ?? null;
      if (foundNumber) claimed.add(foundNumber);
    }
    const completed =
      order.kind === "account" ? accounts.length > 0 : Boolean(foundNumber);
    if (status === null || status === "en_cours" || status === "a_regler") {
      if (completed) status = "terminee";
    }

    // Commande non réglée : si elle n'a pas pu l'être à la création (droits
    // manquants à l'époque, par exemple), on retente de temps en temps pendant
    // 24 h — c'est le règlement du prix que l'admin a déjà confirmé.
    let paymentUrl = order.payment_url;
    if (status === "a_regler" && order.order_id) {
      const sinceAttempt = order.last_pay_attempt_at
        ? Date.now() - new Date(order.last_pay_attempt_at).getTime()
        : Infinity;
      const fresh =
        Date.now() - new Date(order.created_at).getTime() < 24 * 3600 * 1000;
      if (fresh && sinceAttempt > 10 * 60 * 1000) {
        db.prepare(
          "UPDATE telephony_orders SET last_pay_attempt_at = ? WHERE id = ?",
        ).run(now(), order.id);
        if (await tryPay(c, order.order_id)) status = "en_cours";
      }
      if (status === "a_regler" && !paymentUrl) {
        paymentUrl = await operatorGet(c, `/me/order/${order.order_id}`)
          .then((o) => o.url ?? null)
          .catch(() => null);
      }
    }
    if (
      !status ||
      (status === order.status && paymentUrl === order.payment_url)
    )
      continue;

    db.prepare(
      "UPDATE telephony_orders SET status = ?, specific_number = COALESCE(?, specific_number), payment_url = ?, updated_at = ? WHERE id = ?",
    ).run(
      status,
      foundNumber,
      status === "terminee" ? null : paymentUrl,
      now(),
      order.id,
    );
  }
}

// ---------- Vue pour l'écran ----------

const OPEN_ORDER_STATUSES = new Set(["a_regler", "en_cours", "documents"]);

export function numbersOverview(teamId) {
  const cfg = getTelephonyConfig(teamId);
  const desired = desiredConfig(teamId);
  const hash = configHash(desired);
  const telnyx = telnyxEnabledFor(teamId);

  const numbers = db
    .prepare(
      "SELECT * FROM telephony_numbers WHERE team_id = ? ORDER BY created_at",
    )
    .all(teamId)
    .map((r) => {
      // Opérateur « revendeur » : le renvoi est décidé à chaque appel (webhook),
      // il n'y a rien à configurer sur le numéro.
      if (r.provider === "telnyx") {
        return {
          serviceName: r.service_name,
          state: desired.phones.length === 0 ? "a_configurer" : "actif",
          error: null,
          recording: desired.record,
        };
      }
      return {
        serviceName: r.service_name,
        state: r.terminating_at
          ? "resiliation"
          : r.last_error
            ? "erreur"
            : desired.phones.length === 0
              ? "a_configurer"
              : r.config_hash === hash
                ? "actif"
                : "configuration",
        error: r.last_error ? hideProvider(r.last_error) : null,
        recording: r.config_hash === hash && desired.record,
      };
    });

  const weekAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
  const orders = db
    .prepare(
      "SELECT * FROM telephony_orders WHERE team_id = ? AND status != 'annulee' ORDER BY created_at DESC LIMIT 20",
    )
    .all(teamId)
    .filter(
      (o) =>
        OPEN_ORDER_STATUSES.has(o.status) ||
        (o.updated_at ?? o.created_at) > weekAgo,
    )
    .slice(0, 10)
    .map((o) => ({
      id: o.id,
      kind: o.kind,
      status: o.status,
      label: hideProvider(o.label),
      number: o.specific_number,
      total: o.total_ttc,
      currency: o.provider === 'telnyx' ? 'USD' : 'EUR',
      // Lien pour finaliser : commande à régler, ou commande « en cours » qui
      // n'avance pas depuis plus de 5 minutes (sauf si l'admin a déjà dit l'avoir payée).
      actionUrl:
        o.status === "a_regler" ||
        (o.status === "en_cours" &&
          !o.paid_reported_at &&
          Date.now() - new Date(o.created_at).getTime() > 5 * 60 * 1000)
          ? o.payment_url
          : null,
      paidReported: Boolean(o.paid_reported_at),
      createdAt: o.created_at,
    }));

  const pendingAccount = orders.some(
    (o) => o.kind === "account" && OPEN_ORDER_STATUSES.has(o.status),
  );
  const missing = [];
  if (desired.phones.length === 0) missing.push("phone");
  // Chez l'opérateur « revendeur », l'identité du titulaire est vérifiée une
  // fois pour toutes sur le compte d'Intervia : rien à saisir ici.
  const missingLegal = telnyx ? [] : missingLegalFields(effectiveLegal(cfg));
  if (missingLegal.length > 0) missing.push("legal");

  return {
    provider: telnyx ? "telnyx" : "ovh",
    configured: telnyx || isTelephonyConfigured(teamId),
    account:
      telnyx || cfg.billingAccount
        ? "ready"
        : pendingAccount
          ? "pending"
          : "none",
    missing,
    missingLegal,
    numbers,
    orders,
  };
}
