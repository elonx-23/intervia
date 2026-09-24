import type { LucideIcon } from 'lucide-react'

import { cn } from '@/lib/utils'

interface SegmentedControlOption<T extends string> {
  value: T
  label: string
  icon?: LucideIcon
  // Classes optionnelles pour teinter cet onglet quand il est actif (pastille
  // + texte + icône) — non fourni, il garde le rendu neutre par défaut.
  activeBg?: string
  activeText?: string
}

// Segmented control façon iOS : une seule piste en verre, un curseur qui
// glisse derrière le libellé sélectionné (pas des pilules séparées).
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  className,
}: {
  options: SegmentedControlOption<T>[]
  value: T
  onChange: (value: T) => void
  className?: string
}) {
  const index = Math.max(
    0,
    options.findIndex((o) => o.value === value),
  )
  const active = options[index]

  return (
    <div className={cn('glass relative flex rounded-full p-1', className)}>
      <div
        className={cn(
          'glass absolute inset-y-1 rounded-full transition-[left,background-color] duration-300 [transition-timing-function:cubic-bezier(0.34,1.56,0.64,1)]',
          active?.activeBg ?? 'bg-background',
        )}
        style={{
          width: `calc(${100 / options.length}% - 4px)`,
          left: `calc(${index * (100 / options.length)}% + 2px)`,
          // @ts-expect-error propriété CSS personnalisée
          '--elevation-shadow': '0 1px 3px rgba(0,0,0,0.08)',
        }}
        aria-hidden="true"
      />
      {options.map((o) => {
        const Icon = o.icon
        const isActive = value === o.value
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className={cn(
              'relative z-10 flex flex-1 items-center justify-center gap-1.5 rounded-full py-1.5 text-sm font-medium transition-colors duration-200',
              isActive ? (o.activeText ?? 'text-foreground') : 'text-muted-foreground',
            )}
          >
            {Icon && <Icon className="size-3.5" />}
            {o.label}
          </button>
        )
      })}
    </div>
  )
}
