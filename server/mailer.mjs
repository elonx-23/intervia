import nodemailer from 'nodemailer'

// Envoi via un vrai SMTP dédié (boîte no-reply@intervia.info chez OVH),
// plutôt qu'un Gmail personnel — configurable via server/.env : SMTP_HOST,
// SMTP_PORT, SMTP_USER, SMTP_PASSWORD, MAIL_FROM.
let transporter = null

// intervia.info est un domaine tout neuf, sans historique d'envoi — sans
// DKIM, Gmail/Outlook acceptent la connexion SMTP (donc `sendMail` ne lève
// aucune erreur) puis rejettent silencieusement le message, sans bounce ni
// spam visible (constaté en test réel). Le plan OVH "Starter" ne propose pas
// de DKIM géré dans son interface, donc on signe nous-mêmes via nodemailer
// (clé générée une fois, jamais régénérée ensuite sous peine d'invalider la
// clé publique déjà publiée en DNS — même logique que les clés VAPID).
// DKIM_PRIVATE_KEY_B64 = clé privée PEM encodée en base64 (pour tenir dans
// une seule variable d'env sans souci de retours à la ligne).
function getDkimOptions() {
  if (!process.env.DKIM_PRIVATE_KEY_B64) return undefined
  return {
    domainName: 'intervia.info',
    keySelector: 'mail',
    privateKey: Buffer.from(process.env.DKIM_PRIVATE_KEY_B64, 'base64').toString('utf8'),
  }
}

function getTransporter() {
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASSWORD) return null
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT ?? 587),
      // Port 465 = TLS implicite dès la connexion ; tout autre port (587,
      // 25) = connexion en clair puis upgrade STARTTLS.
      secure: Number(process.env.SMTP_PORT ?? 587) === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD },
      dkim: getDkimOptions(),
      // Sans ces délais, un SMTP qui traîne (observé depuis un serveur
      // distant) peut rester bloqué plusieurs minutes avant d'échouer — les
      // appelants ne l'attendent plus (voir signup.mjs), mais un délai
      // raisonnable reste plus sain qu'une connexion qui traîne sans fin.
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 15_000,
    })
  }
  return transporter
}

export function isMailerConfigured() {
  return !!getTransporter()
}

export async function sendMail({ to, subject, html, attachments }) {
  const t = getTransporter()
  if (!t) {
    throw new Error(
      "Email non configuré côté serveur (SMTP_HOST / SMTP_USER / SMTP_PASSWORD manquants dans server/.env).",
    )
  }
  await t.sendMail({ from: process.env.MAIL_FROM ?? process.env.SMTP_USER, to, subject, html, attachments })
}
