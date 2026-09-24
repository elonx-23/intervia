// Doit être le tout premier import de index.mjs (voir ce fichier) : en ESM,
// TOUS les imports d'un module sont évalués avant le moindre code de ce
// module lui-même, quel que soit l'ordre d'écriture dans le fichier source.
// Un `process.loadEnvFile('.env')` écrit "avant" les autres imports dans
// index.mjs s'exécute donc en réalité APRÈS eux — trop tard pour un module
// comme push.mjs qui lit `process.env.VAPID_*` dès son évaluation. En
// isolant le chargement du .env dans son propre module sans dépendance et en
// l'important en premier, il s'exécute avant tout le reste de la chaîne
// d'imports (db.mjs, routes/*, push.mjs…).
try {
  process.loadEnvFile('.env')
} catch {
  // pas de .env (dev sans email/Stripe/push configurés) — pas bloquant
}
