import { SignatureDialog } from '@/components/SignatureDialog'
import { totalTTC, type PseDocument } from '@/lib/documents'

// Signature sur le téléphone du technicien, tendu au client sur place.
export function SignOnDeviceDialog({
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
  const ttc = totalTTC(doc.items, doc.vat_rate, doc.discount_type, doc.discount_value)
  return (
    <SignatureDialog
      document={doc}
      open={open}
      onOpenChange={onOpenChange}
      onSigned={onSigned}
      title="Signature du client"
      description={`Tends l'appareil au client — ${doc.number} · ${ttc.toFixed(2).replace('.', ',')} € TTC`}
    />
  )
}
