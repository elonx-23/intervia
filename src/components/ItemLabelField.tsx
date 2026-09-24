import * as React from 'react'

import { Input } from '@/components/ui/input'
import type { DocumentItem } from '@/lib/documents'
import { ITEM_CATALOG } from '@/lib/itemPresets'

// Assistance à l'écriture sur le nom de l'article : en tapant, une liste de
// prestations/articles déjà préécrits (catalogue serrurerie) apparaît sous le
// champ. Choisir une suggestion préremplit le libellé et un prix de départ —
// le technicien ajuste ensuite montant/quantité si besoin.
export function ItemLabelField({
  value,
  onLabelChange,
  onPick,
  disabled,
}: {
  value: string
  onLabelChange: (label: string) => void
  onPick: (item: DocumentItem) => void
  disabled?: boolean
}) {
  const [open, setOpen] = React.useState(false)
  const containerRef = React.useRef<HTMLDivElement>(null)

  // Champ vide (focus sans avoir tapé) : on propose directement tout le
  // catalogue plutôt que d'attendre une saisie — le technicien peut
  // parcourir les prestations sans avoir à deviner un mot-clé.
  const matches = React.useMemo(() => {
    const q = value.trim().toLowerCase()
    if (!q) return ITEM_CATALOG
    return ITEM_CATALOG.filter((i) => i.label.toLowerCase().includes(q)).slice(0, 6)
  }, [value])

  React.useEffect(() => {
    if (!open) return
    const onClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [open])

  return (
    <div ref={containerRef} className="relative w-full">
      <Input
        placeholder="Désignation"
        value={value}
        disabled={disabled}
        onChange={(e) => {
          onLabelChange(e.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        autoComplete="off"
      />
      {!disabled && open && matches.length > 0 && (
        <div className="glass-strong absolute inset-x-0 top-full z-20 mt-1 max-h-56 overflow-y-auto rounded-xl p-1">
          {matches.map((item) => (
            <button
              key={item.label}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onPick(item)
                setOpen(false)
              }}
              className="flex w-full flex-col gap-0.5 rounded-lg px-3 py-2 text-left hover:bg-primary/10"
            >
              <span className="flex items-center justify-between gap-2 text-sm">
                <span className="truncate">{item.label}</span>
                <span className="shrink-0 text-muted-foreground">{item.unitPrice.toFixed(2)} €</span>
              </span>
              {item.description && (
                <span className="truncate text-xs text-muted-foreground">{item.description}</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
