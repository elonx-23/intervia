import crypto from 'node:crypto'

import { db, now } from './db.mjs'
import { notifyAdmin } from './notify.mjs'

// Appareils connectés à un compte : chaque session garde l'appareil
// (d'après le navigateur), l'adresse IP, la ville approximative et la
// dernière activité — affichés dans Réglages → Sécurité, où l'on peut
// déconnecter un appareil. Une nouvelle connexion à un compte admin le
// prévient par notification.

for (const sql of [
  'ALTER TABLE sessions ADD COLUMN ip TEXT',
  'ALTER TABLE sessions ADD COLUMN user_agent TEXT',
  'ALTER TABLE sessions ADD COLUMN location TEXT',
  'ALTER TABLE sessions ADD COLUMN last_seen_at TEXT',
]) {
  try {
    db.exec(sql)
  } catch {
    // colonne déjà là
  }
}

// Vraie IP du visiteur : l'app tourne derrière le relais de l'hébergeur, qui
// la transmet dans X-Real-IP / X-Forwarded-For (req.ip ne verrait que le relais).
export function clientIp(req) {
  const real = req.get('x-real-ip')
  if (real) return real.trim()
  const forwarded = req.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0].trim()
  return req.ip ?? null
}

// « iPhone · Safari », « Mac · Chrome », « Windows · Edge »…
export function describeDevice(ua) {
  const u = String(ua ?? '')
  const device = /iPad/.test(u)
    ? 'iPad'
    : /iPhone/.test(u)
      ? 'iPhone'
      : /Android/.test(u)
        ? /Mobile/.test(u)
          ? 'Téléphone Android'
          : 'Tablette Android'
        : /Macintosh|Mac OS X/.test(u)
          ? 'Mac'
          : /Windows/.test(u)
            ? 'PC Windows'
            : /Linux/.test(u)
              ? 'Linux'
              : 'Appareil inconnu'
  const browser = /Edg\//.test(u)
    ? 'Edge'
    : /OPR\/|Opera/.test(u)
      ? 'Opera'
      : /Firefox\/|FxiOS/.test(u)
        ? 'Firefox'
        : /CriOS|Chrome\//.test(u)
          ? 'Chrome'
          : /Safari\//.test(u)
            ? 'Safari'
            : null
  return browser ? `${device} · ${browser}` : device
}

const isPrivateIp = (ip) => !ip || /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|::1|fc|fd|fe80|::ffff:127\.)/i.test(ip)

// Ville approximative d'après l'IP (service public ipwho.is) — précision de
// l'ordre de la ville, parfois celle de l'opérateur mobile.
async function locate(ip) {
  if (isPrivateIp(ip)) return null
  try {
    const res = await fetch(`https://ipwho.is/${encodeURIComponent(ip)}?fields=success,city,region,country`, { signal: AbortSignal.timeout(5000) })
    const d = await res.json()
    if (!d?.success) return null
    return [d.city, d.country].filter(Boolean).join(', ') || null
  } catch {
    return null
  }
}

// Appelée juste après la création d'une session (connexion réussie).
export function recordNewSession(sessionId, user, req) {
  const ip = clientIp(req)
  const ua = String(req.get('user-agent') ?? '').slice(0, 400)
  db.prepare('UPDATE sessions SET ip = ?, user_agent = ?, last_seen_at = ? WHERE id = ?').run(ip, ua, now(), sessionId)
  locate(ip).then((location) => {
    if (location) db.prepare('UPDATE sessions SET location = ? WHERE id = ?').run(location, sessionId)
    if (user.role === 'admin' && user.team_id) {
      notifyAdmin(
        user.team_id,
        'nouvelle_connexion',
        '🔐 Nouvelle connexion à ton compte',
        `Ton compte vient d'être ouvert sur ${describeDevice(ua)}${location ? ` près de ${location}` : ''}. Si ce n'est pas toi, déconnecte cet appareil dans Réglages, Sécurité.`,
      )
    }
  })
}

// Dernière activité (au plus une écriture toutes les 5 minutes par session).
export function touchSession(sessionId, req) {
  const row = db.prepare('SELECT last_seen_at, ip FROM sessions WHERE id = ?').get(sessionId)
  if (!row) return
  if (row.last_seen_at && Date.now() - new Date(row.last_seen_at).getTime() < 5 * 60 * 1000) return
  const ip = clientIp(req)
  db.prepare('UPDATE sessions SET last_seen_at = ?, ip = ? WHERE id = ?').run(now(), ip, sessionId)
  if (ip && ip !== row.ip) {
    locate(ip).then((location) => location && db.prepare('UPDATE sessions SET location = ? WHERE id = ?').run(location, sessionId))
  }
}

// L'identifiant de session est la clé d'accès elle-même : on n'expose qu'une
// empreinte pour désigner un appareil.
export const sessionHandle = (sessionId) => crypto.createHash('sha256').update(String(sessionId)).digest('hex').slice(0, 24)

export function listDevices(userId, currentSessionId) {
  return db
    .prepare(
      `SELECT id, ip, user_agent, location, created_at, last_seen_at FROM sessions
       WHERE user_id = ? AND datetime(expires_at) > datetime('now')
       ORDER BY COALESCE(last_seen_at, created_at) DESC`,
    )
    .all(userId)
    .map((s) => ({
      handle: sessionHandle(s.id),
      device: describeDevice(s.user_agent),
      ip: s.ip,
      location: s.location,
      createdAt: s.created_at,
      lastSeenAt: s.last_seen_at ?? s.created_at,
      current: s.id === currentSessionId,
    }))
}

// Déconnecte un appareil (ou tous les autres si handle = 'autres').
export function revokeDevices(userId, currentSessionId, handle) {
  const rows = db.prepare('SELECT id FROM sessions WHERE user_id = ?').all(userId)
  let count = 0
  for (const { id } of rows) {
    const target = handle === 'autres' ? id !== currentSessionId : sessionHandle(id) === handle
    if (target) {
      db.prepare('DELETE FROM sessions WHERE id = ?').run(id)
      count++
    }
  }
  return count
}
