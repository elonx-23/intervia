import { ArrowDownLeft, ArrowUpRight, ClipboardList, FileText, Phone } from 'lucide-react'
import * as React from 'react'
import { Link } from 'react-router-dom'

import { EmptyState } from '@/components/layout/EmptyState'
import { Loader } from '@/components/Loader'
import { RecordingPlayer } from '@/components/RecordingPlayer'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { useLiveEvents } from '@/hooks/useLiveEvents'
import { useAuth } from '@/lib/auth'
import { friendlyError } from '@/lib/errors'
import { formatPhone, listCalls, retryTranscription, type CallRecord } from '@/lib/telephony'

function fmtDuration(seconds: number | null) {
  if (!seconds) return null
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

function statusVariant(status: string): 'success' | 'warning' | 'destructive' | 'outline' {
  if (status === 'terminé') return 'success'
  if (status === 'en-cours') return 'warning'
  if (status === 'manqué' || status === 'échoué') return 'destructive'
  return 'outline'
}

function CallCard({ call, hasOpenaiKey, onChanged }: { call: CallRecord; hasOpenaiKey: boolean; onChanged: () => void }) {
  const { session } = useAuth()
  const number = call.direction === 'inbound' ? call.from_number : call.to_number
  const [retrying, setRetrying] = React.useState(false)

  const retry = async () => {
    if (!session) return
    setRetrying(true)
    try {
      await retryTranscription(session.sessionId, call.id)
      onChanged()
    } finally {
      setRetrying(false)
    }
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            {call.direction === 'inbound' ? (
              <ArrowDownLeft className="size-4 shrink-0 text-primary" />
            ) : (
              <ArrowUpRight className="size-4 shrink-0 text-muted-foreground" />
            )}
            <div className="min-w-0">
              <p className="truncate font-medium">{call.client_name || formatPhone(number) || 'Numéro masqué'}</p>
              {call.client_name && number && <p className="truncate text-xs text-muted-foreground">{formatPhone(number)}</p>}
            </div>
          </div>
          <Badge variant={statusVariant(call.status)}>{call.status}</Badge>
        </div>

        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>{new Date(call.started_at).toLocaleString('fr-FR')}</span>
          {fmtDuration(call.duration_seconds) && <span>· {fmtDuration(call.duration_seconds)}</span>}
        </div>

        {call.intervention_id && (
          <Link
            to={`/interventions/${call.intervention_id}`}
            className="flex w-fit items-center gap-2 rounded-xl border border-sky-500/30 bg-sky-500/10 px-3 py-1.5 text-sm font-medium"
          >
            <ClipboardList className="size-4 text-sky-600 dark:text-sky-400" />
            Fiche {call.intervention_reference} créée depuis cet appel
          </Link>
        )}

        {call.recording_url && session && <RecordingPlayer callId={call.id} sessionId={session.sessionId} />}

        {call.transcription && (
          <div className="flex items-start gap-2 rounded-xl bg-secondary/40 p-3 text-sm">
            <FileText className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <p className="min-w-0 whitespace-pre-line">{call.transcription}</p>
          </div>
        )}
        {call.transcription_status === 'en_attente' && (
          <p className="text-xs text-muted-foreground">Transcription en cours…</p>
        )}
        {call.recording_url && !call.transcription && !call.transcription_status && !hasOpenaiKey && (
          <p className="text-xs text-muted-foreground">Transcription non activée.</p>
        )}
        {call.transcription_status === 'erreur' && hasOpenaiKey && (
          <div className="flex items-center gap-2">
            <p className="text-xs text-muted-foreground">Transcription indisponible.</p>
            <Button variant="outline" size="sm" onClick={retry} disabled={retrying}>
              {retrying ? 'Relance…' : 'Réessayer'}
            </Button>
          </div>
        )}

        {number && /^\+?\d[\d\s.]{5,}$/.test(number) && (
          <div className="pt-1">
            <Button variant="outline" size="sm" asChild>
              <a href={`tel:${number}`}>
                <Phone className="size-4" /> Rappeler
              </a>
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// Journal des appels : écoute, transcription, rappel et lien vers la fiche
// créée automatiquement. Se rafraîchit en direct dès qu'un appel arrive.
export function CallsPanel({ hasOpenaiKey, refreshKey }: { hasOpenaiKey: boolean; refreshKey: number }) {
  const { session } = useAuth()
  const [calls, setCalls] = React.useState<CallRecord[] | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  const load = React.useCallback(() => {
    if (!session) return
    listCalls(session.sessionId)
      .then((rows) => {
        setCalls(rows)
        setError(null)
      })
      .catch((e) => setError(friendlyError(e, 'Erreur de chargement.')))
  }, [session])

  React.useEffect(() => {
    load()
  }, [load, refreshKey])

  useLiveEvents(['call_update'], load)

  return (
    <div className="flex flex-col gap-3">
      {error && <p className="text-sm text-destructive">{error}</p>}
      {!calls && !error && <Loader className="py-8" />}
      {calls && calls.length === 0 && <EmptyState label="Aucun appel pour l'instant" />}
      {calls?.map((c) => <CallCard key={c.id} call={c} hasOpenaiKey={hasOpenaiKey} onChanged={load} />)}
    </div>
  )
}
