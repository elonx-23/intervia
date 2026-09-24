import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'
import { Router } from 'express'
import multer from 'multer'

import { requireAuth } from '../auth.mjs'
import { rateLimit } from '../rateLimit.mjs'

const dir = path.dirname(fileURLToPath(import.meta.url))
// UPLOADS_DIR : même logique que DB_PATH (voir db.mjs) — un disque
// persistant en production, sinon les photos uploadées disparaîtraient à
// chaque redéploiement.
export const uploadsDir = process.env.UPLOADS_DIR || path.join(dir, '..', 'uploads')

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const folder = (req.body.folder || 'misc').replace(/[^a-z0-9-]/gi, '')
    const dest = path.join(uploadsDir, folder)
    mkdirSync(dest, { recursive: true })
    cb(null, dest)
  },
  // `/uploads` est servi en statique sans authentification (nécessaire pour
  // que la page publique de signature d'un devis/facture affiche les photos
  // sans que le client ait besoin de se connecter) — donc rien ne protège un
  // fichier dont le nom est devinable. Un nom `Date.now()-original.jpg`
  // (précédemment) ne l'est pas : un horodatage à la milliseconde se
  // brute-force en quelques heures de requêtes pour une plage de temps
  // connue, et le nom d'origine (souvent "IMG_1234.jpg") est lui-même
  // prévisible. Remplacé par un UUID v4 (122 bits d'aléatoire) — même
  // principe que `public_token` sur les devis/factures : l'URL EST le
  // contrôle d'accès, donc elle doit être aussi imprévisible qu'un token.
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).replace(/[^a-zA-Z0-9.]/g, '').slice(0, 10)
    cb(null, `${randomUUID()}${ext}`)
  },
})

// Seuls des vrais usages existent côté frontend : photos d'intervention et
// logo d'entreprise — donc uniquement des images. Sans cette restriction,
// n'importe quel compte authentifié pouvait déposer un .html/.svg dans
// `server/uploads/`, servi tel quel en statique sur le même domaine que
// l'app (`express.static`) — XSS stockée triviale. La limite de taille
// évite en plus de pouvoir remplir le disque avec un seul fichier énorme.
const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif'])

const upload = multer({
  storage,
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      return cb(new Error('Seules les images sont acceptées (JPEG, PNG, WEBP, GIF, HEIC).'))
    }
    cb(null, true)
  },
})

export const uploadRouter = Router()
uploadRouter.use(requireAuth)

// Le disque est une ressource finie qui ne se régénère pas toute seule
// (contrairement au CPU) — même avec la limite de taille par fichier
// (15 Mo) et le rate-limit global de l'API, un compte pouvait encore
// enchaîner suffisamment d'uploads pour remplir le disque sur la durée.
// Généreux (100/heure) : largement au-dessus d'un usage terrain réel
// (photos avant/après une intervention).
const uploadLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 100 })

uploadRouter.post('/', uploadLimiter, (req, res) => {
  upload.single('file')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message ?? 'Fichier invalide.' })
    if (!req.file) return res.status(400).json({ error: 'Aucun fichier reçu.' })
    const folder = (req.body.folder || 'misc').replace(/[^a-z0-9-]/gi, '')
    res.json({ url: `/uploads/${folder}/${req.file.filename}` })
  })
})
