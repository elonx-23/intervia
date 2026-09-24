import { CheckCircle2, XCircle } from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { useAuth } from '@/lib/auth'

// Retour du paiement Stripe Checkout (mode abonnement) — l'activation
// réelle de l'équipe se fait côté serveur via le webhook, pas ici. On invite
// juste à se reconnecter pour récupérer une session à jour une fois le
// webhook passé (quelques secondes en général). En cas d'annulation, le
// compte est toujours sans équipe (rien n'a été débité) : "/" retombe donc
// directement sur l'écran de choix des formules, sans repasser par le login.
export default function TeamPayment() {
  const [params] = useSearchParams()
  const { logout } = useAuth()
  const success = params.get('statut') === 'succes'

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-4 px-6 text-center">
      {success ? (
        <>
          <CheckCircle2 className="size-12 text-success" />
          <h1 className="text-lg font-semibold">Paiement reçu</h1>
          <p className="max-w-xs text-sm text-muted-foreground">
            Ton équipe est en cours d'activation — reconnecte-toi dans quelques secondes pour y accéder.
          </p>
          <Button onClick={logout}>Se reconnecter</Button>
        </>
      ) : (
        <>
          <XCircle className="size-12 text-muted-foreground" />
          <h1 className="text-lg font-semibold">Paiement annulé</h1>
          <p className="max-w-xs text-sm text-muted-foreground">
            Rien n'a été débité. Tu peux réessayer ou choisir une autre formule.
          </p>
          <Button asChild>
            <Link to="/">Choisir une autre formule</Link>
          </Button>
        </>
      )}
    </div>
  )
}
