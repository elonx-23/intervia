import { Router } from 'express'

import { euro } from '../../shared/documentPdf.mjs'
import { companyForTeam } from '../company.mjs'
import { db } from '../db.mjs'
import { markLinkPaid, paypalKeys } from '../paymentLinks.mjs'
import { createPaypalOrder, settlePaypalOrder } from '../paypal.mjs'
import { rateLimit } from '../rateLimit.mjs'

// Lien de paiement PayPal ouvert par le client de l'entreprise : /payer/:id.
// - Ouverture : crée la commande PayPal et renvoie aussitôt vers PayPal
//   (compte PayPal ou carte bancaire).
// - Retour de PayPal (/payer/:id/retour) : encaisse, passe le lien « payé »,
//   prévient l'admin, puis affiche « Paiement reçu ».
// Comme les devis et factures envoyés aux clients, la page ne montre rien du
// logiciel : seulement l'entreprise, le montant et le motif.
export const payPublicRouter = Router()
payPublicRouter.use(rateLimit({ windowMs: 10 * 60 * 1000, max: 30 }))

// Robots d'aperçu des messageries (WhatsApp, iMessage, Telegram…) : on leur
// sert la page d'aperçu sans créer de commande PayPal. Un vrai client pris
// pour un robot a le bouton « Payer », qui passe outre (?go=1).
const PREVIEW_BOT = /bot|crawl|spider|slurp|facebookexternalhit|whatsapp|preview|embedly|pinterest/i

const loadLink = (id) => {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null
  const link = db.prepare('SELECT * FROM payment_links WHERE id = ?').get(id)
  return link?.provider === 'paypal' ? link : null
}
const reload = (link) => db.prepare('SELECT * FROM payment_links WHERE id = ?').get(link.id)

// ---------- Page ----------

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
const amountText = (n) => euro(n).replace(/ /g, ' ')
const parisDate = (iso) =>
  new Date(iso).toLocaleString('fr-FR', {
    timeZone: 'Europe/Paris',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

const svg = (paths, size = 26) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`
const ICON = {
  card: '<rect width="20" height="14" x="2" y="5" rx="2.5"/><path d="M2 10h20"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  clock: '<circle cx="12" cy="12" r="9.5"/><path d="M12 7v5l3 2"/>',
  alert: '<circle cx="12" cy="12" r="9.5"/><path d="M12 7.5v5"/><path d="M12 16.5h.01"/>',
  back: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
  off: '<path d="M9 17H7A5 5 0 0 1 7 7"/><path d="M15 7h2a5 5 0 0 1 4 8"/><path d="M8 12h4"/><path d="m3 3 18 18"/>',
  search: '<circle cx="11" cy="11" r="7.5"/><path d="m20.5 20.5-4-4"/>',
  lock: '<rect width="16" height="10" x="4" y="11" rx="2"/><path d="M8 11V7.5a4 4 0 0 1 8 0V11"/>',
}

const NEUTRAL_ICON =
  'data:image/svg+xml,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect x="3" y="7" width="26" height="18" rx="4" fill="#64748b"/><rect x="3" y="12" width="26" height="3.5" fill="#fff"/></svg>',
  )

const initials = (name) =>
  String(name ?? '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('') || '€'

function render(res, { status = 200, company, link, tone, icon, title, text, button, showAmount = true, preview = false }) {
  const name = String(company?.name ?? '').trim()
  const logo = company?.logoUrl && /^(\/|https:\/\/)/.test(company.logoUrl) ? company.logoUrl : null
  const amount = link ? amountText(link.amount) : ''
  const contact =
    company?.phone && ['amber', 'red', 'slate'].includes(tone)
      ? `<p class="contact">Une question ? <a href="tel:${esc(company.phone.replace(/[^\d+]/g, ''))}">${esc(company.phone)}</a></p>`
      : ''
  const html = `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex, nofollow">
<title>${esc(preview && link ? `Paiement de ${amount}` : title)}${name ? ` · ${esc(name)}` : ''}</title>
${link ? `<meta property="og:title" content="${esc(`Paiement de ${amount}${name ? ` · ${name}` : ''}`)}">\n<meta property="og:description" content="${esc(`${link.description} — PayPal ou carte bancaire`)}">` : ''}
<link rel="icon" href="${NEUTRAL_ICON}">
<style>
  :root { color-scheme: light dark; --bg: #f3f4f6; --card: #ffffff; --ink: #0f172a; --muted: #64748b; --line: #e5e7eb; --btn: #0b63d1; --btn-ink: #ffffff;
    --green: #15803d; --green-soft: #dcfce7; --amber: #b45309; --amber-soft: #fef3c7; --red: #b91c1c; --red-soft: #fee2e2; --blue: #1d4ed8; --blue-soft: #dbeafe; --slate: #475569; --slate-soft: #e2e8f0; }
  @media (prefers-color-scheme: dark) { :root { --bg: #0b0d12; --card: #151922; --ink: #f1f5f9; --muted: #94a3b8; --line: #232a36; --btn: #3b82f6;
    --green: #4ade80; --green-soft: rgba(34,197,94,.14); --amber: #fbbf24; --amber-soft: rgba(245,158,11,.14); --red: #f87171; --red-soft: rgba(239,68,68,.14); --blue: #93c5fd; --blue-soft: rgba(59,130,246,.16); --slate: #cbd5e1; --slate-soft: rgba(148,163,184,.14); } }
  * { box-sizing: border-box; }
  html, body { margin: 0; }
  body { min-height: 100vh; min-height: 100dvh; display: flex; align-items: center; justify-content: center; padding: 24px 16px calc(24px + env(safe-area-inset-bottom));
    background: var(--bg); color: var(--ink); font: 16px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; -webkit-font-smoothing: antialiased; }
  main { width: 100%; max-width: 420px; background: var(--card); border-radius: 22px; padding: 26px 24px 22px; box-shadow: 0 1px 2px rgba(15,23,42,.05), 0 12px 32px -12px rgba(15,23,42,.18); }
  .brand { display: flex; align-items: center; gap: 12px; padding-bottom: 18px; border-bottom: 1px solid var(--line); }
  .brand img { max-height: 44px; max-width: 120px; object-fit: contain; }
  .brand .tile { width: 40px; height: 40px; border-radius: 12px; background: var(--ink); color: var(--card); display: grid; place-items: center; font-weight: 700; font-size: 15px; letter-spacing: .02em; flex-shrink: 0; }
  .brand .name { font-weight: 650; font-size: 17px; letter-spacing: -.01em; line-height: 1.25; overflow-wrap: anywhere; }
  .state { text-align: center; padding: 26px 4px 4px; }
  .badge { width: 60px; height: 60px; border-radius: 999px; display: grid; place-items: center; margin: 0 auto 16px; color: var(--${tone}); background: var(--${tone}-soft); }
  h1 { margin: 0; font-size: 21px; line-height: 1.3; letter-spacing: -.015em; }
  .amount { margin: 14px 0 0; font-size: 36px; font-weight: 750; letter-spacing: -.025em; font-variant-numeric: tabular-nums; line-height: 1.1; }
  .desc { margin: 6px 0 0; color: var(--muted); font-size: 15px; overflow-wrap: anywhere; }
  .text { margin: 16px auto 0; color: var(--muted); font-size: 15px; max-width: 320px; }
  .btn { display: flex; align-items: center; justify-content: center; gap: 8px; margin-top: 24px; height: 54px; border-radius: 15px; background: var(--btn); color: var(--btn-ink);
    font-weight: 650; font-size: 17px; text-decoration: none; letter-spacing: -.005em; -webkit-tap-highlight-color: transparent; }
  .btn:active { transform: scale(.985); opacity: .92; }
  .hint { margin: 8px 0 0; text-align: center; color: var(--muted); font-size: 13px; }
  .contact { margin: 18px 0 0; text-align: center; font-size: 14px; color: var(--muted); }
  .contact a { color: var(--ink); font-weight: 600; text-decoration: none; }
  footer { display: flex; align-items: center; justify-content: center; gap: 6px; margin-top: 22px; padding-top: 16px; border-top: 1px solid var(--line); color: var(--muted); font-size: 12.5px; }
</style>
</head>
<body>
<main>
  ${
    name
      ? `<div class="brand">${logo ? `<img src="${esc(logo)}" alt="">` : `<div class="tile">${esc(initials(name))}</div>`}<div class="name">${esc(name)}</div></div>`
      : ''
  }
  <div class="state">
    <div class="badge">${svg(ICON[icon])}</div>
    <h1>${esc(title)}</h1>
    ${link && showAmount ? `<p class="amount">${amount}</p><p class="desc">${esc(link.description)}</p>` : ''}
    ${text ? `<p class="text">${text}</p>` : ''}
  </div>
  ${button ? `<a class="btn" href="${esc(button.href)}" rel="nofollow">${svg(ICON.lock, 18)}${esc(button.label)}</a><p class="hint">Compte PayPal ou carte bancaire</p>` : ''}
  ${contact}
  ${link ? `<footer>${svg(ICON.lock, 14)}Paiement sécurisé par PayPal</footer>` : ''}
</main>
</body>
</html>`
  res.status(status).set({ 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' }).type('html').send(html)
}

const payButton = (link, label) => ({ href: `/payer/${link.id}?go=1`, label: label ?? `Payer ${amountText(link.amount)}` })
const VIEWS = {
  preview: (v) => ({ ...v, tone: 'blue', icon: 'card', title: 'Paiement en ligne', button: payButton(v.link), preview: true }),
  left: (v) => ({
    ...v,
    tone: 'blue',
    icon: 'back',
    title: 'Paiement non effectué',
    text: 'Vous avez quitté la page de paiement : rien n’a été débité.',
    button: payButton(v.link),
  }),
  paid: (v) => ({
    ...v,
    tone: 'green',
    icon: 'check',
    title: 'Paiement reçu',
    text: `Merci ! Votre paiement a bien été effectué${v.link.paid_at ? `, le ${esc(parisDate(v.link.paid_at))}` : ''}.`,
  }),
  pending: (v) => ({
    ...v,
    tone: 'amber',
    icon: 'clock',
    title: 'Paiement en cours de validation',
    text: 'PayPal vérifie votre paiement, cela peut prendre quelques minutes. Inutile de payer à nouveau.',
  }),
  declined: (v) => ({
    ...v,
    tone: 'red',
    icon: 'alert',
    title: 'Paiement refusé',
    text: 'Votre moyen de paiement a été refusé et rien n’a été débité. Vous pouvez réessayer avec une autre carte ou un autre compte.',
    button: payButton(v.link, 'Réessayer'),
  }),
  unavailable: (v) => ({
    ...v,
    tone: 'red',
    icon: 'alert',
    title: 'Paiement momentanément indisponible',
    text: 'Le service de paiement ne répond pas. Réessayez dans quelques instants.',
    button: payButton(v.link, 'Réessayer'),
  }),
  inactive: (v) => ({
    ...v,
    tone: 'slate',
    icon: 'off',
    title: 'Lien plus valable',
    showAmount: false,
    text: `Ce lien de paiement n’est plus actif.${v.company?.name ? ` Contactez ${esc(v.company.name)} pour en recevoir un nouveau.` : ''}`,
  }),
}

const notFound = (res) =>
  render(res, {
    status: 404,
    tone: 'slate',
    icon: 'search',
    title: 'Lien introuvable',
    text: 'Ce lien de paiement n’existe pas ou a été mal copié.',
  })

const origin = (link) => {
  try {
    return new URL(link.url).origin
  } catch {
    return null
  }
}

// ---------- Ouverture du lien ----------

payPublicRouter.get('/:id', async (req, res) => {
  const link = loadLink(req.params.id)
  if (!link) return notFound(res)
  const view = { company: companyForTeam(link.team_id), link }
  if (link.status === 'paye') return render(res, VIEWS.paid(view))
  const keys = paypalKeys(link.team_id)
  if (link.status !== 'en_attente' || !keys || !origin(link)) return render(res, VIEWS.inactive(view))
  if (req.query.annule !== undefined) return render(res, VIEWS.left(view))
  if (req.query.go === undefined && (req.method === 'HEAD' || PREVIEW_BOT.test(req.get('user-agent') ?? '')))
    return render(res, VIEWS.preview(view))

  try {
    // Commande déjà en cours pour ce lien : peut-être validée entre-temps
    // (client revenu par le lien plutôt que par PayPal) ou en vérification —
    // dans ces cas, surtout ne pas le faire payer une deuxième fois.
    if (link.provider_ref) {
      const r = await settlePaypalOrder(keys, link, link.provider_ref).catch(() => ({ state: 'open' }))
      if (r.state === 'paid') {
        markLinkPaid(link, { paidAt: r.paidAt, notify: true })
        return render(res, VIEWS.paid({ ...view, link: reload(link) }))
      }
      if (r.state === 'pending') return render(res, VIEWS.pending(view))
    }
    const base = origin(link)
    const order = await createPaypalOrder(keys, link, {
      brandName: view.company.name,
      returnUrl: `${base}/payer/${link.id}/retour`,
      cancelUrl: `${base}/payer/${link.id}?annule=1`,
    })
    db.prepare("UPDATE payment_links SET provider_ref = ? WHERE id = ? AND status = 'en_attente'").run(order.id, link.id)
    res.set('Cache-Control', 'no-store').redirect(303, order.approveUrl)
  } catch (e) {
    console.log(`[paypal] ouverture du lien ${link.id} : ${e.message}`)
    render(res, VIEWS.unavailable(view))
  }
})

// ---------- Retour de PayPal ----------

payPublicRouter.get('/:id/retour', async (req, res) => {
  const link = loadLink(req.params.id)
  if (!link) return notFound(res)
  const view = { company: companyForTeam(link.team_id), link }
  if (link.status === 'paye') return res.redirect(303, `/payer/${link.id}`)
  const keys = paypalKeys(link.team_id)
  // Lien annulé par l'entreprise pendant que le client était sur PayPal : on
  // n'encaisse pas (la commande validée expire sans rien débiter).
  if (link.status !== 'en_attente' || !keys) return render(res, VIEWS.inactive(view))
  const orderId = String(req.query.token ?? '')
  if (!/^[A-Z0-9]{8,40}$/i.test(orderId)) return res.redirect(303, `/payer/${link.id}`)

  try {
    const r = await settlePaypalOrder(keys, link, orderId)
    if (r.state === 'paid') {
      markLinkPaid(link, { paidAt: r.paidAt, ref: orderId, notify: true })
      return res.redirect(303, `/payer/${link.id}`)
    }
    if (r.state === 'pending') {
      db.prepare("UPDATE payment_links SET provider_ref = ? WHERE id = ? AND status = 'en_attente'").run(orderId, link.id)
      return render(res, VIEWS.pending(view))
    }
    if (r.state === 'declined') return render(res, VIEWS.declined(view))
    if (r.state === 'invalid') {
      console.log(`[paypal] retour du lien ${link.id} avec une commande qui ne lui appartient pas (${orderId})`)
      return render(res, VIEWS.unavailable(view))
    }
    return render(res, VIEWS.left(view))
  } catch (e) {
    console.log(`[paypal] retour du lien ${link.id} : ${e.message}`)
    render(res, VIEWS.unavailable(view))
  }
})
