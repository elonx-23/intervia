import { Eraser } from 'lucide-react'
import * as React from 'react'
import { Link } from 'react-router-dom'

import { SignaturePad, type SignaturePadHandle } from '@/components/SignaturePad'
import { Button } from '@/components/ui/button'
import { CenteredDialogContent, Dialog, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { signDocumentPublic, totalTTC, type PseDocument } from '@/lib/documents'
import { friendlyError } from '@/lib/errors'

// Bulle de signature pour le client, depuis le lien public reçu par email
// (pas de session) — même matériau que SignOnDeviceDialog (signature au
// doigt, acceptation des CGV), mais pointe vers /mentions-legales plutôt
// que /reglages/conditions : cette dernière n'a pas vocation à être
// consultée hors session.
export function PublicSignatureDialog({
  document: doc,
  open,
  onOpenChange,
  onSigned,
}: {
  document: PseDocument
  open: boolean
  onOpenChange: (open: boolean) => void
  onSigned: (doc: PseDocument) => void
}) {
  const padRef = React.useRef<SignaturePadHandle>(null)
  const [saving, setSaving] = React.useState(false)
  const [acceptCgv, setAcceptCgv] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const ttc = totalTTC(doc.items, doc.vat_rate, doc.discount_type, doc.discount_value)

  React.useEffect(() => {
    if (open) {
      setAcceptCgv(false)
      setError(null)
      padRef.current?.clear()
    }
  }, [open])

  const submit = async () => {
    if (!padRef.current || padRef.current.isEmpty()) {
      setError('Merci de signer avant de valider.')
      return
    }
    if (!acceptCgv) {
      setError('Merci d’accepter les conditions générales de vente pour valider la signature.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const updated = await signDocumentPublic(doc.public_token, padRef.current.toDataURL())
      onSigned(updated)
      onOpenChange(false)
    } catch (e) {
      setError(friendlyError(e, 'Erreur lors de la signature.'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <CenteredDialogContent className="flex max-h-[94dvh] w-[calc(100%-1.25rem)] max-w-xl flex-col overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Signer le devis</DialogTitle>
          <DialogDescription>
            {doc.number} · {ttc.toFixed(2)} € TTC
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">Signature</p>
            <Button variant="ghost" size="sm" onClick={() => padRef.current?.clear()}>
              <Eraser className="size-4" /> Effacer
            </Button>
          </div>
          <SignaturePad
            ref={padRef}
            className="h-[58dvh] w-full touch-none rounded-2xl border border-border bg-white shadow-inner"
          />
        </div>

        <label className="flex items-start gap-2.5 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={acceptCgv}
            onChange={(e) => setAcceptCgv(e.target.checked)}
            className="mt-0.5 size-4 shrink-0 rounded border-input"
            style={{ accentColor: 'var(--primary)' }}
          />
          <span>
            J'accepte les{' '}
            <Link to="/mentions-legales" target="_blank" className="text-primary underline underline-offset-2">
              conditions générales de vente
            </Link>
            .
          </span>
        </label>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <Button size="lg" onClick={submit} disabled={saving}>
          {saving ? 'Envoi…' : 'Valider la signature'}
        </Button>
      </CenteredDialogContent>
    </Dialog>
  )
}
