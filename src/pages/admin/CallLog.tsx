import { ArrowDownLeft, ArrowUpRight, FileText, Loader2, Play } from 'lucide-react'
import * as React from 'react'

import { EmptyState } from '@/components/layout/EmptyState'
import { Loader } from '@/components/Loader'
import { Page } from '@/components/layout/Page'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { useAuth } from '@/lib/auth'
import { friendlyError } from '@/lib/errors'
import { listCalls, type CallRecord } from '@/lib/telephony'

// L'enregistrement vit chez Twilio, protégé par Basic Auth (identifiants de
// l'équipe, jamais exposés au navigateur) — impossible de le pointer
// directement en src= d'un <audio> comme une image publique. On le récupère
// en blob via un fetch authentifié (même header x-session-id que le reste de
// l'app) à la demande, pas au chargement de la liste.
function RecordingPlayer({ callId, sessionId }: { callId: string; sessionId: string }) {
  const [url, setUrl] = React.useState<string | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState(false)

  const load = async () => {
    setLoading(true)
    setError(false)
    try {
      const res = await fetch(`/api/telephony/calls/${callId}/recording`, { headers: { 'x-session-id': sessionId } })
      if (!res.ok) throw new Error()
      const blob = await res.blob()
      setUrl(URL.createObjectURL(blob))
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }

  if (url) return <audio controls autoPlay className="h-9 w-full" src={url} />

  return (
    <Button variant="outline" size="sm" onClick={load} disabled={loading} className="w-fit">
      {loading ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
      {error ? 'Erreur, réessayer' : 'Écouter'}
    </Button>
  )
}

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

function transcriptionLabel(status: string | null) {
  if (status === 'en_attente') return 'Transcription en cours…'
  if (status === 'erreur') return 'Transcription indisponible'
  return null
}

// Historique de tous les appels (entrants renvoyés vers le mobile de
// l'admin, sortants déclenchés depuis une fiche client) — lecture seule,
// alimenté par les webhooks Twilio côté serveur (server/routes/telephony.mjs).
export default function CallLog() {
  const { session } = useAuth()
  const sessionId = session?.sessionId
  const [calls, setCalls] = React.useState<CallRecord[] | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!session) return
    listCalls(session.sessionId)
      .then(setCalls)
      .catch((e) => setError(friendlyError(e, 'Erreur de chargement.')))
  }, [session])

  return (
    <Page title="Appels">
      <div className="flex flex-col gap-3">
        {error && <p className="text-sm text-destructive">{error}</p>}
        {!calls && !error && <Loader className="py-8" />}
        {calls && calls.length === 0 && <EmptyState label="Aucun appel pour l'instant" />}

        {calls?.map((c) => (
          <Card key={c.id}>
            <CardContent className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  {c.direction === 'inbound' ? (
                    <ArrowDownLeft className="size-4 text-primary" />
                  ) : (
                    <ArrowUpRight className="size-4 text-muted-foreground" />
                  )}
                  <span className="font-medium">{c.direction === 'inbound' ? c.from_number : c.to_number}</span>
                </div>
                <Badge variant={statusVariant(c.status)}>{c.status}</Badge>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>{new Date(c.started_at).toLocaleString('fr-FR')}</span>
                {fmtDuration(c.duration_seconds) && <span>· {fmtDuration(c.duration_seconds)}</span>}
              </div>
              {c.recording_url && sessionId && <RecordingPlayer callId={c.id} sessionId={sessionId} />}
              {c.transcription && (
                <div className="flex items-start gap-2 rounded-xl bg-secondary/40 p-3 text-sm">
                  <FileText className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  <p>{c.transcription}</p>
                </div>
              )}
              {transcriptionLabel(c.transcription_status) && (
                <p className="text-xs text-muted-foreground">{transcriptionLabel(c.transcription_status)}</p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </Page>
  )
}
