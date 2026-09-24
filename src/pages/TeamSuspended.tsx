import { CreditCard } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { useAuth } from '@/lib/auth'

export default function TeamSuspended() {
  const { logout } = useAuth()

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-4 px-6 text-center">
      <CreditCard className="size-12 text-muted-foreground" />
      <h1 className="text-lg font-semibold">Équipe suspendue</h1>
      <p className="max-w-xs text-sm text-muted-foreground">
        L'abonnement de ton équipe n'est plus à jour (paiement refusé ou annulé). Régularise-le pour retrouver
        l'accès — tes données sont conservées intactes.
      </p>
      <Button variant="outline" onClick={logout}>
        Se déconnecter
      </Button>
    </div>
  )
}
