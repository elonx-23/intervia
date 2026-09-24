import { Check } from 'lucide-react'
import * as React from 'react'

import { Card, CardContent } from '@/components/ui/card'
import { Page } from '@/components/layout/Page'
import { useAuth } from '@/lib/auth'
import { friendlyError } from '@/lib/errors'
import { getRegion, updateRegion } from '@/lib/settings'

const REGIONS = [
  { code: 'FR', label: 'France' },
  { code: 'BE', label: 'Belgique' },
  { code: 'CH', label: 'Suisse' },
  { code: 'LU', label: 'Luxembourg' },
  { code: 'CA', label: 'Canada' },
]

export default function RegionSettings() {
  const { session } = useAuth()
  const [region, setRegion] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!session) return
    getRegion(session.sessionId)
      .then((r) => setRegion(r.region))
      .catch((e) => setError(friendlyError(e, 'Erreur de chargement.')))
  }, [session])

  const choose = async (code: string) => {
    if (!session) return
    setRegion(code)
    try {
      await updateRegion(session.sessionId, code)
    } catch (e) {
      setError(friendlyError(e, 'Erreur.'))
    }
  }

  return (
    <Page title="Région">
      <div className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">
          Région d'utilisation de l'app — sert de base pour les futurs réglages régionaux (devise, formats de date…).
        </p>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="flex flex-col gap-2">
          {REGIONS.map((r) => (
            <button key={r.code} type="button" onClick={() => choose(r.code)} className="text-left">
              <Card className="liquid py-3">
                <CardContent className="flex items-center gap-3 px-4">
                  <span className="min-w-0 flex-1 text-sm font-medium">{r.label}</span>
                  {region === r.code && <Check className="size-5 shrink-0 text-primary" />}
                </CardContent>
              </Card>
            </button>
          ))}
        </div>
      </div>
    </Page>
  )
}
