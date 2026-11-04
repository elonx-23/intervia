import { ChevronRight } from 'lucide-react'
import type { ComponentType, ReactNode } from 'react'
import { Link } from 'react-router-dom'

import { Card, CardContent } from '@/components/ui/card'
import { TONE_ICON, type Tone } from '@/lib/tones'

// Ligne de navigation standard pour les écrans de réglages — icône, libellé,
// valeur courante optionnelle à droite, chevron. Toujours un <Link>, jamais
// d'action inline (les réglages avec un état à afficher ont leur propre
// petit composant, ex. le switch de thème).
export function SettingsRow({
  to,
  icon: Icon,
  label,
  value,
  tone,
}: {
  to: string
  icon: ComponentType<{ className?: string }>
  label: string
  value?: string
  // Teinte de la rubrique (voir lib/tones.ts) — l'icône est posée dans une pastille de cette couleur.
  tone?: Tone
}) {
  return (
    <Link to={to}>
      <Card className="liquid py-3">
        <CardContent className="flex items-center gap-3 px-4">
          <span className={`flex size-8 shrink-0 items-center justify-center rounded-lg ${TONE_ICON[tone ?? 'slate']}`}>
            <Icon className="size-[18px]" />
          </span>
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
