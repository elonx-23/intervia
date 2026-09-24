import * as SelectPrimitive from '@radix-ui/react-select'
import { Check, ChevronDown } from 'lucide-react'
import * as React from 'react'

import { useLiquidTouch } from '@/hooks/useLiquidTouch'
import { cn } from '@/lib/utils'

function Select(props: React.ComponentProps<typeof SelectPrimitive.Root>) {
  return <SelectPrimitive.Root data-slot="select" {...props} />
}

function SelectGroup(props: React.ComponentProps<typeof SelectPrimitive.Group>) {
  return <SelectPrimitive.Group data-slot="select-group" {...props} />
}

function SelectValue(props: React.ComponentProps<typeof SelectPrimitive.Value>) {
  return <SelectPrimitive.Value data-slot="select-value" {...props} />
}

// Déclencheur façon champ de saisie iOS (même gabarit que Input) avec le
// même retour tactile liquide que les boutons — la flèche pivote à
// l'ouverture au lieu d'un simple changement d'icône.
function SelectTrigger({
  className,
  children,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerLeave,
  onPointerCancel,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Trigger>) {
  const { ref, handlers } = useLiquidTouch<HTMLButtonElement>()
  return (
    <SelectPrimitive.Trigger
      ref={ref}
      data-slot="select-trigger"
      className={cn(
        'liquid flex h-11 w-full items-center justify-between gap-2 rounded-xl border border-input bg-secondary/60 px-3.5 py-2 text-base outline-none transition-all focus-visible:border-primary/40 focus-visible:bg-background focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 data-[placeholder]:text-muted-foreground md:text-sm',
        className,
      )}
      onPointerDown={(e) => {
        handlers.onPointerDown(e)
        onPointerDown?.(e)
      }}
      onPointerMove={(e) => {
        handlers.onPointerMove(e)
        onPointerMove?.(e)
      }}
      onPointerUp={(e) => {
        handlers.onPointerUp(e)
        onPointerUp?.(e)
      }}
      onPointerLeave={(e) => {
        handlers.onPointerLeave(e)
        onPointerLeave?.(e)
      }}
      onPointerCancel={(e) => {
        handlers.onPointerCancel(e)
        onPointerCancel?.(e)
      }}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon asChild>
        <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform duration-300 data-[state=open]:rotate-180" />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  )
}

// Menu flottant façon macOS/iOS : panneau de verre qui apparaît avec un léger
// zoom + glissement depuis le déclencheur (pas un menu plat classique de
// navigateur), coche à gauche de l'option sélectionnée comme un vrai menu
// Apple plutôt qu'une coche/puce générique.
function SelectContent({
  className,
  children,
  position = 'popper',
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Content>) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content
        data-slot="select-content"
        position={position}
        sideOffset={6}
        className={cn(
          'glass-strong relative z-50 max-h-(--radix-select-content-available-height) min-w-[var(--radix-select-trigger-width)] overflow-x-hidden overflow-y-auto rounded-2xl p-1.5 duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=top]:slide-in-from-bottom-2',
          position === 'popper' && 'origin-(--radix-select-content-transform-origin)',
          className,
        )}
        style={{
          // @ts-expect-error propriété CSS personnalisée
          '--elevation-shadow': '0 16px 40px -12px rgba(0,0,0,0.28), 0 4px 14px -4px rgba(0,0,0,0.16)',
        }}
        {...props}
      >
        <SelectPrimitive.Viewport
          className={cn(
            'flex flex-col gap-0.5',
            position === 'popper' &&
              'h-[var(--radix-select-trigger-height)] w-full min-w-[var(--radix-select-trigger-width)] scroll-my-1',
          )}
        >
          {children}
        </SelectPrimitive.Viewport>
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  )
}

function SelectLabel({ className, ...props }: React.ComponentProps<typeof SelectPrimitive.Label>) {
  return (
    <SelectPrimitive.Label
      data-slot="select-label"
      className={cn('px-2.5 py-1.5 text-xs font-medium text-muted-foreground', className)}
      {...props}
    />
  )
}

function SelectItem({ className, children, ...props }: React.ComponentProps<typeof SelectPrimitive.Item>) {
  return (
    <SelectPrimitive.Item
      data-slot="select-item"
      className={cn(
        "relative flex w-full cursor-pointer scroll-my-1 items-center gap-2 rounded-lg py-2 pr-3 pl-8 text-sm text-foreground outline-none transition-colors select-none focus:bg-primary/12 focus:text-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg]:size-4",
        className,
      )}
      {...props}
    >
      <span className="absolute left-2.5 flex size-4 items-center justify-center">
        <SelectPrimitive.ItemIndicator>
          <Check className="size-4 text-primary" />
        </SelectPrimitive.ItemIndicator>
      </span>
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
    </SelectPrimitive.Item>
  )
}

function SelectSeparator({ className, ...props }: React.ComponentProps<typeof SelectPrimitive.Separator>) {
  return (
    <SelectPrimitive.Separator
      data-slot="select-separator"
      className={cn('pointer-events-none -mx-1.5 my-1.5 h-px bg-border', className)}
      {...props}
    />
  )
}

export { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectSeparator, SelectTrigger, SelectValue }
