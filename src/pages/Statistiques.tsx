import { Flame, Sparkles, TrendingDown, TrendingUp } from 'lucide-react'
import * as React from 'react'
import { Link } from 'react-router-dom'

import { CaBarChart } from '@/components/admin/CaBarChart'
import { SecteurDonutChart } from '@/components/admin/SecteurDonutChart'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { EmptyState } from '@/components/layout/EmptyState'
import { Page } from '@/components/layout/Page'
import { useAuth } from '@/lib/auth'
import { friendlyError } from '@/lib/errors'
import { isoLocalDate } from '@/lib/utils'
import {
  getAdminStats,
  getTechnicienStats,
  getTechnicienTimeseries,
  listReleveInterventions,
  listUnpaidForTechnicien,
  type AdminStats,
  type CaPoint,
  type TechnicienBreakdown,
  type TechnicienStats,
} from '@/lib/statistiques'
import { totalTTC, type PseDocument } from '@/lib/documents'

function startOfMonth() {
  const d = new Date()
  return isoLocalDate(new Date(d.getFullYear(), d.getMonth(), 1))
}
function today() {
  return isoLocalDate(new Date())
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <Card className="py-4">
      <CardContent className="px-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-lg font-semibold">{value}</p>
      </CardContent>
    </Card>
  )
}

// Classement CA par technicien — une seule teinte (magnitude, pas identité),
// barre proportionnelle au meilleur du groupe, valeur en clair à côté (pas
// juste la couleur qui porte l'info). Pas de second axe : interventions/
// terminées restent du texte secondaire, jamais une deuxième barre superposée.
function TechRanking({ items }: { items: TechnicienBreakdown[] }) {
  if (items.length === 0) {
    return <EmptyState label="Aucun technicien actif" />
  }
  const max = Math.max(1, ...items.map((t) => t.ca))
  return (
    <Card>
      <CardContent className="flex flex-col gap-4">
        <p className="text-sm font-semibold">Performance par technicien</p>
        <div className="flex flex-col gap-3">
          {items.map((t) => (
            <div key={t.technicien_id} className="flex flex-col gap-1">
              <div className="flex items-baseline justify-between gap-2">
                <span className="min-w-0 truncate text-sm font-medium">{t.name || 'Sans nom'}</span>
                <span className="shrink-0 text-sm font-semibold tabular-nums">{t.ca.toFixed(2)} €</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
                <div
                  className="h-full rounded-full bg-primary transition-[width] duration-500"
                  style={{ width: `${Math.max(2, (t.ca / max) * 100)}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground tabular-nums">
                {t.total_interventions} intervention{t.total_interventions > 1 ? 's' : ''} · {t.terminees} terminée
                {t.terminees > 1 ? 's' : ''}
              </p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

// Variation en % vs la période précédente — null si la période précédente
// était à zéro (division par zéro évitée, on affiche plutôt "nouveau").
function pctChange(current: number, previous: number): number | null {
  if (previous <= 0) return null
  return ((current - previous) / previous) * 100
}

// Carte "élément de motivation" : compare la période actuelle à la
// précédente plutôt que d'afficher un chiffre brut isolé — un technicien
// voit d'un coup d'œil s'il progresse, pas juste "12 interventions" sans
// repère pour savoir si c'est bien ou pas.
function ComparisonCard({ label, current, previous, format }: { label: string; current: number; previous: number; format: (n: number) => string }) {
  const change = pctChange(current, previous)
  const isNew = previous <= 0 && current > 0
  const up = change !== null && change > 0.5
  const down = change !== null && change < -0.5

  return (
    <Card className="py-4">
      <CardContent className="flex flex-col gap-1 px-4">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className="text-xl font-semibold tabular-nums">{format(current)}</span>
        {isNew ? (
          <span className="flex items-center gap-1 text-xs font-medium text-primary">
            <Sparkles className="size-3" /> Nouveau sur cette période
          </span>
        ) : change !== null ? (
          <span
            className={`flex items-center gap-1 text-xs font-medium ${
              up ? 'text-success' : down ? 'text-destructive' : 'text-muted-foreground'
            }`}
          >
            {up ? <TrendingUp className="size-3" /> : down ? <TrendingDown className="size-3" /> : null}
            {up ? '+' : ''}
            {change.toFixed(0)}% vs période précédente
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </CardContent>
    </Card>
  )
}

// Repère le meilleur jour de la période à partir de la série CA/jour — petit
// coup de projecteur motivant plutôt qu'un simple graphique à interpréter.
function BestDayCallout({ series }: { series: CaPoint[] }) {
  const best = series.reduce<CaPoint | null>((acc, p) => (p.ca > (acc?.ca ?? 0) ? p : acc), null)
  if (!best || best.ca <= 0) return null
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-primary/10 px-4 py-3 text-sm">
      <Flame className="size-5 shrink-0 text-primary" />
      <p>
        Meilleur jour :{' '}
        <span className="font-semibold">{new Date(best.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}</span>{' '}
        avec <span className="font-semibold">{best.ca.toFixed(0)} €</span>
      </p>
    </div>
  )
}

export default function Statistiques() {
  const { session } = useAuth()
  const isAdmin = session?.role === 'admin'
  const [from, setFrom] = React.useState(startOfMonth())
  const [to, setTo] = React.useState(today())
  const [adminStats, setAdminStats] = React.useState<AdminStats | null>(null)
  const [techStats, setTechStats] = React.useState<TechnicienStats | null>(null)
  const [techSeries, setTechSeries] = React.useState<CaPoint[] | null>(null)
  const [unpaid, setUnpaid] = React.useState<PseDocument[]>([])
  const [error, setError] = React.useState<string | null>(null)
  const [downloading, setDownloading] = React.useState(false)

  const load = React.useCallback(async () => {
    if (!session) return
    try {
      if (isAdmin) {
        setAdminStats(await getAdminStats(session.sessionId, from, to))
      } else {
        const [stats, series, docs] = await Promise.all([
          getTechnicienStats(session.sessionId, from, to),
          getTechnicienTimeseries(session.sessionId, from, to),
          listUnpaidForTechnicien(session.sessionId),
        ])
        setTechStats(stats)
        setTechSeries(series)
        setUnpaid(docs)
      }
    } catch (e) {
      setError(friendlyError(e, 'Erreur de chargement.'))
    }
  }, [session, isAdmin, from, to])

  React.useEffect(() => {
    load()
  }, [load])

  const downloadReleve = async () => {
    if (!session) return
    setDownloading(true)
    try {
      const list = await listReleveInterventions(session.sessionId, from, to)
      const name = [session.technicienFirstName, session.technicienLastName].filter(Boolean).join(' ')
      const { downloadRelevePdf } = await import('@/lib/pdf')
      downloadRelevePdf(name || session.username, from, to, list)
    } catch (e) {
      setError(friendlyError(e, 'Erreur.'))
    } finally {
      setDownloading(false)
    }
  }

  return (
    <Page title="Statistiques">
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="flex min-w-0 flex-col gap-1">
            <Label className="text-xs">Du</Label>
            <Input type="date" className="w-full min-w-0" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="flex min-w-0 flex-col gap-1">
            <Label className="text-xs">Au</Label>
            <Input type="date" className="w-full min-w-0" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        {isAdmin && adminStats && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <StatCard label="Interventions" value={String(adminStats.total_interventions)} />
              <StatCard label="CA facturé" value={`${adminStats.ca.toFixed(2)} €`} />
              <StatCard label="En cours" value={String(adminStats.en_cours)} />
              <StatCard label="Terminées" value={String(adminStats.terminees)} />
              <StatCard label="Factures à acquitter" value={String(adminStats.factures_impayees)} />
              <StatCard label="CA impayé" value={`${adminStats.ca_impaye.toFixed(2)} €`} />
              <StatCard label="Panier moyen" value={`${adminStats.panier_moyen.toFixed(2)} €`} />
              <StatCard
                label="Devis → signés"
                value={
                  adminStats.taux_conversion === null
                    ? '—'
                    : `${adminStats.devis_signes}/${adminStats.devis_total} (${adminStats.taux_conversion.toFixed(0)}%)`
                }
              />
            </div>

            <TechRanking items={adminStats.by_technicien} />
          </>
        )}

        {!isAdmin && techStats && (
          <>
            {techStats.total_interventions === 0 ? (
              <EmptyState label="Aucune activité pour le moment sur cette période" />
            ) : (
              <>
                <div className="grid grid-cols-3 gap-3">
                  <ComparisonCard
                    label="Interventions"
                    current={techStats.total_interventions}
                    previous={techStats.total_interventions_prev}
                    format={(n) => String(n)}
                  />
                  <ComparisonCard
                    label="CA"
                    current={techStats.ca}
                    previous={techStats.ca_prev}
                    format={(n) => `${n.toFixed(0)} €`}
                  />
                  <ComparisonCard
                    label="Terminées"
                    current={techStats.terminees}
                    previous={techStats.terminees_prev}
                    format={(n) => String(n)}
                  />
                </div>

                {techSeries && <BestDayCallout series={techSeries} />}

                {techSeries && (
                  <Card>
                    <CardContent className="flex flex-col gap-3">
                      <p className="text-sm font-semibold">Chiffre d'affaires sur la période</p>
                      <CaBarChart data={techSeries} />
                    </CardContent>
                  </Card>
                )}

                {techStats.by_secteur.length > 0 && (
                  <Card>
                    <CardContent className="flex flex-col gap-3">
                      <p className="text-sm font-semibold">Répartition par type d'intervention</p>
                      <SecteurDonutChart data={techStats.by_secteur} />
                    </CardContent>
                  </Card>
                )}
              </>
            )}

            <Button onClick={downloadReleve} disabled={downloading}>
              {downloading ? 'Génération…' : 'Télécharger le relevé PDF'}
            </Button>

            <div>
              <p className="mb-2 text-sm font-medium">Facturées à acquitter</p>
              {unpaid.length === 0 ? (
                <EmptyState label="Aucune facture en attente" />
              ) : (
                <div className="flex flex-col gap-2">
                  {unpaid.map((d) => (
                    <Link key={d.id} to={`/factures/${d.id}/modifier`}>
                      <Card className="py-3">
                        <CardContent className="flex items-center justify-between gap-2 px-3 text-sm">
                          <span className="min-w-0 truncate">
                            {d.number} — {[d.client_first_name, d.client_last_name].filter(Boolean).join(' ')}
                          </span>
                          <span className="shrink-0 font-semibold tabular-nums">
                            {totalTTC(d.items, d.vat_rate, d.discount_type, d.discount_value).toFixed(2)} €
                          </span>
                        </CardContent>
                      </Card>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </Page>
  )
}
