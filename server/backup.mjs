import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { db, now, uuid, LEGACY_TEAM_ID } from './db.mjs'

const dir = path.dirname(fileURLToPath(import.meta.url))
// Même logique que DB_PATH/UPLOADS_DIR — un dossier de sauvegardes sur
// disque éphémère ne survivrait pas à un redéploiement, ce qui rendrait les
// sauvegardes elles-mêmes inutiles en production.
export const BACKUP_DIR = process.env.BACKUP_DIR || path.join(dir, 'backups')

// Combien de sauvegardes quotidiennes on garde avant de purger les plus
// anciennes — assez pour couvrir deux semaines sans laisser le dossier
// grossir indéfiniment.
const KEEP_COUNT = 14

function ensureDir() {
  if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true })
}

function timestamp() {
  const d = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
}

// "VACUUM INTO" produit une copie cohérente en un seul appel SQL, y compris
// pendant que la base est active — plus sûr qu'une copie de fichier brute
// (qui risquerait de capturer la base en plein milieu d'une écriture).
export function runDatabaseBackup() {
  ensureDir()
  const filename = `pse-gestion-${timestamp()}.db`
  const dest = path.join(BACKUP_DIR, filename)
  const escaped = dest.replace(/'/g, "''")
  db.exec(`VACUUM INTO '${escaped}'`)

  const files = fs
    .readdirSync(BACKUP_DIR)
    .filter((f) => f.endsWith('.db'))
    .sort()
  const excess = files.length - KEEP_COUNT
  if (excess > 0) {
    for (const f of files.slice(0, excess)) {
      fs.unlinkSync(path.join(BACKUP_DIR, f))
    }
  }

  return filename
}

export function listBackups() {
  ensureDir()
  return fs
    .readdirSync(BACKUP_DIR)
    .filter((f) => f.endsWith('.db'))
    .map((name) => {
      const stat = fs.statSync(path.join(BACKUP_DIR, name))
      return { name, size: stat.size, createdAt: stat.mtime.toISOString() }
    })
    .sort((a, b) => b.name.localeCompare(a.name))
}

export function backupFilePath(name) {
  // Empêche toute traversée de chemin (../..) : seul un nom de fichier déjà
  // listé par listBackups peut être servi.
  if (!/^pse-gestion-[\w-]+\.db$/.test(name)) return null
  const full = path.join(BACKUP_DIR, name)
  return fs.existsSync(full) ? full : null
}

// La sauvegarde reste globale (toutes équipes confondues, voir Phase 4 —
// limite connue et acceptée), donc son échec n'a de sens que pour l'équipe
// qui héberge réellement le serveur — attribuée à l'équipe historique plutôt
// que laissée sans team_id, sinon la notification n'apparaît plus nulle
// part (toutes les listes filtrent désormais par équipe).
function insertAdminNotification(type, title, body) {
  db.prepare(
    'INSERT INTO notifications (id, recipient_role, recipient_technicien_id, team_id, type, title, body, data, created_at) VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?)',
  ).run(uuid(), 'admin', LEGACY_TEAM_ID, type, title, body, '{}', now())
}

export function runScheduledBackup() {
  try {
    runDatabaseBackup()
  } catch (e) {
    insertAdminNotification('backup_failed', '⚠️ Échec de la sauvegarde automatique', String(e?.message ?? e))
  }
}
