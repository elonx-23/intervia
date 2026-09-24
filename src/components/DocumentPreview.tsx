import { adjustmentLabel, discountAmount, itemsTotalHT, totalTTC, type PseDocument } from '@/lib/documents'

// Aperçu du contenu du document (client, articles, totaux, notes,
// signature) — utilisé à la fois dans la boîte de dialogue PDF et dans
// l'onglet "Aperçu" de la fiche devis/facture.
export function DocumentPreview({ doc }: { doc: PseDocument }) {
  const client = [doc.client_first_name, doc.client_last_name].filter(Boolean).join(' ')
  const ht = itemsTotalHT(doc.items)
  const remise = discountAmount(ht, doc.discount_type, doc.discount_value)
  const adj = adjustmentLabel(remise)
  const ttc = totalTTC(doc.items, doc.vat_rate, doc.discount_type, doc.discount_value)

  return (
    <div className="flex flex-col gap-3 text-sm">
      <div className="flex justify-between">
        <div>
          <p className="font-medium">{client || 'Client sans nom'}</p>
          {doc.address && <p className="text-muted-foreground">{doc.address}</p>}
          {doc.phone && <p className="text-muted-foreground">{doc.phone}</p>}
        </div>
        <div className="text-right text-muted-foreground">
          <p>{new Date(doc.issue_date).toLocaleDateString('fr-FR')}</p>
          {doc.validity_date && <p>Valide jusqu'au {new Date(doc.validity_date).toLocaleDateString('fr-FR')}</p>}
          {doc.kind === 'facture' && doc.due_date && (
            <p>Échéance {new Date(doc.due_date).toLocaleDateString('fr-FR')}</p>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-2 rounded-md border border-border p-2">
        {doc.items.map((item, i) => (
          <div key={i} className="flex justify-between gap-2">
            <span className="min-w-0">
              <span className="block">
                {item.label} × {item.quantity}
              </span>
              {item.description && <span className="block text-xs text-muted-foreground">{item.description}</span>}
            </span>
            <span className="shrink-0">{(item.quantity * item.unitPrice).toFixed(2)} €</span>
          </div>
        ))}
        {doc.items.length === 0 && <p className="text-muted-foreground">Aucun article</p>}
      </div>

      <div className="flex flex-col items-end gap-0.5">
        <span>Total HT : {ht.toFixed(2)} €</span>
        {remise !== 0 && (
          <span>
            {adj.label} : {adj.sign}
            {adj.amount.toFixed(2)} €
          </span>
        )}
        <span>
          TVA ({doc.vat_rate}%) : {(ttc - (ht - remise)).toFixed(2)} €
        </span>
        <span className="font-semibold">Total TTC : {ttc.toFixed(2)} €</span>
        {doc.kind === 'facture' && (
          <span className="mt-1 border-t border-border pt-1 font-semibold">
            Solde dû : {(doc.status === 'payee' ? 0 : ttc).toFixed(2)} €
          </span>
        )}
      </div>

      {doc.notes && <p className="text-muted-foreground">{doc.notes}</p>}

      {doc.signature_data && (
        <div>
          <p className="mb-1 text-xs text-muted-foreground">Signature client</p>
          <img src={doc.signature_data} alt="Signature" className="h-16 rounded border border-border bg-white" />
        </div>
      )}
    </div>
  )
}
