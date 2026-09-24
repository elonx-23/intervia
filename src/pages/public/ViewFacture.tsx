import { Eraser } from 'lucide-react'
import * as React from 'react'
import { useParams, useSearchParams } from 'react-router-dom'

import { SignaturePad, type SignaturePadHandle } from '@/components/SignaturePad'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  FACTURE_STATUS_LABELS,
  adjustmentLabel,
  discountAmount,
  getDocumentByToken,
  itemsTotalHT,
  signDocumentPublic,
  totalTTC,
  type PseDocument,
} from '@/lib/documents'
import { legalFooterLines } from '@/lib/company'
import { friendlyError } from '@/lib/errors'

export default function ViewFacture() {
  const { token } = useParams()
  const [searchParams] = useSearchParams()
  const paiement = searchParams.get('paiement')
  const [doc, setDoc] = React.useState<PseDocument | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [signError, setSignError] = React.useState<string | null>(null)
  const [signing, setSigning] = React.useState(false)
  const padRef = React.useRef<SignaturePadHandle>(null)

  React.useEffect(() => {
    if (!token) return
    getDocumentByToken(token)
      .then(setDoc)
      .catch((e) => setError(friendlyError(e, 'Facture introuvable.')))
  }, [token])

  // Retour de Stripe Checkout : le webhook qui marque la facture "payée" peut
  // arriver quelques instants après la redirection — on revérifie une fois.
  React.useEffect(() => {
    if (paiement !== 'succes' || !token) return
    const timer = setTimeout(() => {
      getDocumentByToken(token)
        .then(setDoc)
        .catch(() => {})
    }, 2500)
    return () => clearTimeout(timer)
  }, [paiement, token])

  if (error) {
    return (
      <div className="mx-auto flex min-h-svh w-full max-w-lg items-center justify-center px-4 text-center">
        <p className="text-sm text-destructive">{error}</p>
      </div>
    )
  }
  if (!doc) {
    return (
      <div className="mx-auto flex min-h-svh w-full max-w-lg items-center justify-center px-4 text-center">
        <p className="text-sm text-muted-foreground">Chargement…</p>
      </div>
    )
  }

  const client = [doc.client_first_name, doc.client_last_name].filter(Boolean).join(' ')
  const ht = itemsTotalHT(doc.items)
  const remise = discountAmount(ht, doc.discount_type, doc.discount_value)
  const adj = adjustmentLabel(remise)
  const ttc = totalTTC(doc.items, doc.vat_rate, doc.discount_type, doc.discount_value)

  const submitSignature = async () => {
    if (!token || !padRef.current || padRef.current.isEmpty()) {
      setSignError('Merci de signer avant de valider.')
      return
    }
    setSigning(true)
    setSignError(null)
    try {
      const updated = await signDocumentPublic(token, padRef.current.toDataURL())
      setDoc(updated)
    } catch (e) {
      setSignError(friendlyError(e, 'Erreur lors de la signature.'))
    } finally {
      setSigning(false)
    }
  }

  return (
    <div className="mx-auto flex min-h-svh w-full max-w-lg flex-col gap-4 px-4 py-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Facture {doc.number}</h1>
        <Badge variant={doc.status === 'payee' ? 'success' : 'warning'}>
          {FACTURE_STATUS_LABELS[doc.status as keyof typeof FACTURE_STATUS_LABELS]}
        </Badge>
      </div>
      {paiement === 'succes' && doc.status !== 'payee' && (
        <p className="rounded-md bg-success/10 p-3 text-sm text-success">
          Paiement reçu, confirmation en cours…
        </p>
      )}
      {paiement === 'annule' && (
        <p className="rounded-md bg-secondary p-3 text-sm text-muted-foreground">Paiement annulé.</p>
      )}
      <p className="text-sm text-muted-foreground">{client}</p>
      {doc.address && <p className="text-sm text-muted-foreground">{doc.address}</p>}
      {doc.due_date && (
        <p className="text-sm text-muted-foreground">Échéance : {new Date(doc.due_date).toLocaleDateString('fr-FR')}</p>
      )}

      <div className="flex flex-col gap-2 rounded-md border border-border p-3 text-sm">
        {doc.items.map((item, i) => (
          <div key={i} className="flex justify-between gap-2">
            <span className="min-w-0">
              <span className="block">{item.label} × {item.quantity}</span>
              {item.description && (
                <span className="block text-xs text-muted-foreground">{item.description}</span>
              )}
            </span>
            <span className="shrink-0">{(item.quantity * item.unitPrice).toFixed(2)} €</span>
          </div>
        ))}
        <div className="mt-2 flex flex-col items-end border-t border-border pt-2">
          <span>Total HT : {ht.toFixed(2)} €</span>
          {remise !== 0 && (
            <span>
              {adj.label} : {adj.sign}{adj.amount.toFixed(2)} €
            </span>
          )}
          <span className="font-semibold">Total TTC : {ttc.toFixed(2)} €</span>
        </div>
      </div>

      <Button
        onClick={async () => {
          const { downloadDocumentPdf } = await import('@/lib/pdf')
          downloadDocumentPdf(doc)
        }}
      >
        Télécharger le PDF
      </Button>

      {doc.signature_data ? (
        <div className="rounded-md border border-border p-3 text-sm">
          <p className="mb-1 text-xs text-muted-foreground">
            Signée le {new Date(doc.signed_at!).toLocaleDateString('fr-FR')}
          </p>
          <img src={doc.signature_data} alt="Signature" className="h-16 rounded border border-border bg-white" />
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">Signature</p>
            <Button variant="ghost" size="sm" onClick={() => padRef.current?.clear()}>
              <Eraser className="size-4" /> Effacer
            </Button>
          </div>
          <SignaturePad
            ref={padRef}
            className="h-44 w-full touch-none rounded-2xl border border-border bg-white shadow-inner"
          />
          {signError && <p className="text-sm text-destructive">{signError}</p>}
          <Button size="lg" onClick={submitSignature} disabled={signing}>
            {signing ? 'Envoi…' : 'Signer la facture'}
          </Button>
        </div>
      )}

      <div className="border-t border-border pt-2 text-[10px] text-muted-foreground">
        {legalFooterLines().map((l) => (
          <p key={l}>{l}</p>
        ))}
      </div>
    </div>
  )
}
