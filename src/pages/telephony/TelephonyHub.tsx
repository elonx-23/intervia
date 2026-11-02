import { Loader2, RefreshCw } from 'lucide-react'
import * as React from 'react'

import { Loader } from '@/components/Loader'
import { Page } from '@/components/layout/Page'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { useAuth } from '@/lib/auth'
import { friendlyError } from '@/lib/errors'
import { formatPhone, getTelephonyStatus, syncCalls, type TelephonyStatus } from '@/lib/telephony'

import { CallsPanel } from './CallsPanel'

// L'espace Téléphonie, à part du reste de l'app : les appels reçus sur le
// numéro 01 (écoute, transcription, fiche créée toute seule) et l'état de la
// ligne. La ligne elle-même (numéros, renvoi vers les deux téléphones) se
// gère chez OVH, pas ici.
export default function TelephonyHub() {
  const { session } = useAuth()
  const [status, setStatus] = React.useState<TelephonyStatus | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [refreshing, setRefreshing] = React.useState(false)
  const [refreshKey, setRefreshKey] = React.useState(0)

  const loadStatus = React.useCallback(() => {
    if (!session) return
    getTelephonyStatus(session.sessionId)
      .then(setStatus)
      .catch((e) => setError(friendlyError(e, 'Erreur de chargement.')))
  }, [session])

  React.useEffect(() => {
    loadStatus()
  }, [loadStatus])

  const refresh = async () => {
    if (!session) return
    setRefreshing(true)
    try {
      await syncCalls(session.sessionId)
      loadStatus()
      setRefreshKey((k) => k + 1)
    } catch (e) {
      setError(friendlyError(e, "Erreur lors de l'actualisation."))
    } finally {
      setRefreshing(false)
    }
  }

  return (
    <Page title="Téléphonie">
      <div className="flex flex-col gap-4">
        {error && <p className="text-sm text-destructive">{error}</p>}
        {!status && !error && <Loader className="py-8" />}

        {status && (
          <Card>
            <CardContent className="flex items-center justify-between gap-3">
              <div className="min-w-0 text-sm">
                {!status.configured ? (
                  <>
                    <p className="font-medium">Ligne non branchée</p>
                    <p className="text-muted-foreground">La téléphonie n'est pas encore branchée sur ton compte.</p>
                  </>
                ) : (
                  <>
                    <p className="font-medium">
                      {status.numbers.length > 0
                        ? status.numbers.map((n) => formatPhone(n)).join(' · ')
                        : 'Aucun numéro actif chez OVH'}
                    </p>
                    {status.lastSyncError ? (
                      <p className="text-destructive">{status.lastSyncError}</p>
                    ) : (
                      <p className="text-muted-foreground">
                        {status.lastSyncAt
                          ? `Mis à jour à ${new Date(status.lastSyncAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`
                          : 'Première mise à jour en cours…'}
                      </p>
                    )}
                  </>
                )}
              </div>
              {status.configured && (
                <Button variant="outline" size="sm" onClick={refresh} disabled={refreshing} aria-label="Actualiser les appels">
                  {refreshing ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
                  Actualiser
                </Button>
              )}
            </CardContent>
          </Card>
        )}

        {status && <CallsPanel hasOpenaiKey={status.hasOpenaiKey} refreshKey={refreshKey} />}
      </div>
    </Page>
  )
}
