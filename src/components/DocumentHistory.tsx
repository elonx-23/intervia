import { Check, FileText, Mail, MailOpen, MousePointerClick, PenLine, Receipt, TriangleAlert } from 'lucide-react'
import * as React from 'react'
import type { ComponentType, ReactNode } from 'react'
import { Link } from 'react-router-dom'

import { Badge } from '@/components/ui/badge'
import { useLiveEvents } from '@/hooks/useLiveEvents'
import { useAuth } from '@/lib/auth'
import { getDocumentEmails, type DocumentEmail, type PseDocument } from '@/lib/documents'

interface Event {
  icon: ComponentType<{ className?: string }>
  label: ReactNode
  date: string
  detail?: ReactNode
}

function fmt(iso: string) {
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

// Chronologie des événements connus du document — reconstruite à partir des
// horodatages déjà enregistrés (pas un vrai journal d'audit ligne à ligne,
// mais suffisant pour retracer le parcours du devis/facture). `convertedFacture`
// (uniquement pour un devis) affiche un lien direct vers la facture générée.
// Suivi d'un email : reçu par la messagerie, ouvert, lien cliqué.
function EmailTracking({ email }: { email: DocumentEmail }) {
  if (email.status === 'echec') {
    return <p className="text-xs text-destructive">Non envoyé : {email.error || 'erreur inconnue'}</p>
  }
  if (email.status === 'envoi_en_cours') return <p className="text-xs text-muted-foreground">Envoi en cours…</p>
  return (
    <div className="mt-1 flex flex-wrap items-center gap-1.5">
      <Badge variant="outline" className="text-[10px]">
        <Mail className="size-3" /> Envoyé
      </Badge>
      {email.opened_at ? (
        <Badge variant="success" className="text-[10px]">
          <MailOpen className="size-3" /> Ouvert{email.open_count > 1 ? ` ${email.open_count}×` : ''} · {fmt(email.opened_at)}
        </Badge>
      ) : (
        <Badge variant="outline" className="text-[10px] text-muted-foreground">
          Pas encore ouvert
        </Badge>
      )}
      {email.clicked_at ? (
        <Badge variant="success" className="text-[10px]">
          <MousePointerClick className="size-3" /> Lien cliqué{email.click_count > 1 ? ` ${email.click_count}×` : ''} · {fmt(email.clicked_at)}
        </Badge>
      ) : (
        <Badge variant="outline" className="text-[10px] text-muted-foreground">
          Lien pas encore cliqué
        </Badge>
      )}
    </div>
  )
}

export function DocumentHistory({ doc, convertedFacture }: { doc: PseDocument; convertedFacture?: PseDocument | null }) {
  const { session } = useAuth()
  const [emails, setEmails] = React.useState<DocumentEmail[]>([])

  const loadEmails = React.useCallback(() => {
    if (!session) return
    getDocumentEmails(session.sessionId, doc.id)
      .then(setEmails)
      .catch(() => {})
  }, [session, doc.id])

  React.useEffect(() => {
    loadEmails()
  }, [loadEmails])
  // Ouverture / clic du client : l'historique se met à jour tout seul.
  useLiveEvents(['documents_changed'], loadEmails)

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

  for (const email of emails) {
    events.push({
      icon: email.status === 'echec' ? TriangleAlert : Mail,
      label: `${email.kind === 'relance' ? 'Relance envoyée' : 'Envoyé par email'}${email.to_email ? ` à ${email.to_email}` : ''}`,
      date: email.sent_at,
      detail: <EmailTracking email={email} />,
    })
  }

  // Relances d'avant le suivi des emails (pas de ligne détaillée pour elles).
  if (doc.last_relance_at && !emails.some((e) => e.kind === 'relance')) {
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
            {event.detail}
          </div>
        </div>
      ))}
      {sorted.length === 1 && (
        <p className="text-sm text-muted-foreground">Aucun autre événement pour le moment.</p>
      )}
    </div>
  )
}
