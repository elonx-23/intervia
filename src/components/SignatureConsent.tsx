import { ScrollText } from 'lucide-react'

import { COMPANY, legalClauses } from '@/lib/company'

// Ce que le client accepte en signant, à cocher avant de valider — sur le
// téléphone du technicien comme sur la page de signature à distance. Pour un
// devis : mention « Devis reçu avant l'exécution des travaux » (arrêté du 24
// janvier 2017), acceptation des CGV de l'entreprise et demande d'exécution
// immédiate (art. L221-25 du Code de la consommation).
export function SignatureConsent({
  kind,
  checked,
  onChange,
  onReadCgv,
  invalid = false,
}: {
  kind: 'devis' | 'facture'
  checked: boolean
  onChange: (checked: boolean) => void
  onReadCgv: () => void
  invalid?: boolean
}) {
  return (
    <div
      className={`flex items-start gap-3 rounded-2xl border px-3 py-2.5 transition-colors ${
        invalid ? 'border-destructive bg-destructive/10' : checked ? 'border-primary/40 bg-primary/5' : 'border-border bg-secondary/40'
      }`}
    >
      <input
        id="signature-consent"
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 size-5 shrink-0 rounded border-input"
        style={{ accentColor: 'var(--primary)' }}
      />
      <div className="min-w-0 text-xs leading-relaxed">
        <label htmlFor="signature-consent" className="text-foreground">
          {kind === 'devis'
            ? "J'ai reçu ce devis avant l'exécution des travaux, j'accepte les conditions générales de vente et je demande l'exécution immédiate de l'intervention."
            : "J'ai pris connaissance des conditions générales de vente figurant sur la facture et je les accepte."}
        </label>{' '}
        <button type="button" onClick={onReadCgv} className="inline-flex items-center gap-1 font-semibold text-primary">
          <ScrollText className="size-3.5" /> Lire les CGV
        </button>
      </div>
    </div>
  )
}

// Texte complet des conditions générales de l'entreprise (lecture avant signature).
export function CgvText() {
  return (
    <div className="flex flex-col gap-2.5 text-xs leading-relaxed">
      <p className="text-sm font-semibold">Conditions générales de vente{COMPANY.name ? ` — ${COMPANY.name}` : ''}</p>
      {legalClauses().map((c, i) => (
        <div key={c.title}>
          <p className="font-semibold">
            {i + 1}. {c.title}
          </p>
          <p className="text-muted-foreground">{c.body}</p>
        </div>
      ))}
    </div>
  )
}
