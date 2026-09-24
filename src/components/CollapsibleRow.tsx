import { ChevronRight } from 'lucide-react'
import * as React from 'react'
import type { ComponentType } from 'react'

// Ligne repliable façon "À Client >" / "Ajouter une photo >" du modèle de
// référence — repliée par défaut (icône + libellé + chevron), s'ouvre pour
// révéler les champs en place (pas de navigation vers un écran séparé,
// puisqu'il n'existe pas de fiche client dédiée dans l'app).
export function CollapsibleRow({
  icon: Icon,
  label,
  open,
  onToggle,
  children,
}: {
  icon: ComponentType<{ className?: string }>
  label: React.ReactNode
  open: boolean
  onToggle: () => void
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        onClick={onToggle}
        className="liquid flex w-full items-center justify-between rounded-xl py-1 text-left"
      >
        <span className="flex items-center gap-2 text-sm">
          <Icon className="size-4 text-muted-foreground" />
          {label}
        </span>
        <ChevronRight className={`size-4 shrink-0 text-muted-foreground transition-transform ${open ? 'rotate-90' : ''}`} />
      </button>
      {open && <div className="flex flex-col gap-3">{children}</div>}
    </div>
  )
}
