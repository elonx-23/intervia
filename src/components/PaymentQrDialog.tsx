import { Lock } from 'lucide-react'
import QRCode from 'qrcode'
import * as React from 'react'

import { StripeMark, StripeWordmark, STRIPE_PURPLE } from '@/components/StripeMark'
import { Button } from '@/components/ui/button'
import { CenteredDialogContent, Dialog, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useIsDark } from '@/hooks/useIsDark'
import { getDocument } from '@/lib/documents'
import type { PseDocument } from '@/lib/documents'

// Affiche le lien de paiement Stripe sous forme de QR code, à faire scanner
// par le client avec son propre téléphone (le sien fait alors la saisie de
// carte / Apple Pay / Google Pay, pas celui du technicien). Pendant que la
// boîte est ouverte, on revérifie périodiquement la facture pour détecter
// automatiquement le paiement une fois le webhook Stripe reçu.
export function PaymentQrDialog({
  open,
  onOpenChange,
  url,
  sessionId,
  documentId,
  onPaid,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  url: string | null
  sessionId: string
  documentId: string
  onPaid: (doc: PseDocument) => void
}) {
  const [qrDataUrl, setQrDataUrl] = React.useState<string | null>(null)
  const isDark = useIsDark()

  React.useEffect(() => {
    if (!url) {
      setQrDataUrl(null)
      return
    }
    // Génération standard de la lib `qrcode` — un rendu "points arrondis"
    // fait main a été essayé puis abandonné : les proportions des motifs de
    // détection (les 3 coins) doivent suivre un ratio précis (1:1:3:1:1)
    // pour qu'un lecteur les reconnaisse, et un rendu maison les avait
    // cassées, rendant le code illisible. La palette suit quand même le
    // thème (violet profond sur blanc en clair, lavande claire sur sombre en
    // sombre) via l'option native de la lib, sans rien recalculer soi-même.
    QRCode.toDataURL(url, {
      width: 320,
      margin: 2,
      color: { dark: isDark ? '#c4b5fd' : '#3b0f6e', light: isDark ? '#1a1330' : '#ffffff' },
    })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(null))
  }, [url, isDark])

  React.useEffect(() => {
    if (!open || !url) return
    const interval = setInterval(async () => {
      try {
        const doc = await getDocument(sessionId, documentId)
        if (doc.status === 'payee') {
          onPaid(doc)
          onOpenChange(false)
        }
      } catch {
        // silencieux — on retentera au prochain intervalle
      }
    }, 3000)
    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, url, sessionId, documentId])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <CenteredDialogContent>
        <DialogHeader>
          <div className="flex items-center justify-between gap-2 pr-6">
            <DialogTitle>Présentez ce code au client</DialogTitle>
            <StripeWordmark size={18} className="text-sm" />
          </div>
        </DialogHeader>
        <div className="flex flex-col items-center gap-4">
          {/* Cadre violet façon Stripe : anneau dégradé + halo, pour que le
              QR code se reconnaisse immédiatement comme un paiement Stripe
              sécurisé, pas juste une image quelconque. Le fond de la carte
              elle-même suit le thème (blanc en clair, surface sombre en
              sombre) plutôt que de rester blanc de force. */}
          <div
            className="relative rounded-[2rem] p-[3px]"
            style={{
              background: `linear-gradient(135deg, ${STRIPE_PURPLE}, #a78bfa)`,
              boxShadow: `0 8px 32px -8px ${STRIPE_PURPLE}66`,
            }}
          >
            <div
              className="flex size-64 items-center justify-center rounded-[calc(2rem-3px)] p-5"
              style={{ backgroundColor: isDark ? '#1a1330' : '#ffffff' }}
            >
              {qrDataUrl ? (
                <img src={qrDataUrl} alt="QR code de paiement" className="size-full" />
              ) : (
                <p className="text-center text-sm text-muted-foreground">Génération du code…</p>
              )}
            </div>
            <div
              className="absolute -bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-full py-1 pr-3.5 pl-3 text-xs font-medium text-white shadow-md"
              style={{ backgroundColor: STRIPE_PURPLE }}
            >
              <Lock className="size-3 shrink-0" />
              <span className="flex items-center gap-1.5">
                Paiement sécurisé
                <StripeMark size={22} tone="onBrand" className="-my-1" />
              </span>
            </div>
          </div>

          <p className="text-center text-sm text-muted-foreground">
            Le client scanne ce code avec l'appareil photo de son téléphone pour ouvrir la page de paiement
            sécurisée Stripe.
          </p>
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="size-2 animate-pulse rounded-full" style={{ backgroundColor: STRIPE_PURPLE }} />
            En attente du paiement…
          </p>
          {url && (
            <Button variant="outline" size="sm" onClick={() => window.open(url, '_blank')}>
              <StripeMark size={16} />
              Ouvrir le lien sur cet appareil
            </Button>
          )}
        </div>
      </CenteredDialogContent>
    </Dialog>
  )
}
