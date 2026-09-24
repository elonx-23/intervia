import * as React from 'react'
import { Link } from 'react-router-dom'
import { ScrollText } from 'lucide-react'

import { CollapsibleRow } from '@/components/CollapsibleRow'
import { Card, CardContent } from '@/components/ui/card'
import { COMPANY, legalClauses } from '@/lib/company'

// Conditions générales affichées directement dans la fiche (comme les
// logiciels de facturation du métier les montrent sous les articles), et pas
// seulement dans le PDF — le client les voit avant de signer. Repliées par
// défaut : le texte complet des 7 clauses prend trop de place à l'écran.
export function LegalClausesCard() {
  const [open, setOpen] = React.useState(false)

  return (
    <Card>
      <CardContent>
        <CollapsibleRow
          icon={ScrollText}
          open={open}
          onToggle={() => setOpen((o) => !o)}
          label={<span className="text-muted-foreground">Conditions générales de vente</span>}
        >
          <p className="text-sm font-semibold">Conditions générales de vente — {COMPANY.name}</p>
          {legalClauses().map((clause, i) => (
            <div key={clause.title} className="flex flex-col gap-1 text-sm">
              <p className="font-medium">
                {i + 1}. {clause.title}
              </p>
              <p className="text-muted-foreground">{clause.body}</p>
            </div>
          ))}
          <Link to="/mentions-legales" className="text-sm text-primary underline-offset-2 hover:underline">
            Voir les mentions légales complètes (droit de rétractation, arrêté prix dépannage)
          </Link>
        </CollapsibleRow>
      </CardContent>
    </Card>
  )
}
