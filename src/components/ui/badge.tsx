import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import * as React from 'react'

import { cn } from '@/lib/utils'

// Pastilles douces : fond teinté léger + texte de la même teinte, lisibles en
// clair comme en sombre. Une teinte = une signification, partout dans l'app
// (voir src/lib/tones.ts).
// Classes écrites en toutes lettres : Tailwind ne génère que celles qu'il lit dans le code.
const TONE = {
  blue: 'border-transparent bg-tone-blue-soft text-tone-blue-ink',
  violet: 'border-transparent bg-tone-violet-soft text-tone-violet-ink',
  green: 'border-transparent bg-tone-green-soft text-tone-green-ink',
  cyan: 'border-transparent bg-tone-cyan-soft text-tone-cyan-ink',
  amber: 'border-transparent bg-tone-amber-soft text-tone-amber-ink',
  orange: 'border-transparent bg-tone-orange-soft text-tone-orange-ink',
  red: 'border-transparent bg-tone-red-soft text-tone-red-ink',
  slate: 'border-transparent bg-tone-slate-soft text-tone-slate-ink',
}

const badgeVariants = cva(
  'inline-flex items-center justify-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap w-fit [&_svg]:size-3',
  {
    variants: {
      variant: {
        default: TONE.blue,
        secondary: 'border-transparent bg-secondary text-secondary-foreground',
        destructive: TONE.red,
        success: TONE.green,
        warning: TONE.amber,
        outline: 'border-border text-muted-foreground',
        blue: TONE.blue,
        violet: TONE.violet,
        green: TONE.green,
        cyan: TONE.cyan,
        amber: TONE.amber,
        orange: TONE.orange,
        red: TONE.red,
        slate: TONE.slate,
        solid: 'border-transparent bg-primary text-primary-foreground',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
)

function Badge({
  className,
  variant,
  asChild = false,
  ...props
}: React.ComponentProps<'span'> & VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : 'span'
  return (
    <Comp data-slot="badge" className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }
