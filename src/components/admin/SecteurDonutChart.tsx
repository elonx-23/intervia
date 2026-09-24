import type { SecteurBreakdown } from '@/lib/statistiques'

// Couleurs fixes pour les secteurs connus (cohérentes d'une période à
// l'autre), palette de repli pour un type imprévu — jamais de hasard.
const SECTOR_COLORS: Record<string, string> = {
  Serrurerie: '#2563EB',
  Plomberie: '#0EA5E9',
  Électricité: '#F59E0B',
  Chauffage: '#EF4444',
}
const FALLBACK_COLORS = ['#7C3AED', '#059669', '#DB2777', '#64748B']

function colorFor(type: string, fallbackIndex: number) {
  return SECTOR_COLORS[type] ?? FALLBACK_COLORS[fallbackIndex % FALLBACK_COLORS.length]
}

const fmtEuro = (n: number) => `${n.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} €`

// Camembert en CSS pur (conic-gradient), pas de librairie — cohérent avec
// CaBarChart. Centre creux avec le CA total (repère immédiat, pas besoin de
// survol/tooltip qui n'existe pas au doigt sur mobile).
export function SecteurDonutChart({ data }: { data: SecteurBreakdown[] }) {
  const totalCa = data.reduce((sum, d) => sum + d.ca, 0)

  if (totalCa <= 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">Aucune donnée sur cette période.</p>
  }

  let cursor = 0
  const segments = data.map((d, i) => {
    const pct = (d.ca / totalCa) * 100
    const from = cursor
    const to = cursor + pct
    cursor = to
    return { ...d, pct, from, to, color: colorFor(d.type, i) }
  })

  const gradient = segments
    .map((s) => `${s.color} ${s.from}% ${s.to}%`)
    .join(', ')

  return (
    <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-center sm:gap-6">
      <div className="relative size-36 shrink-0">
        <div className="size-full rounded-full" style={{ background: `conic-gradient(${gradient})` }} />
        <div className="glass-strong absolute inset-[14%] flex flex-col items-center justify-center rounded-full text-center">
          <p className="text-[10px] text-muted-foreground">CA total</p>
          <p className="text-sm leading-tight font-bold">{fmtEuro(totalCa)}</p>
        </div>
      </div>

      <div className="flex w-full flex-col gap-2">
        {segments.map((s) => (
          <div key={s.type} className="flex items-center gap-2.5">
            <span className="size-2.5 shrink-0 rounded-full" style={{ background: s.color }} />
            <span className="min-w-0 flex-1 truncate text-sm">{s.type}</span>
            <span className="shrink-0 text-xs text-muted-foreground">{s.total}</span>
            <span className="w-16 shrink-0 text-right text-sm font-medium tabular-nums">{s.pct.toFixed(0)}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}
