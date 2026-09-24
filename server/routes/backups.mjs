import { Router } from 'express'

import { requireAdmin, requireAuth } from '../auth.mjs'
import { backupFilePath, listBackups, runDatabaseBackup } from '../backup.mjs'
import { rateLimit } from '../rateLimit.mjs'

export const backupsRouter = Router()
backupsRouter.use(requireAuth, requireAdmin)

// VACUUM INTO copie toute la base sur disque — coûteux en CPU/IO. Réservé
// à l'admin donc risque limité, mais un clic répété (ou un compte admin
// compromis) ne doit pas pouvoir déclencher ça en boucle.
const backupRunLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 10 })

backupsRouter.get('/', (req, res) => {
  res.json(listBackups())
})

backupsRouter.post('/run', backupRunLimiter, (req, res) => {
  try {
    runDatabaseBackup()
    res.json(listBackups())
  } catch (e) {
    res.status(500).json({ error: e?.message ?? 'Échec de la sauvegarde.' })
  }
})

backupsRouter.get('/:name/download', (req, res) => {
  const full = backupFilePath(req.params.name)
  if (!full) return res.status(404).json({ error: 'Sauvegarde introuvable.' })
  res.download(full, req.params.name)
})
