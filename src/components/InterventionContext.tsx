import { ChevronDown, ChevronUp, Clock, ExternalLink, KeyRound, MapPin, Phone, PhoneIncoming, UserRound, Users } from 'lucide-react'
import * as React from 'react'
import { Link } from 'react-router-dom'

import { CallSummary } from '@/components/CallSummary'
import { RecordingPlayer } from '@/components/RecordingPlayer'
import { TradeIcon } from '@/components/TradeIcon'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { useAuth } from '@/lib/auth'
import { STATUS_LABELS, getIntervention, listTechnicians, type Intervention } from '@/lib/interventions'
import { INTERVENTION_TONE } from '@/lib/tones'
import { getShares, type TakenBy } from '@/lib/whatsapp'

const hm = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : null

function Row({ icon: Icon, children }: { icon: React.ComponentType<{ className?: string }>; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 text-sm">
      <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}

// Devis / facture (admin) : toutes les infos de la fiche d'origine — client,
// technicien sur place, horaires, prix annoncé, appel reçu — repliées par
// défaut pour ne pas charger l'écran.
export function InterventionContext({ interventionId }: { interventionId: string }) {
  const { session } = useAuth()
  const [open, setOpen] = React.useState(false)
  const [i, setI] = React.useState<Intervention | null>(null)
  const [tech, setTech] = React.useState<string | null>(null)
  const [takenBy, setTakenBy] = React.useState<TakenBy | null>(null)

  React.useEffect(() => {
    if (!session) return
    let cancelled = false
    getIntervention(session.sessionId, interventionId)
      .then(async (data) => {
        if (cancelled) return
        setI(data)
        if (data.technicien_id) {
          const techs = await listTechnicians(session.sessionId).catch(() => [])
          const t = techs.find((x) => x.id === data.technicien_id)
          if (!cancelled && t) setTech(`${t.first_name} ${t.last_name}`.trim())
        }
        const shares = await getShares(session.sessionId, interventionId).catch(() => null)
        if (!cancelled && shares) setTakenBy(shares.takenBy)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [session, interventionId])

  if (!i || !session) return null
  const client = [i.client_first_name, i.client_last_name].filter(Boolean).join(' ')
  const address = [i.address, [i.postal_code, i.city].filter(Boolean).join(' ')].filter(Boolean).join(', ')
  const onSite = tech ?? takenBy?.name ?? null

  return (
    <Card className="gap-0 py-0">
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-3 px-4 py-3 text-left">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-secondary">
          <TradeIcon trade={i.intervention_type} className="size-[18px]" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="text-sm font-semibold">Intervention {i.reference}</span>
            <Badge variant={INTERVENTION_TONE[i.status]}>{STATUS_LABELS[i.status]}</Badge>
          </span>
          <span className="block truncate text-xs text-muted-foreground">
            {[client, onSite && `Technicien : ${onSite}`].filter(Boolean).join(' · ')}
          </span>
        </span>
        {open ? <ChevronUp className="size-5 text-muted-foreground" /> : <ChevronDown className="size-5 text-muted-foreground" />}
      </button>

      {open && (
        <CardContent className="flex flex-col gap-3 border-t border-border/70 px-4 py-4">
          <Row icon={UserRound}>
            <p className="font-semibold">{client || 'Client sans nom'}</p>
            {i.description && <p className="text-muted-foreground">{i.description}</p>}
          </Row>
          {i.phone && (
            <Row icon={Phone}>
              <a href={`tel:${i.phone.replace(/\s/g, '')}`} className="font-medium text-primary">
                {i.phone}
              </a>
            </Row>
          )}
          {address && (
            <Row icon={MapPin}>
              <p>{address}</p>
            </Row>
          )}
          {(i.floor || i.access_codes) && (
            <Row icon={KeyRound}>
              <p>{[i.floor && `Étage ${i.floor.replace(/^étage\s*/i, '')}`, i.access_codes && `Code ${i.access_codes}`].filter(Boolean).join(' · ')}</p>
            </Row>
          )}
          <Row icon={Users}>
            <p>
              Technicien sur place : <span className="font-semibold">{onSite ?? 'non attribué'}</span>
              {takenBy && !tech ? ` (${takenBy.percent === 50 ? '50/50' : `${takenBy.percent} %`})` : ''}
            </p>
          </Row>
          <Row icon={Clock}>
            <p className="text-muted-foreground">
              {[`Reçue le ${hm(i.created_at)}`, i.started_at && `arrivée le ${hm(i.started_at)}`, i.completed_at && `terminée le ${hm(i.completed_at)}`]
                .filter(Boolean)
                .join(' · ')}
            </p>
          </Row>
          {i.amount != null && (
            <p className="text-sm">
              Prix annoncé : <span className="font-bold">{i.amount.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} €</span>
            </p>
          )}

          {i.source_call_id && (
            <div className="flex flex-col gap-2 rounded-xl bg-secondary/60 p-3">
              <p className="flex items-center gap-2 text-sm font-semibold">
                <PhoneIncoming className="size-4 text-tone-cyan" /> Appel reçu du client
              </p>
              <RecordingPlayer callId={i.source_call_id} sessionId={session.sessionId} />
              <CallSummary callId={i.source_call_id} sessionId={session.sessionId} />
            </div>
          )}

          <Link to={`/interventions/${i.id}`} className="flex items-center gap-1.5 text-sm font-semibold text-primary">
            <ExternalLink className="size-4" /> Ouvrir la fiche
          </Link>
        </CardContent>
      )}
    </Card>
  )
}
