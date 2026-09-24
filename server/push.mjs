import webpush from 'web-push'

import { db, now } from './db.mjs'

// Clés générées via `npx web-push generate-vapid-keys` (voir VAPID.local.md
// pour la procédure). Déplacées de code en dur vers server/.env : l'app sert
// désormais plusieurs équipes/entreprises externes (plus un simple serveur
// perso), donc une clé privée committée dans le code source n'est plus une
// hypothèse raisonnable — n'importe qui avec un accès en lecture au dépôt
// pourrait signer de fausses notifications push comme si elles venaient de
// ce serveur.
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails('mailto:contact@pse-depannage.fr', VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)
} else {
  console.warn('[push] VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY manquantes dans server/.env — notifications push désactivées.')
}

// Envoie une notification déjà en base vers tous les appareils abonnés de
// son destinataire, puis marque pushed_at. Appelée deux fois dans l'app :
// tout de suite après l'insertion (notify.mjs, pour une livraison instantanée
// — ex. dès qu'un admin distribue une fiche) et par le balayage cron
// (runPushDelivery) en filet de sécurité pour tout ce qui n'aurait pas pu
// partir tout de suite (device hors-ligne, erreur réseau…).
export async function pushNotification(n) {
  const subs =
    n.recipient_role === 'admin'
      ? db.prepare("SELECT * FROM push_subscriptions WHERE recipient_role = 'admin' AND team_id = ?").all(n.team_id)
      : db
          .prepare("SELECT * FROM push_subscriptions WHERE recipient_role = 'technicien' AND recipient_technicien_id = ?")
          .all(n.recipient_technicien_id)

  for (const sub of subs) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify({ title: n.title, body: n.body, data: typeof n.data === 'string' ? JSON.parse(n.data) : n.data }),
      )
    } catch (e) {
      if (e.statusCode === 410 || e.statusCode === 404) {
        db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?').run(sub.endpoint)
      }
    }
  }

  db.prepare('UPDATE notifications SET pushed_at = ? WHERE id = ?').run(now(), n.id)
}

// Balayage de secours : tout ce qui a un pushed_at NULL (device sans
// abonnement au moment de l'envoi instantané, tentative précédente
// échouée…). Volontairement borné à 50 lignes par passage.
export async function deliverPendingPush() {
  const pending = db.prepare('SELECT * FROM notifications WHERE pushed_at IS NULL ORDER BY created_at ASC LIMIT 50').all()
  for (const n of pending) {
    await pushNotification(n)
  }
}
