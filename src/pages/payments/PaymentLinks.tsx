import { Check, Copy, Download, Link2, Loader2, MessageCircle, MessageSquare, QrCode, Share2, X } from 'lucide-react'
import QRCode from 'qrcode'
import * as React from 'react'
import { Link } from 'react-router-dom'

import { Page } from '@/components/layout/Page'
import { useLiveEvents } from '@/hooks/useLiveEvents'
import { NumberInput } from '@/components/NumberInput'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { useAuth } from '@/lib/auth'
import { friendlyError } from '@/lib/errors'
import {
  PROVIDER_LABEL,
  cancelPaymentLink,
  createPaymentLink,
  getIntegrations,
  listPaymentLinks,
  type IntegrationsOverview,
  type PaymentLink,
  type PaymentProvider,
} from '@/lib/payments'

const euros = (n: number) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(n)
const when = (iso: string) => new Date(iso).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

const STATUS: Record<PaymentLink['status'], { label: string; variant: 'success' | 'warning' | 'outline' }> = {
  en_attente: { label: 'En attente', variant: 'warning' },
  paye: { label: 'Payé', variant: 'success' },
  annule: { label: 'Annulé', variant: 'outline' },
}

// Lien prêt : QR code à scanner, copie, envoi par WhatsApp ou SMS, partage.
function LinkResult({ link, onClose }: { link: PaymentLink; onClose?: () => void }) {
  const [qr, setQr] = React.useState<string | null>(null)
  const [copied, setCopied] = React.useState(false)
  const text = `${link.description} : ${euros(link.amount)}. Pour régler en ligne : ${link.url}`

  React.useEffect(() => {
    QRCode.toDataURL(link.url, { width: 640, margin: 2 }).then(setQr).catch(() => setQr(null))
  }, [link.url])

  const copy = async () => {
    await navigator.clipboard.writeText(link.url).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }
  const share = () => navigator.share?.({ title: link.description, text, url: link.url }).catch(() => {})
  const isApple = /iPhone|iPad|iPod/.test(navigator.userAgent)

  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-3">
        <div className="flex w-full items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-2xl font-bold">{euros(link.amount)}</p>
            <p className="truncate text-sm text-muted-foreground">{link.description}</p>
          </div>
          {onClose && (
            <Button variant="ghost" size="icon" className="size-8" onClick={onClose} aria-label="Fermer">
              <X className="size-4" />
            </Button>
          )}
        </div>
        {qr ? (
          <img src={qr} alt="QR code du lien de paiement" className="size-56 rounded-xl bg-white p-2" />
        ) : (
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        )}
        <p className="text-center text-xs text-muted-foreground">Le client scanne ce QR code avec son téléphone pour payer.</p>
        <div className="flex w-full items-center gap-2 rounded-xl bg-secondary/50 px-3 py-2">
          <Link2 className="size-4 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate text-xs">{link.url}</span>
        </div>
        <div className="grid w-full grid-cols-2 gap-2">
          <Button variant="outline" size="sm" onClick={copy}>
            {copied ? <Check className="size-4" /> : <Copy className="size-4" />} {copied ? 'Copié' : 'Copier le lien'}
          </Button>
          {qr && (
            <Button variant="outline" size="sm" asChild>
              <a href={qr} download={`paiement-${link.amount}eur.png`}>
                <Download className="size-4" /> QR code
              </a>
            </Button>
          )}
          <Button variant="outline" size="sm" asChild>
            <a href={`https://wa.me/?text=${encodeURIComponent(text)}`} target="_blank" rel="noreferrer">
              <MessageCircle className="size-4" /> WhatsApp
            </a>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <a href={`sms:${isApple ? '&' : '?'}body=${encodeURIComponent(text)}`}>
              <MessageSquare className="size-4" /> SMS
            </a>
          </Button>
          {'share' in navigator && (
            <Button variant="outline" size="sm" className="col-span-2" onClick={share}>
              <Share2 className="size-4" /> Partager
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

// Page « Lien de paiement » : montant + motif → lien, QR code, envoi. En
// dessous, les liens déjà créés et leur état (payé / en attente).
export default function PaymentLinks() {
  const { session } = useAuth()
  const [integrations, setIntegrations] = React.useState<IntegrationsOverview | null>(null)
  const [links, setLinks] = React.useState<PaymentLink[]>([])
  const [amount, setAmount] = React.useState(0)
  const [description, setDescription] = React.useState('')
  const [provider, setProvider] = React.useState<PaymentProvider | null>(null)
  const [created, setCreated] = React.useState<PaymentLink | null>(null)
  const [shown, setShown] = React.useState<PaymentLink | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const loadLinks = React.useCallback(() => {
    if (!session) return
    listPaymentLinks(session.sessionId)
      .then(setLinks)
      .catch(() => {})
  }, [session])

  React.useEffect(() => {
    if (!session) return
    getIntegrations(session.sessionId)
      .then((d) => {
        setIntegrations(d)
        setProvider(d.defaultProvider)
      })
      .catch((e) => setError(friendlyError(e, 'Erreur de chargement.')))
    loadLinks()
  }, [session, loadLinks])

  // Un client vient de payer (retour de PayPal) : la liste se met à jour seule.
  useLiveEvents(['payments_changed'], loadLinks)

  const generate = async () => {
    if (!session) return
    setBusy(true)
    setError(null)
    try {
      const link = await createPaymentLink(session.sessionId, { amount, description, provider: provider ?? undefined })
      setCreated(link)
      setShown(null)
      setAmount(0)
      setDescription('')
      loadLinks()
    } catch (e) {
      setError(friendlyError(e, 'Impossible de créer le lien.'))
    } finally {
      setBusy(false)
    }
  }

  const cancel = async (id: string) => {
    if (!session) return
    await cancelPaymentLink(session.sessionId, id).catch(() => {})
    loadLinks()
  }

  const connected = integrations && (integrations.stripe.connected || integrations.paypal.connected)
  const both = integrations?.stripe.connected && integrations?.paypal.connected
  const testMode = provider != null && integrations?.[provider].mode === 'test'

  return (
    <Page title="Lien de paiement">
      <div className="flex flex-col gap-4">
        {integrations && !connected && (
          <Card>
            <CardContent className="flex flex-col gap-2">
              <p className="text-sm">Pour créer des liens de paiement, relie d'abord ton compte Stripe ou PayPal.</p>
              <Button asChild className="w-fit">
                <Link to="/reglages/integrations">Ouvrir Réglages → Intégrations</Link>
              </Button>
            </CardContent>
          </Card>
        )}

        {connected && !created && (
          <Card>
            <CardContent className="flex flex-col gap-3">
              {both && provider && (
                <SegmentedControl
                  options={[
                    { value: 'stripe', label: 'Stripe' },
                    { value: 'paypal', label: 'PayPal' },
                  ]}
                  value={provider}
                  onChange={setProvider}
                />
              )}
              <div className="flex flex-col gap-2">
                <Label>Montant (€)</Label>
                <NumberInput value={amount} onValueChange={setAmount} placeholder="0,00" className="h-14 text-2xl font-bold" />
              </div>
              <div className="flex flex-col gap-2">
                <Label>Motif</Label>
                <Input placeholder="Ex. Ouverture de porte, facture FAC-012…" value={description} onChange={(e) => setDescription(e.target.value)} />
              </div>
              {testMode && (
                <p className="rounded-xl bg-tone-amber-soft px-3 py-2 text-xs text-tone-amber-ink">
                  Mode test : ce lien n'encaisse pas de vrai argent. Pour de vrais paiements, mets tes identifiants Live dans Réglages →
                  Intégrations.
                </p>
              )}
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button size="lg" onClick={generate} disabled={busy || amount < 1 || !description.trim()}>
                {busy ? <Loader2 className="size-4 animate-spin" /> : <QrCode className="size-4" />}
                Générer le lien et le QR code
              </Button>
            </CardContent>
          </Card>
        )}

        {created && (
          <>
            <LinkResult link={created} />
            <Button variant="outline" onClick={() => setCreated(null)}>
              Nouveau lien de paiement
            </Button>
          </>
        )}

        {shown && !created && <LinkResult link={shown} onClose={() => setShown(null)} />}

        {links.length > 0 && (
          <div className="flex flex-col gap-2">
            <p className="text-sm font-semibold">Liens créés</p>
            {links.map((l) => {
              const st = STATUS[l.status]
              return (
                <Card key={l.id}>
                  <CardContent className="flex items-center gap-3 py-3">
                    <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setShown(l)}>
                      <p className="flex items-center gap-2 text-sm font-semibold">
                        {euros(l.amount)}
                        <Badge variant={st.variant} className="text-[10px]">
                          {st.label}
                        </Badge>
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {l.description} · {PROVIDER_LABEL[l.provider]} · {l.status === 'paye' && l.paid_at ? `payé le ${when(l.paid_at)}` : when(l.created_at)}
                      </p>
                    </button>
                    <Button variant="ghost" size="icon" className="size-8" onClick={() => setShown(l)} aria-label="Afficher le QR code">
                      <QrCode className="size-4" />
                    </Button>
                    {l.status === 'en_attente' && (
                      <Button variant="ghost" size="icon" className="size-8 text-muted-foreground" onClick={() => cancel(l.id)} aria-label="Annuler le lien">
                        <X className="size-4" />
                      </Button>
                    )}
                  </CardContent>
                </Card>
              )
            })}
          </div>
        )}
      </div>
    </Page>
  )
}
