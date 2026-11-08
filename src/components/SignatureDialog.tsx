import { ArrowLeft, Eraser, Loader2 } from 'lucide-react'
import * as React from 'react'

import { CgvText, SignatureConsent } from '@/components/SignatureConsent'
import { SignaturePad, type SignaturePadHandle } from '@/components/SignaturePad'
import { Button } from '@/components/ui/button'
import { CenteredDialogContent, Dialog, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { signDocumentPublic, type PseDocument } from '@/lib/documents'
import { friendlyError } from '@/lib/errors'

// Fenêtre de signature d'un devis / d'une facture — la même sur le téléphone
// du technicien et sur la page reçue par le client. Elle tient TOUJOURS dans
// l'écran : la zone de signature prend la hauteur disponible, et la case
// d'acceptation + le bouton « Valider » restent fixés en bas, visibles sans
// rien faire défiler (glisser sur la zone de signature dessine, il ne fait
// pas défiler : un bouton caché sous l'écran devenait inatteignable).
export function SignatureDialog({
  document: doc,
  open,
  onOpenChange,
  onSigned,
  title,
  description,
}: {
  document: PseDocument
  open: boolean
  onOpenChange: (open: boolean) => void
  onSigned: (doc: PseDocument) => void
  title: string
  description: React.ReactNode
}) {
  const padRef = React.useRef<SignaturePadHandle>(null)
  const [hasDrawn, setHasDrawn] = React.useState(false)
  const [accepted, setAccepted] = React.useState(false)
  const [showCgv, setShowCgv] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [consentInvalid, setConsentInvalid] = React.useState(false)

  // Repart d'un état propre à chaque ouverture — sinon la signature/le
  // consentement d'un client précédent pourrait rester pour le suivant.
  React.useEffect(() => {
    if (!open) return
    setAccepted(false)
    setShowCgv(false)
    setError(null)
    setConsentInvalid(false)
    setHasDrawn(false)
    padRef.current?.clear()
  }, [open])

  const submit = async () => {
    if (!padRef.current || padRef.current.isEmpty()) {
      setShowCgv(false)
      setError('Signez dans le cadre blanc avant de valider.')
      return
    }
    if (!accepted) {
      setConsentInvalid(true)
      setError('Cochez la case ci-dessus pour accepter et valider.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const updated = await signDocumentPublic(doc.public_token, padRef.current.toDataURL())
      onSigned(updated)
      onOpenChange(false)
    } catch (e) {
      setError(friendlyError(e, 'Erreur lors de la signature, réessayez.'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <CenteredDialogContent className="flex h-[min(94svh,760px)] w-[calc(100%-1.25rem)] max-w-xl flex-col gap-3 overflow-hidden p-4 sm:p-5">
        <DialogHeader className="shrink-0 pr-8 text-left">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        {/* Zone centrale : signature (ou lecture des CGV). */}
        <div className="flex min-h-0 flex-1 flex-col gap-2">
          {showCgv ? (
            <>
              <Button variant="ghost" size="sm" className="w-fit shrink-0 px-2" onClick={() => setShowCgv(false)}>
                <ArrowLeft className="size-4" /> Retour à la signature
              </Button>
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain rounded-2xl border border-border bg-background/60 p-3">
                <CgvText />
              </div>
            </>
          ) : (
            <div className="flex shrink-0 items-center justify-between">
              <p className="text-sm font-medium">Signez dans le cadre</p>
              <Button variant="ghost" size="sm" onClick={() => padRef.current?.clear()} disabled={!hasDrawn}>
                <Eraser className="size-4" /> Effacer
              </Button>
            </div>
          )}
          {/* Toujours montée (gardée pendant la lecture des CGV) pour ne pas perdre la signature. */}
          <SignaturePad
            ref={padRef}
            onChange={(drawn) => {
              setHasDrawn(drawn)
              if (drawn) setError(null)
            }}
            className={`min-h-[120px] w-full flex-1 rounded-2xl border border-border bg-white shadow-inner ${showCgv ? 'hidden' : ''}`}
          />
        </div>

        {/* Bas fixe : acceptation + validation, toujours visibles. */}
        <div className="flex shrink-0 flex-col gap-2.5">
          <SignatureConsent
            kind={doc.kind === 'facture' ? 'facture' : 'devis'}
            checked={accepted}
            onChange={(v) => {
              setAccepted(v)
              if (v) {
                setConsentInvalid(false)
                setError(null)
              }
            }}
            onReadCgv={() => setShowCgv(true)}
            invalid={consentInvalid}
          />
          {error && <p className="text-sm font-medium text-destructive">{error}</p>}
          <Button size="lg" onClick={submit} disabled={saving} className="w-full">
            {saving ? <Loader2 className="size-4 animate-spin" /> : null}
            {saving ? 'Envoi…' : 'Valider la signature'}
          </Button>
        </div>
      </CenteredDialogContent>
    </Dialog>
  )
}
