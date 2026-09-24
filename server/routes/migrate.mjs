import fs from 'node:fs'
import path from 'node:path'
import { Router } from 'express'

// Route TEMPORAIRE — sert une seule fois à transférer les vraies données
// (base SQLite + fichiers uploadés) depuis la machine de développement vers
// le disque persistant Railway, puis doit être supprimée (voir le commit qui
// la retire juste après la migration). Jamais montée si MIGRATION_SECRET
// n'est pas défini, donc sans risque si ce fichier traînait par erreur.
export const migrateRouter = Router()

migrateRouter.use((req, res, next) => {
  const secret = process.env.MIGRATION_SECRET
  if (!secret || req.headers['x-migration-secret'] !== secret) {
    return res.status(404).end()
  }
  next()
})

migrateRouter.post('/db', express_raw(), (req, res) => {
  const dest = process.env.DB_PATH
  if (!dest) return res.status(500).json({ error: 'DB_PATH non configuré' })
  fs.writeFileSync(dest, req.body)
  res.json({ ok: true, bytes: req.body.length, dest })
})

migrateRouter.post('/file', express_raw(), (req, res) => {
  const uploadsDir = process.env.UPLOADS_DIR
  const relpath = req.query.relpath
  if (!uploadsDir || typeof relpath !== 'string' || relpath.includes('..')) {
    return res.status(400).json({ error: 'Requête invalide' })
  }
  const dest = path.join(uploadsDir, relpath)
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  fs.writeFileSync(dest, req.body)
  res.json({ ok: true, bytes: req.body.length, dest })
})

// express.raw() avec une limite haute — les imports (base + photos) peuvent
// dépasser la limite JSON par défaut du reste de l'API.
function express_raw() {
  return (req, res, next) => {
    const chunks = []
    req.on('data', (c) => chunks.push(c))
    req.on('end', () => {
      req.body = Buffer.concat(chunks)
      next()
    })
    req.on('error', next)
  }
}
