import type { LucideIcon } from 'lucide-react'
import { Send, X } from 'lucide-react'
import * as React from 'react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export interface SendFabAction {
  key: string
  label: string
  icon: LucideIcon
  onClick: () => void
  disabled?: boolean
  hint?: string
  href?: string
}

// Remplace la boîte de dialogue classique par un flou plein écran + des
// bulles d'action qui sortent du bouton d'envoi — flottantes, pas un
// panneau qui glisse depuis le bas. Fermeture en tapant en dehors ou en
// ré-appuyant sur le bouton.
export function SendFab({ actions, disabled }: { actions: SendFabAction[]; disabled?: boolean }) {
  const [open, setOpen] = React.useState(false)

  const run = (action: SendFabAction) => {
    if (action.disabled) return
    action.onClick()
    setOpen(false)
  }

  return (
    <>
      <div
        aria-hidden="true"
        onClick={() => setOpen(false)}
        className={cn(
          'fixed inset-0 z-40 bg-background/50 backdrop-blur-md transition-opacity duration-300',
          open ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
      />

      <div
        className="fixed right-4 z-50 flex flex-col items-end gap-3"
        style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 1.5rem)' }}
      >
        {actions.map((action, i) => {
          const Icon = action.icon
          const content = (
            <>
              <span className="glass-strong rounded-full px-3.5 py-2 text-sm font-medium whitespace-nowrap shadow-[0_6px_16px_-4px_rgba(0,0,0,0.25)]">
                {action.label}
              </span>
              <span
                className={cn(
                  'liquid glass-strong flex size-12 shrink-0 items-center justify-center rounded-full text-foreground shadow-[0_6px_16px_-4px_rgba(0,0,0,0.3)]',
                  action.disabled && 'opacity-40',
                )}
              >
                <Icon className="size-5" />
              </span>
            </>
          )
          return (
            <div
              key={action.key}
              className={cn(
                'flex origin-bottom-right items-center gap-2.5 transition-all duration-300 [transition-timing-function:cubic-bezier(0.34,1.56,0.64,1)]',
                open ? 'translate-y-0 scale-100 opacity-100' : 'pointer-events-none translate-y-3 scale-50 opacity-0',
              )}
              style={{ transitionDelay: open ? `${i * 40}ms` : '0ms' }}
            >
              {action.href && !action.disabled ? (
                <a href={action.href} onClick={() => run(action)} className="flex items-center gap-2.5">
                  {content}
                </a>
              ) : (
                <button type="button" onClick={() => run(action)} disabled={action.disabled} className="flex items-center gap-2.5">
                  {content}
                </button>
              )}
            </div>
          )
        })}

        <Button
          size="icon"
          disabled={disabled}
          onClick={() => setOpen((o) => !o)}
          aria-label={open ? 'Fermer' : 'Envoyer'}
          className="size-14 rounded-full shadow-[0_10px_30px_-8px_rgba(0,0,0,0.4)]"
        >
          <span className={cn('transition-transform duration-300', open && 'rotate-90 scale-90')}>
            {open ? <X className="size-5" /> : <Send className="size-5" />}
          </span>
        </Button>
      </div>
    </>
  )
}
