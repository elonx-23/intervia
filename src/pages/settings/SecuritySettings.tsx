import { ShieldAlert } from 'lucide-react'
import * as React from 'react'

import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Page } from '@/components/layout/Page'
import { useAuth } from '@/lib/auth'
import { friendlyError } from '@/lib/errors'
import { getLoginAttempts, type LoginAttemptsReport } from '@/lib/security'

function formatWhen(iso: string) {
  return new Date(iso).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export default function SecuritySettings() {
  const { session } = useAuth()
  const [report, setReport] = React.useState<LoginAttemptsReport | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!session) return
    getLoginAttempts(session.sessionId)
      .then(setReport)
      .catch((e) => setError(friendlyError(e, 'Erreur de chargement.')))
  }, [session])

  return (
    <Page title="Sécurité">
      <div className="flex flex-col gap-4">
        <Card>
          <CardContent className="flex flex-col gap-2">
            <p className="text-sm font-semibold">Tentatives de connexion échouées</p>
            <p className="text-xs text-muted-foreground">
              Chaque tentative de connexion (code technicien ou email/mot de passe) est limitée à 15 essais par
              15 minutes et par appareil, et journalisée ici pendant 30 jours.
            </p>
            {report && (
              <div className="mt-1">
                <Badge variant={report.failuresLast24h > 20 ? 'destructive' : report.failuresLast24h > 0 ? 'outline' : 'success'}>
                  {report.failuresLast24h} échec{report.failuresLast24h !== 1 ? 's' : ''} sur les dernières 24h
                </Badge>
              </div>
            )}
          </CardContent>
        </Card>

        {error && <p className="text-sm text-destructive">{error}</p>}

        {report && report.recentFailures.length === 0 && (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Aucune tentative échouée sur les 7 derniers jours.
          </p>
        )}

        {report && report.recentFailures.length > 0 && (
          <div className="flex flex-col gap-2">
            {report.recentFailures.map((a, i) => (
              <Card key={i}>
                <CardContent className="flex items-center gap-3 py-3">
                  <ShieldAlert className="size-4 shrink-0 text-destructive" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{a.identifier}</p>
                    <p className="text-xs text-muted-foreground">
                      {a.method === 'code' ? 'Code technicien' : 'Email/mot de passe'} · {formatWhen(a.created_at)}
                      {a.ip ? ` · ${a.ip}` : ''}
                    </p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </Page>
  )
}
