import { CheckCircle2, Eraser } from 'lucide-react'
import * as React from 'react'
import { useParams } from 'react-router-dom'

import { SignaturePad, type SignaturePadHandle } from '@/components/SignaturePad'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { legalFooterLines } from '@/lib/company'
import {
  adjustmentLabel,
  discountAmount,
  getDocumentByToken,
  itemsTotalHT,
  signDocumentPublic,
  totalTTC,
  type PseDocument,
} from '@/lib/documents'
import { friendlyError } from '@/lib/errors'

export default function SignDevis() {
  const { token } = useParams()
  const [doc, setDoc] = React.useState<PseDocument | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [saving, setSaving] = React.useState(false)
  const padRef = React.useRef<SignaturePadHandle>(null)

  React.useEffect(() => {
    if (!token) return
    getDocumentByToken(token)
      .then(setDoc)
      .catch((e) => setError(friendlyError(e, 'Devis introuvable.')))
  }, [token])

  if (error && !doc) {
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

  if (doc.status === 'signe') {
    return (
      <div className="mx-auto flex min-h-svh w-full max-w-lg flex-col items-center justify-center gap-3 px-6 text-center">
        <CheckCircle2 className="size-14 text-success" />
        <h1 className="text-xl font-semibold tracking-tight">Devis signé</h1>
        <p className="text-sm text-muted-foreground">
          Merci {doc.client_first_name || ''}, ce devis a été accepté le{' '}
          {new Date(doc.signed_at!).toLocaleDateString('fr-FR')}.
        </p>
      </div>
    )
  }

  const submit = async () => {
    if (!token || !padRef.current || padRef.current.isEmpty()) {
      setError('Merci de signer avant de valider.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const updated = await signDocumentPublic(token, padRef.current.toDataURL())
      setDoc(updated)
    } catch (e) {
      setError(friendlyError(e, 'Erreur lors de la signature.'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto flex min-h-svh w-full max-w-lg flex-col gap-4 px-4 py-8">
      <div className="text-center">
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Devis {doc.number}</p>
        <h1 className="text-xl font-semibold tracking-tight">{client}</h1>
        {doc.address && <p className="text-sm text-muted-foreground">{doc.address}</p>}
      </div>

      <Card>
        <CardContent className="flex flex-col gap-2 text-sm">
          {doc.items.map((item, i) => (
            <div key={i} className="flex justify-between gap-2">
              <span className="min-w-0">
                <span className="block">
                  {item.label} × {item.quantity}
                </span>
                {item.description && (
                  <span className="block text-xs text-muted-foreground">{item.description}</span>
                )}
              </span>
              <span className="shrink-0">{(item.quantity * item.unitPrice).toFixed(2)} €</span>
            </div>
          ))}
          <div className="mt-2 flex flex-col items-end border-t border-border/70 pt-2">
            <span className="text-muted-foreground">Total HT : {ht.toFixed(2)} €</span>
            {remise !== 0 && (
              <span className="text-muted-foreground">
                {adj.label} : {adj.sign}{adj.amount.toFixed(2)} €
              </span>
            )}
            <span className="text-lg font-semibold">{ttc.toFixed(2)} € TTC</span>
          </div>
          {doc.notes && <p className="mt-1 text-muted-foreground">{doc.notes}</p>}
        </CardContent>
      </Card>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium">Ta signature</p>
          <Button variant="ghost" size="sm" onClick={() => padRef.current?.clear()}>
            <Eraser className="size-4" /> Effacer
          </Button>
        </div>
        <SignaturePad
          ref={padRef}
          className="h-44 w-full touch-none rounded-2xl border border-border bg-white shadow-inner"
        />
        <p className="text-center text-xs text-muted-foreground">Signe avec le doigt directement sur l'écran</p>
      </div>

      {error && <p className="text-center text-sm text-destructive">{error}</p>}

      <Button size="lg" onClick={submit} disabled={saving}>
        {saving ? 'Envoi…' : 'Valider et signer'}
      </Button>

      <div className="border-t border-border/70 pt-3 text-center text-[10px] text-muted-foreground">
        {legalFooterLines().map((l) => (
          <p key={l}>{l}</p>
        ))}
      </div>
    </div>
  )
}
