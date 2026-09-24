import { cn } from '@/lib/utils'

export const STRIPE_PURPLE = '#635BFF'

// Petit badge "S" façon Stripe (carré arrondi violet + lettre blanche) —
// pas le logo officiel copié (aucun asset propriétaire embarqué), une
// composition maison au même esprit visuel, pour signaler clairement au
// client que le paiement passe par Stripe sans ambiguïté avec le reste de
// l'app.
export function StripeMark({
  size = 22,
  className,
  tone = 'brand',
}: {
  size?: number
  className?: string
  // 'brand' : carré violet + lettre blanche (usage normal, sur fond clair/sombre neutre).
  // 'onBrand' : carré blanc + lettre violette, avec une légère ombre pour se
  // détacher comme un vrai petit icône d'app — pensé pour être posé sur un
  // fond déjà violet Stripe (ex. la pastille "Paiement sécurisé"), où la
  // version 'brand' se fondrait dans le fond.
  tone?: 'brand' | 'onBrand'
}) {
  return (
    <div
      className={cn('flex shrink-0 items-center justify-center rounded-[28%] font-bold', className)}
      style={{
        width: size,
        height: size,
        backgroundColor: tone === 'onBrand' ? '#ffffff' : STRIPE_PURPLE,
        color: tone === 'onBrand' ? STRIPE_PURPLE : '#ffffff',
        fontSize: size * 0.62,
        boxShadow: tone === 'onBrand' ? '0 1px 3px rgba(0,0,0,0.35)' : undefined,
      }}
      aria-hidden="true"
    >
      S
    </div>
  )
}

// Version "wordmark" (icône + texte) — utilisée partout où on veut dire
// clairement "ceci passe par Stripe", pas juste une puce de couleur.
export function StripeWordmark({ size = 20, className }: { size?: number; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 font-semibold', className)} style={{ color: STRIPE_PURPLE }}>
      <StripeMark size={size} />
      Stripe
    </span>
  )
}
