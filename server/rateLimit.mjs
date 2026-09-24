// Limiteur de débit léger, en mémoire — pas de nouvelle dépendance, cohérent
// avec le reste du projet. Suffisant pour un serveur mono-process autohébergé
// (pas de Redis à coordonner entre plusieurs instances, il n'y en a qu'une).
// Objectif : empêcher le brute-force des connexions (le code technicien à 6
// chiffres n'a que 1 000 000 de combinaisons — sans limite c'est cassable en
// quelques minutes) et le spam d'emails (inscription, mot de passe oublié).
const buckets = new Map()

// Purge périodique des compteurs expirés — sans ça, une IP qui ne revient
// jamais laisse une entrée en mémoire indéfiniment.
setInterval(
  () => {
    const now = Date.now()
    for (const [key, bucket] of buckets) {
      if (bucket.resetAt <= now) buckets.delete(key)
    }
  },
  10 * 60 * 1000,
).unref()

export function rateLimit({ windowMs, max, keyFn }) {
  return (req, res, next) => {
    const key = `${req.path}:${(keyFn ?? ((r) => r.ip))(req)}`
    const now = Date.now()
    const bucket = buckets.get(key)

    if (!bucket || bucket.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + windowMs })
      return next()
    }

    if (bucket.count >= max) {
      res.set('Retry-After', String(Math.ceil((bucket.resetAt - now) / 1000)))
      return res.status(429).json({ error: 'Trop de tentatives, réessaie dans quelques minutes.' })
    }

    bucket.count += 1
    next()
  }
}
