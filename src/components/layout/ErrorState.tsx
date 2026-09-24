import { AlertTriangle } from 'lucide-react'

import { Button } from '@/components/ui/button'

// Pendant pour EmptyState, mais pour un échec de chargement plutôt qu'une
// liste vide — teinte destructive, bouton "Retour" optionnel pour ne jamais
// laisser l'utilisateur sur une impasse (surtout après un lien direct/QR
// code pointant vers une ressource qu'il n'a plus le droit de voir).
export function ErrorState({ label, onBack }: { label: string; onBack?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-destructive/30 bg-destructive/5 py-14 text-center text-sm">
      <AlertTriangle className="size-6 text-destructive/70" />
      <p className="text-destructive">{label}</p>
      {onBack && (
        <Button variant="outline" size="sm" onClick={onBack}>
          Retour
        </Button>
      )}
    </div>
  )
}
