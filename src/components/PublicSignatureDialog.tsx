import { SignatureDialog } from '@/components/SignatureDialog'
import { totalTTC, type PseDocument } from '@/lib/documents'

// Signature par le client, depuis le lien reçu par email (pas de session).
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
  const ttc = totalTTC(doc.items, doc.vat_rate, doc.discount_type, doc.discount_value)
  return (
    <SignatureDialog
      document={doc}
      open={open}
      onOpenChange={onOpenChange}
      onSigned={onSigned}
      title={doc.kind === 'facture' ? 'Signer la facture' : 'Signer le devis'}
      description={`${doc.number} · ${ttc.toFixed(2).replace('.', ',')} € TTC`}
    />
  )
}
