import nodemailer from 'nodemailer'

// Envoi via Gmail SMTP avec un "mot de passe d'application" (pas le mot de
// passe du compte) — voir README pour la procédure de génération.
// Configurable via server/.env : SMTP_USER, SMTP_APP_PASSWORD.
let transporter = null

function getTransporter() {
  if (!process.env.SMTP_USER || !process.env.SMTP_APP_PASSWORD) return null
  if (!transporter) {
    transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_APP_PASSWORD },
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
      "Email non configuré côté serveur (SMTP_USER / SMTP_APP_PASSWORD manquants dans server/.env).",
    )
  }
  await t.sendMail({ from: process.env.SMTP_USER, to, subject, html, attachments })
}
