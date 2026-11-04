import { Droplets, Flame, KeyRound, Wrench, Zap } from 'lucide-react'

import { cn } from '@/lib/utils'

// Icône du corps de métier d'une intervention.
export function TradeIcon({ trade, className }: { trade: string | null | undefined; className?: string }) {
  const t = (trade ?? '').toLowerCase()
  const Icon = t.startsWith('serrur') ? KeyRound : t.startsWith('plomb') ? Droplets : t.startsWith('élec') || t.startsWith('elec') ? Zap : t.startsWith('chauff') ? Flame : Wrench
  return <Icon className={cn('size-4', className)} />
}
