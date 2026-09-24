import { Check, Copy } from 'lucide-react'
import * as React from 'react'

import { StripeWordmark } from '@/components/StripeMark'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Page } from '@/components/layout/Page'
import { useAuth } from '@/lib/auth'
import { friendlyError } from '@/lib/errors'
import { apiFetch } from '@/lib/api'
import { getStripeStatus, type StripeStatus } from '@/lib/payments'

function TutorialStep({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
        {n}
      </span>
      <p className="text-sm text-muted-foreground">{children}</p>
    </div>
  )
}

export default function IntegrationsSettings() {
  const { session } = useAuth()
  const [status, setStatus] = React.useState<StripeStatus | null>(null)
  const [secretKey, setSecretKey] = React.useState('')
  const [webhookSecret, setWebhookSecret] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [saved, setSaved] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [urlCopied, setUrlCopied] = React.useState(false)

  const webhookUrl = `${window.location.origin}/api/stripe/webhook`
  const copyWebhookUrl = () => {
    navigator.clipboard
      .writeText(webhookUrl)
      .then(() => {
        setUrlCopied(true)
        setTimeout(() => setUrlCopied(false), 2000)
      })
      .catch(() => {})
  }

  const load = React.useCallback(() => {
    if (!session) return
    getStripeStatus(session.sessionId)
      .then(setStatus)
      .catch((e) => setError(friendlyError(e, 'Erreur de chargement.')))
  }, [session])

  React.useEffect(() => {
    load()
  }, [load])

  const save = async () => {
    if (!session) return
    setBusy(true)
    setError(null)
    setSaved(false)
    try {
      await apiFetch('/api/stripe/credentials', {
        method: 'POST',
        sessionId: session.sessionId,
        body: { secretKey: secretKey || undefined, webhookSecret: webhookSecret || undefined },
      })
      setSecretKey('')
      setWebhookSecret('')
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
      load()
    } catch (e) {
      setError(friendlyError(e, 'Erreur lors de la sauvegarde.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Page title="Intégrations">
      <div className="flex flex-col gap-4">
        <Card>
          <CardContent className="flex flex-col gap-2">
            <StripeWordmark size={24} className="text-base" />
            <p className="text-xs text-muted-foreground">
              Les liens et QR codes de paiement sur les factures ("Envoyer un lien de paiement") passent
              exclusivement par Stripe — aucun autre prestataire de paiement.
            </p>
            {status?.configured ? (
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <Badge variant="success">Connecté</Badge>
                {status.live_mode !== undefined && (
                  <Badge variant={status.live_mode ? 'destructive' : 'outline'}>
                    {status.live_mode ? 'Mode réel' : 'Mode test'}
                  </Badge>
                )}
                {status.key_last4 && (
                  <span className="text-xs text-muted-foreground">se termine par ••{status.key_last4}</span>
                )}
              </div>
            ) : (
              <p className="mt-1 text-sm text-muted-foreground">Non configuré pour l'instant.</p>
            )}
            {status?.webhook_configured === false && (
              <p className="text-xs text-warning">
                Webhook non configuré : les factures ne passeront pas "Payée" automatiquement après paiement.
              </p>
            )}
          </CardContent>
        </Card>

        {!status?.configured && (
          <Card>
            <CardContent className="flex flex-col gap-4">
              <p className="text-sm font-semibold">Comment activer le paiement en ligne</p>

              <TutorialStep n={1}>
                Crée un compte sur{' '}
                <a href="https://stripe.com" target="_blank" rel="noreferrer" className="text-primary underline-offset-2 hover:underline">
                  stripe.com
                </a>{' '}
                si tu n'en as pas déjà un (gratuit, aucun frais tant que tu n'encaisses rien).
              </TutorialStep>

              <TutorialStep n={2}>
                Dans le tableau de bord Stripe, va dans{' '}
                <a
                  href="https://dashboard.stripe.com/apikeys"
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary underline-offset-2 hover:underline"
                >
                  Développeurs → Clés API
                </a>
                , puis copie la <strong>clé secrète</strong> (elle commence par <code>sk_</code> ou <code>rk_</code>) et colle-la
                ci-dessous.
              </TutorialStep>

              <TutorialStep n={3}>
                Toujours dans Stripe, va dans{' '}
                <a
                  href="https://dashboard.stripe.com/webhooks"
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary underline-offset-2 hover:underline"
                >
                  Développeurs → Webhooks
                </a>{' '}
                → <strong>Ajouter un endpoint</strong>. Colle cette adresse comme URL :
                <span className="mt-2 flex items-center gap-2">
                  <code className="min-w-0 flex-1 truncate rounded-lg bg-secondary/60 px-2.5 py-1.5 text-xs">
                    {webhookUrl}
                  </code>
                  <Button variant="outline" size="icon" className="size-8 shrink-0" onClick={copyWebhookUrl} aria-label="Copier l'adresse">
                    {urlCopied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                  </Button>
                </span>
              </TutorialStep>

              <TutorialStep n={4}>
                Sélectionne l'événement <code>checkout.session.completed</code>, valide, puis copie le{' '}
                <strong>secret de signature</strong> affiché (il commence par <code>whsec_</code>) et colle-le ci-dessous.
              </TutorialStep>

              <TutorialStep n={5}>
                Clique sur <strong>Enregistrer</strong> en bas de cette page — c'est tout, tes techniciens pourront tout de
                suite envoyer des liens de paiement par QR code sur les factures.
              </TutorialStep>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardContent className="flex flex-col gap-3">
            <div className="flex flex-col gap-2">
              <Label>Clé secrète Stripe</Label>
              <Input
                type="password"
                placeholder={status?.configured ? 'Laisser vide pour ne pas changer' : 'sk_live_… ou sk_test_…'}
                value={secretKey}
                onChange={(e) => setSecretKey(e.target.value)}
                autoComplete="off"
              />
              <p className="text-xs text-muted-foreground">
                Disponible sur{' '}
                <a
                  href="https://dashboard.stripe.com/apikeys"
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary underline-offset-2 hover:underline"
                >
                  dashboard.stripe.com/apikeys
                </a>
              </p>
            </div>
            <div className="flex flex-col gap-2">
              <Label>Secret du webhook</Label>
              <Input
                type="password"
                placeholder={status?.webhook_configured ? 'Laisser vide pour ne pas changer' : 'whsec_…'}
                value={webhookSecret}
                onChange={(e) => setWebhookSecret(e.target.value)}
                autoComplete="off"
              />
              <p className="text-xs text-muted-foreground">
                Créé sur{' '}
                <a
                  href="https://dashboard.stripe.com/webhooks"
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary underline-offset-2 hover:underline"
                >
                  dashboard.stripe.com/webhooks
                </a>{' '}
                (événement <code>checkout.session.completed</code>).
              </p>
            </div>
          </CardContent>
        </Card>

        {error && <p className="text-sm text-destructive">{error}</p>}
        {saved && <p className="text-sm text-success">Enregistré.</p>}

        <Button onClick={save} disabled={busy || (!secretKey && !webhookSecret)}>
          {busy ? 'Enregistrement…' : 'Enregistrer'}
        </Button>
      </div>
    </Page>
  )
}
