import './env.mjs'

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import cors from 'cors'
import express from 'express'

import { backfillLegacyTeamIds, backfillTeamMemberships, migrateLegacyTeam } from './db.mjs'
import { authRouter } from './routes/auth.mjs'
import { signupRouter } from './routes/signup.mjs'
import { teamsRouter } from './routes/teams.mjs'
import { interventionsRouter } from './routes/interventions.mjs'
import { documentsRouter } from './routes/documents.mjs'
import { notificationsRouter } from './routes/notifications.mjs'
import { statsRouter } from './routes/stats.mjs'
import { techniciansRouter } from './routes/technicians.mjs'
import { uploadRouter, uploadsDir } from './routes/upload.mjs'
import { stripeWebhookRouter } from './routes/stripeWebhook.mjs'
import { settingsRouter } from './routes/settings.mjs'
import { eventsRouter } from './routes/events.mjs'
import { backupsRouter } from './routes/backups.mjs'
import { reportsRouter } from './routes/reports.mjs'
import { telephonyRouter } from './routes/telephony.mjs'
import { whatsappRouter } from './routes/whatsapp.mjs'
import { paymentsRouter } from './routes/payments.mjs'
import { payPublicRouter } from './routes/payPublic.mjs'
import { restoreSessions } from './whatsappSession.mjs'
import { telnyxWebhookRouter } from './routes/telnyxWebhooks.mjs'
import { startCronJobs } from './cron.mjs'
import { rateLimit } from './rateLimit.mjs'

const legacyTeam = migrateLegacyTeam()
if (legacyTeam) {
  console.log(`Équipe existante regroupée sous le code d'équipe : ${legacyTeam.joinCode}\n`)
}
backfillLegacyTeamIds()
backfillTeamMemberships()

const app = express()
app.use(cors())

// En-têtes de sécurité de base, sans nouvelle dépendance (pas de helmet) :
// - nosniff empêche le navigateur de deviner un type MIME différent de celui
//   déclaré, notamment sur /uploads (un fichier renommé pour paraître une
//   image ne s'exécuterait pas comme autre chose).
// - X-Frame-Options bloque l'intégration de l'app dans une iframe tierce
//   (clickjacking) — aucune page de l'app n'a besoin d'être embarquée.
// - Referrer-Policy évite de fuiter les tokens publics (liens de signature/
//   facture, réinitialisation…) présents dans l'URL vers un site externe
//   référencé par un lien sortant.
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-Frame-Options', 'DENY')
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
  next()
})

// Filet de sécurité global, en plus des limites déjà posées sur les routes
// sensibles (login, inscription…) : une session compromise/volée, ou
// n'importe quel client, ne peut pas marteler l'API entière sans limite.
// Généreux exprès (600/min) pour ne jamais gêner un usage normal — le PWA
// fait plusieurs appels par écran, plus le SSE de fond — seul un abus net
// (scraping, script en boucle) le déclenche.
app.use(rateLimit({ windowMs: 60 * 1000, max: 600 }))

// Montée AVANT express.json() : Stripe a besoin du corps brut (non parsé)
// pour vérifier la signature du webhook.
app.use('/api/stripe/webhook', stripeWebhookRouter)
// Webhooks d'appels de l'opérateur téléphonie : corps brut gardé pour la signature.
app.use('/api/telnyx', telnyxWebhookRouter)
app.use(express.json({ limit: '10mb' }))
app.use('/uploads', express.static(uploadsDir))

app.use('/api/auth', authRouter)
app.use('/api/signup', signupRouter)
app.use('/api/teams', teamsRouter)
app.use('/api/interventions', interventionsRouter)
app.use('/api/documents', documentsRouter)
app.use('/api/notifications', notificationsRouter)
app.use('/api/stats', statsRouter)
app.use('/api/technicians', techniciansRouter)
app.use('/api/upload', uploadRouter)
app.use('/api/settings', settingsRouter)
app.use('/api/events', eventsRouter)
app.use('/api/backups', backupsRouter)
app.use('/api/reports', reportsRouter)
app.use('/api/telephony', telephonyRouter)
app.use('/api/whatsapp', whatsappRouter)
app.use('/api/payments', paymentsRouter)
// Lien de paiement PayPal ouvert par le client d'une entreprise (page publique).
app.use('/payer', payPublicRouter)

// Sert le frontend buildé (npm run build → dist/) depuis ce même serveur,
// sur le même port/origine que l'API — c'est ce que suppose déjà le
// frontend (apiFetch appelle des chemins relatifs comme "/api/…", jamais
// une URL absolue). N'existe qu'en production/déploiement : en dev, dist/
// n'existe pas encore (on utilise le serveur Vite séparé à la place), donc
// ce bloc ne fait rien et n'interfère jamais avec `npm run dev`.
const distDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist')
if (fs.existsSync(distDir)) {
  // Fichiers de l'app (JS, CSS, polices…) : leur nom contient une empreinte
  // qui change à chaque mise en ligne → gardés 1 an sur le téléphone, sans
  // jamais redemander au serveur. Un fichier introuvable répond 404 (et non
  // la page d'accueil : un ancien onglet aurait sinon reçu du HTML à la place
  // du JS et affiché une page blanche après une mise à jour).
  app.use(
    '/assets',
    express.static(path.join(distDir, 'assets'), { immutable: true, maxAge: '365d' }),
    (req, res) => res.status(404).type('text/plain').send('Fichier introuvable'),
  )
  // Le reste (index.html, manifest, icônes) : toujours revérifié, pour que
  // la nouvelle version arrive dès qu'elle est en ligne.
  app.use(express.static(distDir, { maxAge: 0, setHeaders: (res) => res.setHeader('Cache-Control', 'no-cache') }))
  // Route de secours SPA : toute URL qui n'est ni une route API ni un
  // fichier statique existant (ex. /devis/abc123/modifier, tapée
  // directement ou rechargée) doit quand même renvoyer index.html, pour que
  // react-router prenne le relais côté client plutôt qu'un 404 serveur.
  // Liens envoyés aux clients d'une entreprise (devis / facture) : la page
  // ne doit rien montrer du logiciel — ni dans l'onglet, ni dans l'aperçu du
  // lien (messagerie), ni en icône. Titre et icône neutres ; la page met
  // ensuite le numéro du document et le nom de l'entreprise dans le titre.
  const indexHtml = () => fs.readFileSync(path.join(distDir, 'index.html'), 'utf8')
  const neutralIcon =
    "data:image/svg+xml," +
    encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect x="6" y="3" width="20" height="26" rx="3" fill="#64748b"/><rect x="10" y="10" width="12" height="2" fill="#fff"/><rect x="10" y="15" width="12" height="2" fill="#fff"/><rect x="10" y="20" width="8" height="2" fill="#fff"/></svg>',
    )
  app.get(['/signer/:token', '/facture/:token'], (req, res) => {
    const html = indexHtml()
      .replace(/<link rel="(?:icon|apple-touch-icon|manifest)"[^>]*>\s*/g, '')
      .replace(/<meta name="apple-mobile-web-app-title"[^>]*>/, '')
      .replace(/<title>[^<]*<\/title>/, `<title>Document</title><link rel="icon" href="${neutralIcon}" />`)
    res.type('html').send(html)
  })
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/uploads')) return next()
    res.sendFile(path.join(distDir, 'index.html'))
  })
}

// Filet de secours pour tout ce qui n'a pas été anticipé par une route (les
// erreurs prévues répondent déjà elles-mêmes avec un message adapté, ex.
// "Identifiants invalides.", un message Stripe...). Ici on ne sait PAS ce
// qui a cassé — renvoyer err.message tel quel risquerait d'exposer un détail
// interne (chemin de fichier, nom de colonne SQL, trace de dépendance) à
// quelqu'un qui sonde l'API. Le détail complet part quand même dans les logs
// serveur pour le débogage, juste pas dans la réponse HTTP.
app.use((err, req, res, _next) => {
  console.error(err)
  res.status(500).json({ error: 'Erreur serveur, réessaie dans un instant.' })
})

startCronJobs()
// Reprend les WhatsApp déjà reliés (sessions gardées sur le volume).
restoreSessions()

const PORT = process.env.PORT ?? 3001
app.listen(PORT, () => {
  console.log(`Intervia API sur http://localhost:${PORT}`)
})
