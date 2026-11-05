import { ChevronDown, ChevronUp } from 'lucide-react'
import * as React from 'react'

import { COMPANY, legalClauses } from '@/lib/company'

// Ce que le client accepte en signant, à cocher avant la signature — sur le
// téléphone du technicien comme sur la page de signature à distance. Pour un
// devis : mention « Devis reçu avant l'exécution des travaux » (arrêté du 24
// janvier 2017), acceptation des CGV de l'entreprise (lisibles ici même) et
// demande d'exécution immédiate (art. L221-25 du Code de la consommation).
export function SignatureConsent({
  kind,
  checked,
  onChange,
}: {
  kind: 'devis' | 'facture'
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  const [open, setOpen] = React.useState(false)
  return (
    <div className="flex flex-col gap-2">
      <label className="flex items-start gap-2.5 text-xs leading-relaxed text-muted-foreground">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="mt-0.5 size-4 shrink-0 rounded border-input"
          style={{ accentColor: 'var(--primary)' }}
        />
        <span>
          {kind === 'devis'
            ? "J'ai reçu ce devis avant l'exécution des travaux. J'ai pris connaissance des conditions générales de vente et je les accepte. Je demande l'exécution immédiate de l'intervention."
            : "J'ai pris connaissance des conditions générales de vente figurant sur la facture et je les accepte."}
        </span>
      </label>
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-fit items-center gap-1 text-xs font-medium text-primary">
        {open ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
        Lire les conditions générales de vente
      </button>
      {open && (
        <div className="max-h-56 overflow-y-auto rounded-xl border border-border bg-secondary/40 p-3 text-xs leading-relaxed" data-no-swipe>
          <p className="mb-2 font-semibold">Conditions générales de vente{COMPANY.name ? ` — ${COMPANY.name}` : ''}</p>
          {legalClauses().map((c, i) => (
            <div key={c.title} className="mb-2">
              <p className="font-medium">
                {i + 1}. {c.title}
              </p>
              <p className="text-muted-foreground">{c.body}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
