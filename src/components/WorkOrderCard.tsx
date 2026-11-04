import { ChevronRight } from 'lucide-react'
import { Link } from 'react-router-dom'

import { Card } from '@/components/ui/card'
import { TradeIcon } from '@/components/TradeIcon'
import { STATUS_LABELS, type Intervention } from '@/lib/interventions'
import { INTERVENTION_TONE, type Tone } from '@/lib/tones'

// Classes écrites en toutes lettres (Tailwind ne génère que ce qu'il lit).
const DOT: Record<Tone, string> = {
  blue: 'bg-tone-blue',
  violet: 'bg-tone-violet',
  green: 'bg-tone-green',
  cyan: 'bg-tone-cyan',
  amber: 'bg-tone-amber',
  orange: 'bg-tone-orange',
  red: 'bg-tone-red',
  slate: 'bg-tone-slate',
}

// Carte de fiche, volontairement épurée : l'essentiel en deux lignes
// (client + prix, métier · ville + statut). Le détail est dans la fiche.
export function WorkOrderCard({ intervention: i }: { intervention: Intervention }) {
  const tone = INTERVENTION_TONE[i.status]
  const client = [i.client_first_name, i.client_last_name].filter(Boolean).join(' ')

  return (
    <Link to={`/interventions/${i.id}`} className="block">
      <Card className="flex-row items-center gap-3 px-4 py-3.5">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-secondary text-foreground">
          <TradeIcon trade={i.intervention_type} className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-3">
            <p className="truncate text-base font-semibold">{client || 'Client sans nom'}</p>
            {i.amount != null && (
              <p className="shrink-0 text-base font-bold">{i.amount.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} €</p>
            )}
          </div>
          <div className="mt-0.5 flex items-center justify-between gap-3 text-sm text-muted-foreground">
            <span className="truncate">{[i.intervention_type, i.city].filter(Boolean).join(' · ') || 'Intervention'}</span>
            <span className="flex shrink-0 items-center gap-1.5 font-medium text-foreground">
              <span className={`size-2 rounded-full ${DOT[tone]}`} />
              {STATUS_LABELS[i.status]}
            </span>
          </div>
        </div>
        <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
      </Card>
    </Link>
  )
}
