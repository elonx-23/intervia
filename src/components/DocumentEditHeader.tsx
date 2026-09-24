import { Eye, History, MoreVertical, PenLine, X } from 'lucide-react'
import * as React from 'react'
import { useNavigate } from 'react-router-dom'

import { SegmentedControl } from '@/components/ui/segmented-control'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'

export type DocumentEditTab = 'modifier' | 'apercu' | 'historique'

// Une touche de couleur distincte par onglet (au lieu du même gris partout)
// pour repérer en un coup d'œil où on est : bleu = édition, violet =
// prévisualisation, ambre = historique/temps.
const TABS: {
  value: DocumentEditTab
  label: string
  icon: typeof PenLine
  activeBg: string
  activeText: string
}[] = [
  { value: 'modifier', label: 'Modifier', icon: PenLine, activeBg: 'bg-primary/12', activeText: 'text-primary' },
  {
    value: 'apercu',
    label: 'Aperçu',
    icon: Eye,
    activeBg: 'bg-violet-500/12',
    activeText: 'text-violet-600 dark:text-violet-400',
  },
  {
    value: 'historique',
    label: 'Historique',
    icon: History,
    activeBg: 'bg-amber-500/12',
    activeText: 'text-amber-600 dark:text-amber-400',
  },
]

// Même habillage (verre, hauteurs, segmented control) que le Header/toolbar
// standard des listes Devis/Factures — une seule identité visuelle de
// navigation dans toute l'app plutôt que ce bandeau bleu dédié.
export function DocumentEditHeader({
  title,
  tab,
  onTabChange,
  menu,
  sendButton,
}: {
  title: string
  tab: DocumentEditTab
  onTabChange: (tab: DocumentEditTab) => void
  menu: React.ReactNode
  sendButton?: React.ReactNode
}) {
  const navigate = useNavigate()
  const [scrolled, setScrolled] = React.useState(false)

  React.useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <div
      className={cn(
        'fixed inset-x-0 top-0 left-1/2 z-40 flex w-full max-w-2xl -translate-x-1/2 flex-col border-b transition-all duration-300',
        scrolled
          ? 'glass border-b-[var(--glass-border)]'
          : 'border-b-transparent bg-background/15 backdrop-blur-lg backdrop-saturate-150',
      )}
      style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
    >
      <div className="flex h-14 shrink-0 items-center gap-2 px-4">
        <h1 className="min-w-0 flex-1 truncate text-lg font-semibold tracking-tight">{title}</h1>
        <div className="flex shrink-0 items-center gap-1">
          {sendButton}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="rounded-full" aria-label="Plus d'options">
                <MoreVertical className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">{menu}</DropdownMenuContent>
          </DropdownMenu>
          <Button variant="ghost" size="icon" className="rounded-full" aria-label="Fermer" onClick={() => navigate(-1)}>
            <X className="size-5" />
          </Button>
        </div>
      </div>
      <div className="flex h-14 shrink-0 items-center px-4 pb-2">
        <SegmentedControl value={tab} onChange={onTabChange} options={TABS} className="w-full" />
      </div>
    </div>
  )
}
