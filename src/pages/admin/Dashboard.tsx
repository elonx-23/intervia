import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  Contact,
  CreditCard,
  Euro,
  Megaphone,
  Plus,
  TrendingUp,
  Users,
  Wallet,
} from 'lucide-react'
import * as React from 'react'
import { Link } from 'react-router-dom'

import { CaBarChart } from '@/components/admin/CaBarChart'
import { SecteurDonutChart } from '@/components/admin/SecteurDonutChart'
import { TrashSection } from '@/components/admin/TrashSection'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Page } from '@/components/layout/Page'
import { useAuth } from '@/lib/auth'
import { friendlyError } from '@/lib/errors'
import { broadcastUrgentNotification } from '@/lib/notifications'
import { getAdminStats, getAdminTimeseries, type AdminStats, type CaPoint } from '@/lib/statistiques'
import { isoLocalDate } from '@/lib/utils'

const DEFAULT_MESSAGE =
  'Une intervention est en attente de ta validation ! Viens sur WhatsApp pour la confirmer 💬🔥'

type Period = 'jour' | 'semaine' | 'mois'

const PERIODS: { key: Period; label: string; days: number }[] = [
  { key: 'jour', label: "Aujourd'hui", days: 1 },
  { key: 'semaine', label: '7 jours', days: 7 },
  { key: 'mois', label: '30 jours', days: 30 },
]

function rangeFor(days: number) {
  const to = new Date()
  const from = new Date()
  from.setDate(from.getDate() - (days - 1))
  return { from: isoLocalDate(from), to: isoLocalDate(to) }
}

const fmtEuro = (n: number) => `${n.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} €`

const MORPH_DURATION_MS = 500

// Une couleur par indicateur plutôt que 6 cartes identiques ton-sur-ton —
// pastille "bulle" translucide (même logique que le verre du thème : de la
// couleur en transparence, pas un aplat) pour repérer chaque chiffre d'un
// coup d'œil au lieu de devoir lire chaque étiquette.
function StatCard({
  icon: Icon,
  tone,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>
  tone: string
  label: string
  value: React.ReactNode
}) {
  return (
    <Card className="py-4">
      <CardContent className="flex flex-col gap-2 px-4">
        <div className={`flex size-8 items-center justify-center rounded-full ${tone}`}>
          <Icon className="size-4" />
        </div>
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className="text-xl font-semibold tabular-nums">{value}</span>
      </CardContent>
    </Card>
  )
}

export default function Dashboard() {
  const { session } = useAuth()
  const [period, setPeriod] = React.useState<Period>('semaine')
  const [stats, setStats] = React.useState<AdminStats | null>(null)
  const [series, setSeries] = React.useState<CaPoint[] | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [urgentOpen, setUrgentOpen] = React.useState(false)
  const [title, setTitle] = React.useState('Intervention en attente')
  const [message, setMessage] = React.useState(DEFAULT_MESSAGE)
  const [confirming, setConfirming] = React.useState(false)
  const [sending, setSending] = React.useState(false)

  // Même bulle de verre liquide qui coule d'un onglet à l'autre que sur la
  // barre de navigation du bas, rejouée à chaque changement de période.
  const periodIndex = Math.max(
    0,
    PERIODS.findIndex((p) => p.key === period),
  )
  const prevPeriodIndex = React.useRef(periodIndex)
  const [periodMorphing, setPeriodMorphing] = React.useState(false)

  React.useEffect(() => {
    if (prevPeriodIndex.current !== periodIndex) {
      prevPeriodIndex.current = periodIndex
      setPeriodMorphing(true)
      const t = setTimeout(() => setPeriodMorphing(false), MORPH_DURATION_MS)
      return () => clearTimeout(t)
    }
  }, [periodIndex])

  React.useEffect(() => {
    if (!session) return
    const days = PERIODS.find((p) => p.key === period)!.days
    const { from, to } = rangeFor(days)
    setStats(null)
    setSeries(null)
    Promise.all([getAdminStats(session.sessionId, from, to), getAdminTimeseries(session.sessionId, from, to)])
      .then(([s, ts]) => {
        setStats(s)
        setSeries(ts)
      })
      .catch((e) => setError(friendlyError(e, 'Erreur de chargement.')))
  }, [session, period])

  const sendUrgent = async () => {
    if (!session) return
    setSending(true)
    try {
      await broadcastUrgentNotification(session.sessionId, title, message)
      setUrgentOpen(false)
      setConfirming(false)
    } catch (e) {
      setError(friendlyError(e, 'Erreur.'))
    } finally {
      setSending(false)
    }
  }

  const maxCa = stats ? Math.max(1, ...stats.by_technicien.map((t) => t.ca)) : 1

  return (
    <Page title="Tableau de bord">
      <div className="flex flex-col gap-4">
        <Link to="/interventions/nouvelle">
          <Button size="lg" className="h-16 w-full gap-2.5 text-base shadow-lg shadow-primary/25">
            <Plus className="size-6" />
            Nouvelle intervention
          </Button>
        </Link>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="relative flex rounded-full bg-secondary/70 p-1">
          <div
            className={`glass absolute inset-y-1 rounded-full bg-background shadow-sm transition-[left,width] duration-500 [transition-timing-function:cubic-bezier(0.34,1.2,0.4,1)] ${periodMorphing ? 'liquid-blob-morph' : ''}`}
            style={{
              left: `calc(${(periodIndex / PERIODS.length) * 100}% + 2px)`,
              width: `calc(${100 / PERIODS.length}% - 4px)`,
            }}
            aria-hidden="true"
          />
          {PERIODS.map((p) => (
            <button
              key={p.key}
              onClick={() => setPeriod(p.key)}
              className={`relative z-10 flex-1 rounded-full py-1.5 text-xs font-medium transition-colors ${
                period === p.key ? 'text-foreground' : 'text-muted-foreground'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        {!stats && !error && <p className="py-6 text-center text-sm text-muted-foreground">Chargement…</p>}

        {stats && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <StatCard
                icon={Euro}
                tone="bg-primary/15 text-primary"
                label="CA facturé"
                value={fmtEuro(stats.ca)}
              />
              <StatCard
                icon={ClipboardList}
                tone="bg-violet-500/15 text-violet-600 dark:text-violet-400"
                label="Interventions"
                value={stats.total_interventions}
              />
              <StatCard
                icon={CalendarClock}
                tone="bg-amber-500/15 text-amber-600 dark:text-amber-400"
                label="En cours"
                value={stats.en_cours}
              />
              <StatCard
                icon={CheckCircle2}
                tone="bg-success/15 text-success"
                label="Terminées"
                value={stats.terminees}
              />
              <StatCard
                icon={Wallet}
                tone="bg-teal-500/15 text-teal-600 dark:text-teal-400"
                label="Panier moyen"
                value={fmtEuro(stats.panier_moyen)}
              />
              <StatCard
                icon={TrendingUp}
                tone="bg-rose-500/15 text-rose-600 dark:text-rose-400"
                label="Devis signés"
                value={stats.taux_conversion === null ? '—' : `${stats.taux_conversion.toFixed(0)} %`}
              />
            </div>

            {stats.factures_impayees > 0 && (
              <Card className="border-destructive/30 bg-destructive/5">
                <CardContent className="flex items-center gap-3 px-4 py-3">
                  <AlertTriangle className="size-5 shrink-0 text-destructive" />
                  <p className="text-sm">
                    <span className="font-semibold">{stats.factures_impayees} facture(s)</span> en attente de
                    paiement — <span className="font-semibold">{fmtEuro(stats.ca_impaye)}</span> en jeu
                  </p>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-sm">
                  <span className="flex size-6 items-center justify-center rounded-full bg-primary/15 text-primary">
                    <Euro className="size-3.5" />
                  </span>
                  Chiffre d'affaires
                </CardTitle>
              </CardHeader>
              <CardContent>{series && <CaBarChart data={series} />}</CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-sm">
                  <span className="flex size-6 items-center justify-center rounded-full bg-rose-500/15 text-rose-600 dark:text-rose-400">
                    <TrendingUp className="size-3.5" />
                  </span>
                  Répartition par secteur d'activité
                </CardTitle>
              </CardHeader>
              <CardContent>
                <SecteurDonutChart data={stats.by_secteur} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-sm">
                  <span className="flex size-6 items-center justify-center rounded-full bg-violet-500/15 text-violet-600 dark:text-violet-400">
                    <Users className="size-3.5" />
                  </span>
                  Performance par technicien
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                {stats.by_technicien.length === 0 && (
                  <p className="text-sm text-muted-foreground">Aucun technicien actif.</p>
                )}
                {stats.by_technicien.map((t) => (
                  <div key={t.technicien_id} className="flex flex-col gap-1">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium">{t.name}</span>
                      <span className="tabular-nums text-muted-foreground">
                        {fmtEuro(t.ca)} · {t.total_interventions} interv.
                      </span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
                      <div
                        className="h-full rounded-full bg-primary/80"
                        style={{ width: `${Math.max(3, (t.ca / maxCa) * 100)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </>
        )}

        <div className="grid grid-cols-3 gap-3">
          <Link to="/techniciens">
            <Card className="py-4">
              <CardContent className="flex flex-col items-center gap-2 px-3 text-center">
                <div className="flex size-8 items-center justify-center rounded-full bg-violet-500/15 text-violet-600 dark:text-violet-400">
                  <Users className="size-4" />
                </div>
                <span className="text-sm font-medium">Techniciens</span>
              </CardContent>
            </Card>
          </Link>
          <Link to="/clients">
            <Card className="py-4">
              <CardContent className="flex flex-col items-center gap-2 px-3 text-center">
                <div className="flex size-8 items-center justify-center rounded-full bg-primary/15 text-primary">
                  <Contact className="size-4" />
                </div>
                <span className="text-sm font-medium">Clients</span>
              </CardContent>
            </Card>
          </Link>
          <Link to="/paiements">
            <Card className="py-4">
              <CardContent className="flex flex-col items-center gap-2 px-3 text-center">
                <div className="flex size-8 items-center justify-center rounded-full bg-success/15 text-success">
                  <CreditCard className="size-4" />
                </div>
                <span className="text-sm font-medium">Paiements</span>
              </CardContent>
            </Card>
          </Link>
        </div>

        <Button variant="destructive" onClick={() => setUrgentOpen(true)}>
          <Megaphone className="size-4" />
          Notification techniciens urgent
        </Button>

        <TrashSection />
      </div>

      <Dialog
        open={urgentOpen}
        onOpenChange={(o) => {
          setUrgentOpen(o)
          if (!o) setConfirming(false)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Notification urgente à tous les techniciens</DialogTitle>
          </DialogHeader>
          {!confirming ? (
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-2">
                <Label>Titre</Label>
                <Input value={title} onChange={(e) => setTitle(e.target.value)} />
              </div>
              <div className="flex flex-col gap-2">
                <Label>Message</Label>
                <Textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={4} />
              </div>
            </div>
          ) : (
            <p className="text-sm">
              Envoyer cette notification à <strong>tous les techniciens actifs</strong> maintenant ?
            </p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => (confirming ? setConfirming(false) : setUrgentOpen(false))}>
              {confirming ? 'Retour' : 'Annuler'}
            </Button>
            {!confirming ? (
              <Button onClick={() => setConfirming(true)} disabled={!title || !message}>
                Continuer
              </Button>
            ) : (
              <Button variant="destructive" onClick={sendUrgent} disabled={sending}>
                {sending ? 'Envoi…' : 'Envoyer'}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Page>
  )
}
