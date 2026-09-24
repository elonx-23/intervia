import { ChevronRight } from 'lucide-react'
import type { ComponentType, ReactNode } from 'react'
import { Link } from 'react-router-dom'

import { Card, CardContent } from '@/components/ui/card'

// Ligne de navigation standard pour les écrans de réglages — icône, libellé,
// valeur courante optionnelle à droite, chevron. Toujours un <Link>, jamais
// d'action inline (les réglages avec un état à afficher ont leur propre
// petit composant, ex. le switch de thème).
export function SettingsRow({
  to,
  icon: Icon,
  label,
  value,
}: {
  to: string
  icon: ComponentType<{ className?: string }>
  label: string
  value?: string
}) {
  return (
    <Link to={to}>
      <Card className="liquid py-3">
        <CardContent className="flex items-center gap-3 px-4">
          <Icon className="size-5 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate text-sm font-medium">{label}</span>
          {value && <span className="shrink-0 truncate text-sm text-muted-foreground">{value}</span>}
          <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
        </CardContent>
      </Card>
    </Link>
  )
}

export function SettingsGroupLabel({ children }: { children: ReactNode }) {
  return <p className="px-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">{children}</p>
}
