import { Check, FileText, Mail, PenLine, Receipt } from 'lucide-react'
import type { ComponentType, ReactNode } from 'react'
import { Link } from 'react-router-dom'

import type { PseDocument } from '@/lib/documents'

interface Event {
  icon: ComponentType<{ className?: string }>
  label: ReactNode
  date: string
}

function fmt(iso: string) {
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

// Chronologie des événements connus du document — reconstruite à partir des
// horodatages déjà enregistrés (pas un vrai journal d'audit ligne à ligne,
// mais suffisant pour retracer le parcours du devis/facture). `convertedFacture`
// (uniquement pour un devis) affiche un lien direct vers la facture générée.
export function DocumentHistory({ doc, convertedFacture }: { doc: PseDocument; convertedFacture?: PseDocument | null }) {
  const events: Event[] = [
    { icon: FileText, label: `${doc.kind === 'devis' ? 'Devis' : 'Facture'} créé${doc.kind === 'facture' ? 'e' : ''}`, date: doc.created_at },
  ]

  if (doc.kind === 'facture' && doc.source_devis_id) {
    events.push({ icon: FileText, label: "Générée à partir d'un devis signé", date: doc.created_at })
  }

  if (doc.signed_at) {
    events.push({
      icon: PenLine,
      label: doc.kind === 'devis' ? 'Devis accepté et signé' : 'Signée par le client',
      date: doc.signed_at,
    })
  }

  if (convertedFacture) {
    events.push({
      icon: Receipt,
      label: (
        <>
          Transformé en facture{' '}
          <Link to={`/factures/${convertedFacture.id}/modifier`} className="text-primary underline-offset-2 hover:underline">
            {convertedFacture.number}
          </Link>
        </>
      ),
      date: convertedFacture.created_at,
    })
  }

  if (doc.last_relance_at) {
    events.push({
      icon: Mail,
      label: `Relance envoyée${doc.relance_count > 1 ? ` (${doc.relance_count}×)` : ''}`,
      date: doc.last_relance_at,
    })
  }

  if (doc.paid_at) {
    events.push({
      icon: Check,
      label: `Marquée payée${doc.payment_method ? ` — ${doc.payment_method}` : ''}`,
      date: doc.paid_at,
    })
  }

  const sorted = events.sort((a, b) => a.date.localeCompare(b.date))

  return (
    <div className="flex flex-col gap-4 py-2">
      {sorted.map((event, i) => (
        <div key={i} className="flex gap-3">
          <div className="flex flex-col items-center">
            <span className="glass flex size-8 shrink-0 items-center justify-center rounded-full text-primary">
              <event.icon className="size-4" />
            </span>
            {i < sorted.length - 1 && <span className="mt-1 h-full w-px flex-1 bg-border" />}
          </div>
          <div className="pb-4">
            <p className="text-sm font-medium">{event.label}</p>
            <p className="text-xs text-muted-foreground">{fmt(event.date)}</p>
          </div>
        </div>
      ))}
      {sorted.length === 1 && (
        <p className="text-sm text-muted-foreground">Aucun autre événement pour le moment.</p>
      )}
    </div>
  )
}
