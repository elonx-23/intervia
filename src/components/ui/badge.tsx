import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import * as React from 'react'

import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'relative isolate inline-flex items-center justify-center gap-1 overflow-hidden rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap w-fit before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-1/2 before:rounded-t-full before:bg-gradient-to-b before:from-white/40 before:to-white/0',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary text-primary-foreground ring-1 ring-inset ring-white/15',
        secondary: 'border-transparent bg-secondary text-secondary-foreground',
        destructive: 'border-transparent bg-destructive text-destructive-foreground ring-1 ring-inset ring-white/15',
        success: 'border-transparent bg-success text-success-foreground ring-1 ring-inset ring-white/15',
        warning: 'border-transparent bg-warning text-warning-foreground ring-1 ring-inset ring-white/15',
        outline: 'border-border text-foreground before:hidden',
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
