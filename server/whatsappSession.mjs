import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import makeWASocket, { Browsers, DisconnectReason, fetchLatestBaileysVersion, useMultiFileAuthState } from 'baileys'
import QRCode from 'qrcode'

import { broadcast } from './events.mjs'

// WhatsApp de l'admin relié à l'app comme un « appareil connecté » (QR code,
// comme WhatsApp Web), pour envoyer les fiches directement depuis l'app.
// Non officiel : WhatsApp peut bloquer un numéro qui envoie trop de messages
// trop vite — d'où l'envoi un par un, espacé (voir sendQueued).
//
// Une session par équipe ; ses clés sont gardées à côté de la base (volume
// persistant), elle se reconnecte toute seule après un redémarrage.

const serverDir = path.dirname(fileURLToPath(import.meta.url))
const authRoot = path.join(path.dirname(process.env.DB_PATH || path.join(serverDir, 'pse-gestion.db')), 'whatsapp-auth')

// Journal minimal (la bibliothèque est très bavarde).
const silentLogger = {
  level: 'silent',
  child: () => silentLogger,
  trace() {},
  debug() {},
  info() {},
  warn() {},
  error() {},
  fatal() {},
}

const sessions = new Map() // teamId -> { sock, status, qr, me, groups }

const authDir = (teamId) => path.join(authRoot, String(teamId).replace(/[^\w-]/g, ''))

// Discussions connues du WhatsApp relié (nom + identifiant), apprises au fil
// des synchronisations envoyées par le téléphone — pour choisir ses
// destinataires dans une liste au lieu de taper les numéros.
const chatsFile = (teamId) => path.join(authDir(teamId), 'intervia-chats.json')

function loadChats(teamId) {
  try {
    return JSON.parse(fs.readFileSync(chatsFile(teamId), 'utf8'))
  } catch {
    return {}
  }
}

let saveTimer = null
function rememberChats(teamId, entries) {
  const s = sessions.get(teamId)
  if (!s) return
  s.chats = s.chats ?? loadChats(teamId)
  let changed = false
  for (const e of entries) {
    const id = e?.id
    if (!id || id === 'status@broadcast' || id.endsWith('@newsletter') || id.endsWith('@broadcast')) continue
    const name = e.name || e.subject || e.notify || e.verifiedName || s.chats[id]?.name || null
    const phone = e.phoneNumber || s.chats[id]?.phone || (id.endsWith('@s.whatsapp.net') ? id.split('@')[0] : null)
    if (!s.chats[id] || (name && s.chats[id].name !== name) || (phone && s.chats[id].phone !== phone)) {
      s.chats[id] = { name, phone }
      changed = true
    }
  }
  if (!changed) return
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    try {
      fs.writeFileSync(chatsFile(teamId), JSON.stringify(s.chats))
    } catch {
      // volume indisponible : la liste se reconstruira
    }
  }, 2000)
}

function setState(teamId, patch) {
  const s = sessions.get(teamId) ?? { status: 'deconnecte' }
  Object.assign(s, patch)
  sessions.set(teamId, s)
  broadcast('whatsapp_changed', {}, teamId)
  return s
}

export function sessionStatus(teamId) {
  const s = sessions.get(teamId)
  return { status: s?.status ?? 'deconnecte', qr: s?.status === 'qr' ? s.qr : null, me: s?.me ?? null }
}

export async function connect(teamId) {
  const current = sessions.get(teamId)
  if (current?.sock && ['connexion', 'qr', 'connecte'].includes(current.status)) return sessionStatus(teamId)

  fs.mkdirSync(authDir(teamId), { recursive: true })
  const { state, saveCreds } = await useMultiFileAuthState(authDir(teamId))
  const { version } = await fetchLatestBaileysVersion().catch(() => ({ version: undefined }))
  const sock = makeWASocket({
    version,
    auth: state,
    logger: silentLogger,
    browser: Browsers.macOS('Intervia'),
    markOnlineOnConnect: false,
    syncFullHistory: false,
  })
  setState(teamId, { sock, status: 'connexion', qr: null })

  sock.ev.on('creds.update', saveCreds)
  sock.ev.on('messaging-history.set', ({ chats = [], contacts = [] }) => rememberChats(teamId, [...contacts, ...chats]))
  sock.ev.on('contacts.upsert', (contacts) => rememberChats(teamId, contacts))
  sock.ev.on('contacts.update', (contacts) => rememberChats(teamId, contacts))
  sock.ev.on('chats.upsert', (chats) => rememberChats(teamId, chats))
  sock.ev.on('messages.upsert', ({ messages = [] }) =>
    rememberChats(
      teamId,
      messages.filter((m) => !m.key?.fromMe && m.pushName && !m.key?.remoteJid?.endsWith('@g.us')).map((m) => ({ id: m.key.remoteJid, notify: m.pushName })),
    ),
  )
  sock.ev.on('connection.update', async (u) => {
    if (sessions.get(teamId)?.sock !== sock) return
    if (u.qr) setState(teamId, { status: 'qr', qr: await QRCode.toDataURL(u.qr, { margin: 1, width: 320 }) })
    if (u.connection === 'open') {
      const id = sock.user?.id ?? ''
      setState(teamId, { status: 'connecte', qr: null, me: { number: id.split(':')[0].split('@')[0], name: sock.user?.name ?? null } })
    }
    if (u.connection === 'close') {
      const code = u.lastDisconnect?.error?.output?.statusCode
      if (code === DisconnectReason.loggedOut) {
        // Déconnecté depuis le téléphone : on oublie la session.
        fs.rmSync(authDir(teamId), { recursive: true, force: true })
        setState(teamId, { sock: null, status: 'deconnecte', qr: null, me: null })
      } else {
        // Coupure réseau, redémarrage demandé par WhatsApp… : on se reconnecte.
        setState(teamId, { sock: null, status: 'connexion' })
        setTimeout(() => connect(teamId).catch(() => setState(teamId, { status: 'deconnecte' })), 3000)
      }
    }
  })
  return sessionStatus(teamId)
}

export async function logout(teamId) {
  const s = sessions.get(teamId)
  try {
    await s?.sock?.logout()
  } catch {
    // déjà déconnecté
  }
  fs.rmSync(authDir(teamId), { recursive: true, force: true })
  setState(teamId, { sock: null, status: 'deconnecte', qr: null, me: null })
}

// Au démarrage du serveur : reprend les sessions déjà reliées.
export function restoreSessions() {
  if (!fs.existsSync(authRoot)) return
  for (const teamId of fs.readdirSync(authRoot)) {
    if (fs.existsSync(path.join(authRoot, teamId, 'creds.json'))) connect(teamId).catch(() => {})
  }
}

function connectedSock(teamId) {
  const s = sessions.get(teamId)
  if (s?.status !== 'connecte' || !s.sock) throw Object.assign(new Error("WhatsApp n'est pas relié à l'app."), { status: 400 })
  return s.sock
}

// Discussions individuelles + groupes, pour le choix des destinataires.
export async function listChats(teamId) {
  const groups = await listGroups(teamId)
  const known = sessions.get(teamId)?.chats ?? loadChats(teamId)
  const people = Object.entries(known)
    .filter(([id]) => id.endsWith('@s.whatsapp.net') || id.endsWith('@lid'))
    .map(([id, c]) => {
      const number = c.phone ? String(c.phone).replace(/@.*/, '') : null
      const local = number && number.startsWith('33') && number.length === 11 ? `0${number.slice(2)}` : number ? `+${number}` : null
      return { id: local ?? id, name: c.name || local || 'Contact', kind: 'contact', detail: local }
    })
  return [
    ...groups.map((g) => ({ id: g.id, name: g.name, kind: 'groupe', detail: `${g.size} membres` })),
    ...people.sort((a, b) => a.name.localeCompare(b.name)),
  ]
}

export async function listGroups(teamId) {
  const groups = await connectedSock(teamId).groupFetchAllParticipating()
  return Object.values(groups)
    .map((g) => ({ id: g.id, name: g.subject || 'Groupe sans nom', size: g.participants?.length ?? 0 }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

// « 06 12 34 56 78 » → identifiant WhatsApp ; un groupe garde son identifiant (…@g.us).
export function toJid(phoneOrGroup) {
  const v = String(phoneOrGroup ?? '').trim()
  if (v.includes('@')) return v
  const digits = v.replace(/[^\d+]/g, '')
  const intl = digits.startsWith('+') ? digits.slice(1) : /^0\d{9}$/.test(digits) ? `33${digits.slice(1)}` : digits.replace(/^00/, '')
  return `${intl}@s.whatsapp.net`
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// Envoi un par un, avec une pause aléatoire de 3 à 7 s entre deux messages
// (un rythme « humain », pour limiter le risque de blocage du numéro).
// onResult(target, error|null) est appelé après chaque envoi.
export async function sendQueued(teamId, targets, text, onResult) {
  const sock = connectedSock(teamId)
  for (const [index, target] of targets.entries()) {
    if (index > 0) await sleep(3000 + Math.random() * 4000)
    try {
      const jid = toJid(target.phone)
      if (!jid.endsWith('@g.us')) {
        const [exists] = await sock.onWhatsApp(jid)
        if (!exists?.exists) throw new Error("Ce numéro n'a pas WhatsApp.")
      }
      await sock.sendMessage(jid, { text })
      onResult(target, null)
    } catch (e) {
      onResult(target, e)
    }
  }
}
