import { CheckCircle2, CreditCard, Loader2, Wallet } from 'lucide-react'
import * as React from 'react'

import { Page } from '@/components/layout/Page'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { useAuth } from '@/lib/auth'
import { friendlyError } from '@/lib/errors'
import {
  getIntegrations,
  removeIntegration,
  saveStripe,
  saveZettle,
  setDefaultProvider,
  type IntegrationsOverview,
  type PaymentProvider,
} from '@/lib/payments'

// Réglages → Intégrations : les clés de paiement de l'entreprise (Stripe ou
// PayPal POS / Zettle), pour générer des liens de paiement. Vérifiées à
// l'enregistrement, gardées côté serveur, jamais réaffichées en clair.
export default function IntegrationsSettings() {
  const { session } = useAuth()
  const [data, setData] = React.useState<IntegrationsOverview | null>(null)
  const [stripeKey, setStripeKey] = React.useState('')
  const [zettleId, setZettleId] = React.useState('')
  const [zettleKey, setZettleKey] = React.useState('')
  const [busy, setBusy] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!session) return
    getIntegrations(session.sessionId)
      .then(setData)
      .catch((e) => setError(friendlyError(e, 'Erreur de chargement.')))
  }, [session])

  const run = async (key: string, action: (sessionId: string) => Promise<IntegrationsOverview>) => {
    if (!session) return
    setBusy(key)
    setError(null)
    try {
      setData(await action(session.sessionId))
      setStripeKey('')
      setZettleId('')
      setZettleKey('')
    } catch (e) {
      setError(friendlyError(e, 'Erreur, réessaie.'))
    } finally {
      setBusy(null)
    }
  }

  const both = data?.stripe.connected && data?.zettle.connected
  const DefaultChoice = ({ provider }: { provider: PaymentProvider }) =>
    both ? (
      data?.defaultProvider === provider ? (
        <p className="text-xs font-medium text-primary">Utilisé par défaut pour les liens de paiement</p>
      ) : (
        <Button variant="ghost" size="sm" className="w-fit" disabled={busy !== null} onClick={() => run('default', (id) => setDefaultProvider(id, provider))}>
          Utiliser par défaut
        </Button>
      )
    ) : null

  return (
    <Page title="Intégrations">
      <div className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">
          Relie ton compte de paiement pour créer des liens de paiement (avec QR code) depuis le tableau de bord. L'argent arrive
          directement sur ton compte.
        </p>
        {error && <p className="text-sm text-destructive">{error}</p>}
        {!data && !error && <Loader2 className="size-5 animate-spin text-muted-foreground" />}

        {data && (
          <>
            <Card>
              <CardContent className="flex flex-col gap-3">
                <div className="flex items-center gap-3">
                  <CreditCard className="size-6 text-[#635BFF]" />
                  <div>
                    <p className="font-semibold">Stripe</p>
                    <p className="text-xs text-muted-foreground">Carte bancaire, Apple Pay, Google Pay</p>
                  </div>
                </div>
                {data.stripe.connected ? (
                  <>
                    <p className="flex items-center gap-2 text-sm">
                      <CheckCircle2 className="size-4 text-success" /> Relié · clé {data.stripe.key}
                      {data.stripe.mode === 'test' ? ' · mode test' : ''}
                    </p>
                    <DefaultChoice provider="stripe" />
                    <Button variant="ghost" size="sm" className="w-fit text-destructive" disabled={busy !== null} onClick={() => run('rm-stripe', (id) => removeIntegration(id, 'stripe'))}>
                      Retirer la clé
                    </Button>
                  </>
                ) : (
                  <>
                    <Input
                      type="password"
                      autoComplete="off"
                      placeholder="Clé secrète (sk_live_…)"
                      value={stripeKey}
                      onChange={(e) => setStripeKey(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">Dans Stripe : Développeurs → Clés API → Clé secrète.</p>
                    <Button className="w-fit" disabled={!stripeKey.trim() || busy !== null} onClick={() => run('stripe', (id) => saveStripe(id, stripeKey))}>
                      {busy === 'stripe' ? <Loader2 className="size-4 animate-spin" /> : 'Enregistrer'}
                    </Button>
                  </>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardContent className="flex flex-col gap-3">
                <div className="flex items-center gap-3">
                  <Wallet className="size-6 text-[#003087]" />
                  <div>
                    <p className="font-semibold">PayPal POS (Zettle)</p>
                    <p className="text-xs text-muted-foreground">Ton compte PayPal POS</p>
                  </div>
                </div>
                {data.zettle.connected ? (
                  <>
                    <p className="flex items-center gap-2 text-sm">
                      <CheckCircle2 className="size-4 text-success" /> Relié · Client ID {data.zettle.clientId}
                    </p>
                    <DefaultChoice provider="zettle" />
                    <Button variant="ghost" size="sm" className="w-fit text-destructive" disabled={busy !== null} onClick={() => run('rm-zettle', (id) => removeIntegration(id, 'zettle'))}>
                      Retirer les clés
                    </Button>
                  </>
                ) : (
                  <>
                    <Input autoComplete="off" placeholder="Client ID" value={zettleId} onChange={(e) => setZettleId(e.target.value)} />
                    <Input type="password" autoComplete="off" placeholder="Clé API" value={zettleKey} onChange={(e) => setZettleKey(e.target.value)} />
                    <p className="text-xs text-muted-foreground">Sur developer.zettle.com : crée une intégration, puis copie son Client ID et sa clé API.</p>
                    <Button
                      className="w-fit"
                      disabled={!zettleId.trim() || !zettleKey.trim() || busy !== null}
                      onClick={() => run('zettle', (id) => saveZettle(id, zettleId, zettleKey))}
                    >
                      {busy === 'zettle' ? <Loader2 className="size-4 animate-spin" /> : 'Enregistrer'}
                    </Button>
                  </>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </Page>
  )
}
