import { Check, Copy, MapPin } from 'lucide-react'
import { Link } from 'react-router-dom'

import { Card } from '@/components/ui/card'
import { TradeIcon } from '@/components/TradeIcon'
import { STATUS_LABELS, type Intervention, type InterventionStatus } from '@/lib/interventions'
import { INTERVENTION_TONE, friendlyDate, type Tone } from '@/lib/tones'

// Étapes du parcours d'une intervention, dans l'ordre (barre de progression).
const STEPS: InterventionStatus[] = ['en_attente', 'assignee', 'acceptee', 'en_cours', 'terminee', 'facturee']
const stepIndex = (s: InterventionStatus) => (s === 'validee' ? 4 : STEPS.indexOf(s))

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

// Carte « bon d'intervention » : style outil de terrain plutôt que carte
// décorative — référence en étiquette technique, statut avec un témoin
// lumineux, barre de progression en étapes (comme un suivi de colis) et une
// grille d'informations clés.
export function WorkOrderCard({
  intervention: i,
  technician,
  showCopy,
  copied,
  onCopy,
}: {
  intervention: Intervention
  technician: string | null
  showCopy: boolean
  copied: boolean
  onCopy: () => void
}) {
  const tone = INTERVENTION_TONE[i.status]
  const current = stepIndex(i.status)
  const client = [i.client_first_name, i.client_last_name].filter(Boolean).join(' ')
  const place = [i.address, i.city].filter(Boolean).join(', ')

  return (
    <Card className="gap-0 overflow-hidden py-0">
      <Link to={`/interventions/${i.id}`} className="flex flex-col">
        {/* Ligne technique : référence, ancienneté, statut. */}
        <div className="flex items-center justify-between gap-2 px-4 pt-3.5">
          <div className="flex min-w-0 items-center gap-2">
            <span className="rounded-md bg-secondary px-1.5 py-0.5 font-mono text-[11px] font-semibold tracking-wider text-secondary-foreground">
              {i.reference}
            </span>
            <span className="truncate text-xs text-muted-foreground">{friendlyDate(i.created_at)}</span>
          </div>
          <span className="flex shrink-0 items-center gap-1.5 text-xs font-semibold">
            <span className={`relative flex size-2 rounded-full ${DOT[tone]}`}>
              {(i.status === 'en_attente' || i.status === 'en_cours') && (
                <span className={`absolute inset-0 animate-ping rounded-full opacity-60 motion-reduce:hidden ${DOT[tone]}`} />
              )}
            </span>
            {STATUS_LABELS[i.status]}
          </span>
        </div>

        {/* Client et lieu. */}
        <div className="flex flex-col gap-1 px-4 pt-2.5">
          <p className="truncate text-[17px] leading-snug font-semibold tracking-tight">{client || 'Client sans nom'}</p>
          {place && (
            <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <MapPin className="size-3.5 shrink-0" />
              <span className="truncate">{place}</span>
            </p>
          )}
        </div>

        {/* Parcours : Reçue → Assignée → Acceptée → En cours → Terminée → Facturée. */}
        <div className="flex gap-1 px-4 pt-3" aria-label={`Étape ${current + 1} sur ${STEPS.length} : ${STATUS_LABELS[i.status]}`}>
          {STEPS.map((step, idx) => (
            <span key={step} className={`h-1 flex-1 rounded-full ${idx <= current ? DOT[tone] : 'bg-secondary'}`} />
          ))}
        </div>

        {/* Grille d'informations clés. */}
        <div className="mt-3 grid grid-cols-[1.1fr_1.2fr_0.8fr] divide-x divide-border/70 border-t border-border/70">
          <div className="min-w-0 px-4 py-2.5">
            <p className="text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">Métier</p>
            <p className="flex items-center gap-1.5 truncate text-sm font-semibold">
              <TradeIcon trade={i.intervention_type} className="size-3.5 shrink-0 text-muted-foreground" />
              <span className="truncate">{i.intervention_type || '—'}</span>
            </p>
          </div>
          <div className="min-w-0 px-3 py-2.5">
            <p className="text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">Technicien</p>
            <p className={`truncate text-sm font-semibold ${technician ? '' : 'text-tone-amber-ink'}`}>{technician ?? 'À attribuer'}</p>
          </div>
          <div className="min-w-0 px-3 py-2.5 text-right">
            <p className="text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">Prix</p>
            <p className="truncate text-sm font-bold">{i.amount != null ? `${String(i.amount).replace('.', ',')} €` : '—'}</p>
          </div>
        </div>
      </Link>
      {showCopy && (
        <button
          type="button"
          onClick={onCopy}
          className="flex h-10 items-center justify-center gap-2 border-t border-border/70 text-sm font-medium text-muted-foreground active:bg-secondary"
        >
          {copied ? <Check className="size-4 text-tone-green" /> : <Copy className="size-4" />}
          {copied ? 'Fiche copiée' : 'Copier la fiche'}
        </button>
      )}
    </Card>
  )
}
