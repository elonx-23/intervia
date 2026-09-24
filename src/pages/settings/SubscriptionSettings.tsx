import { Sparkles } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Page } from '@/components/layout/Page'

// Aucun système d'abonnement n'existe encore — cet écran affiche
// honnêtement l'état actuel (gratuit, pas de formule payante) plutôt que de
// simuler des boutons qui ne feraient rien de réel derrière.
export default function SubscriptionSettings() {
  return (
    <Page title="Abonnement">
      <div className="flex flex-col gap-4">
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-6 text-center">
            <Sparkles className="size-8 text-muted-foreground" />
            <p className="text-base font-semibold">Plan actuel</p>
            <Badge variant="secondary">Gratuit</Badge>
            <p className="mt-1 text-sm text-muted-foreground">
              Aucun abonnement payant n'est actif. Un système de mise à niveau sera proposé ici prochainement.
            </p>
          </CardContent>
        </Card>

        <div className="flex flex-col gap-2">
          <Button disabled className="opacity-60">
            Mettre à niveau
          </Button>
          <Button variant="outline" disabled className="opacity-60">
            Restaurer les achats
          </Button>
        </div>

        <p className="px-1 text-center text-xs text-muted-foreground">Disponible prochainement.</p>
      </div>
    </Page>
  )
}
