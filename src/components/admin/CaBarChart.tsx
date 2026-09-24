import type { CaPoint } from '@/lib/statistiques'

// Petit graphique en barres fait main (pas de librairie externe pour ~30
// points) — hauteur proportionnelle au max de la période, jours à 0 gardent
// une barre minuscule visible plutôt que de disparaître complètement.
export function CaBarChart({ data }: { data: CaPoint[] }) {
  const max = Math.max(1, ...data.map((d) => d.ca))
  const showEveryLabel = data.length <= 8
  const labelStep = data.length <= 8 ? 1 : data.length <= 14 ? 3 : 7

  return (
    <div className="flex flex-col gap-1">
      <div className="flex h-24 items-end gap-[3px]">
        {data.map((d) => {
          const heightPct = Math.max(4, (d.ca / max) * 100)
          return (
            <div key={d.date} className="group relative flex h-full flex-1 flex-col items-center justify-end">
              <div
                className="w-full rounded-t-[3px] bg-primary/85 transition-[height] duration-300"
                style={{ height: `${heightPct}%` }}
              />
              <div className="pointer-events-none absolute -top-7 left-1/2 z-10 -translate-x-1/2 rounded-md bg-foreground px-1.5 py-0.5 text-[10px] whitespace-nowrap text-background opacity-0 group-active:opacity-100 group-hover:opacity-100">
                {d.ca.toFixed(0)} € · {new Date(d.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
              </div>
            </div>
          )
        })}
      </div>
      <div className="flex gap-[3px]">
        {data.map((d, i) => (
          <div key={d.date} className="flex-1 text-center text-[9px] text-muted-foreground">
            {(showEveryLabel || i % labelStep === 0) && new Date(d.date).getDate()}
          </div>
        ))}
      </div>
    </div>
  )
}
