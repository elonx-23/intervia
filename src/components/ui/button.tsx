import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import * as React from 'react'

import { useLiquidTouch } from '@/hooks/useLiquidTouch'
import { cn } from '@/lib/utils'

// Dégradé intégré directement dans le fond (pas une couche blanche plaquée
// par-dessus, qui donnait un effet "taché") + un simple liseré clair en
// haut via box-shadow — rendu plus net, plus proche d'un vrai bouton iOS.
// L'interaction tactile (.liquid) est pilotée en temps réel par la position
// du doigt via useLiquidTouch, pas par :active (pas fiable au toucher iOS).
const buttonVariants = cva(
  "liquid relative inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-medium transition-[filter,background-color,box-shadow] duration-200 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg]:size-4 outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
  {
    variants: {
      variant: {
        default:
          'bg-[linear-gradient(180deg,color-mix(in_oklch,var(--primary)_82%,white)_0%,var(--primary)_60%,color-mix(in_oklch,var(--primary)_92%,black)_100%)] text-primary-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_1px_2px_rgba(0,0,0,0.08),0_4px_10px_-4px_var(--tw-shadow-color)] shadow-primary/40 hover:brightness-105',
        destructive:
          'bg-[linear-gradient(180deg,color-mix(in_oklch,var(--destructive)_82%,white)_0%,var(--destructive)_60%,color-mix(in_oklch,var(--destructive)_92%,black)_100%)] text-destructive-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_1px_2px_rgba(0,0,0,0.08),0_4px_10px_-4px_var(--tw-shadow-color)] shadow-destructive/40 hover:brightness-105',
        outline:
          'glass-lens border border-black/[0.06] bg-secondary/70 bg-[radial-gradient(130%_130%_at_12%_-15%,rgba(255,255,255,0.55),transparent_55%)] text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.5)] backdrop-blur-xl hover:bg-accent hover:text-accent-foreground dark:border-white/10 dark:bg-white/[0.06] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]',
        secondary:
          'bg-secondary text-secondary-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.5)] hover:bg-secondary/80 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]',
        ghost: 'hover:bg-accent hover:text-accent-foreground',
        link: 'rounded-none text-primary underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-11 px-5 py-2',
        sm: 'h-9 px-3.5',
        lg: 'h-12 px-7 text-base',
        icon: 'h-11 w-11',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
)

function Button({
  className,
  variant,
  size,
  asChild = false,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerLeave,
  onPointerCancel,
  ...props
}: React.ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : 'button'
  const { ref, handlers } = useLiquidTouch<HTMLButtonElement>()

  return (
    <Comp
      ref={ref}
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
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
    />
  )
}

export { Button, buttonVariants }
