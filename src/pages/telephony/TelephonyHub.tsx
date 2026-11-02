import { Hash, Loader2, PhoneCall, RefreshCw, Settings2 } from 'lucide-react'
import * as React from 'react'
import { useSearchParams } from 'react-router-dom'

import { Loader } from '@/components/Loader'
import { Page } from '@/components/layout/Page'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { useAuth } from '@/lib/auth'
import { friendlyError } from '@/lib/errors'
import { formatPhone, getTelephonyStatus, syncCalls, type TelephonyStatus } from '@/lib/telephony'

import { CallsPanel } from './CallsPanel'
import { NumbersPanel } from './NumbersPanel'
import { SettingsPanel } from './SettingsPanel'

type Tab = 'appels' | 'numeros' | 'reglages'

// L'espace Téléphonie, à part du reste de l'app : les appels reçus sur les
// numéros 01 (écoute, transcription, fiche créée toute seule), l'achat et la
// gestion des numéros, et les réglages (téléphones, enregistrement, titulaire).
// L'onglet actif vit dans l'URL (?onglet=…) pour qu'un lien ou un retour
// arrière ramène au bon endroit.
export default function TelephonyHub() {
  const { session } = useAuth()
  const [params, setParams] = useSearchParams()
  const [status, setStatus] = React.useState<TelephonyStatus | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [refreshing, setRefreshing] = React.useState(false)
  const [refreshKey, setRefreshKey] = React.useState(0)

  const raw = params.get('onglet')
  const tab: Tab = raw === 'numeros' || raw === 'reglages' ? raw : 'appels'

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

  const go = (t: Tab) => setParams({ onglet: t }, { replace: true })

  return (
    <Page title="Téléphonie">
      <div className="flex flex-col gap-4">
        <SegmentedControl<Tab>
          value={tab}
          onChange={go}
          options={[
            { value: 'appels', label: 'Appels', icon: PhoneCall },
            { value: 'numeros', label: 'Numéros', icon: Hash },
            { value: 'reglages', label: 'Réglages', icon: Settings2 },
          ]}
        />

        {error && <p className="text-sm text-destructive">{error}</p>}
        {!status && !error && <Loader className="py-8" />}

        {status && tab === 'appels' && (
          <>
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
                        {status.numbers.length > 0 ? status.numbers.map((n) => formatPhone(n)).join(' · ') : 'Aucun numéro actif'}
                      </p>
                      {status.lastSyncError ? (
                        <p className="text-destructive">{status.lastSyncError}</p>
                      ) : status.numbers.length === 0 ? (
                        <button type="button" className="text-primary underline-offset-2 hover:underline" onClick={() => go('numeros')}>
                          Acheter un numéro
                        </button>
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
            <CallsPanel hasOpenaiKey={status.hasOpenaiKey} refreshKey={refreshKey} />
          </>
        )}

        {status && tab === 'numeros' && <NumbersPanel refreshKey={refreshKey} onOpenSettings={() => go('reglages')} onChanged={loadStatus} />}
        {status && tab === 'reglages' && <SettingsPanel onSaved={loadStatus} />}
      </div>
    </Page>
  )
}
