import * as React from 'react'

import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { EmptyState } from '@/components/layout/EmptyState'
import { Page } from '@/components/layout/Page'
import { useAuth } from '@/lib/auth'
import { friendlyError } from '@/lib/errors'
import { getStripeStatus, listPayments, type PaymentRecord, type StripeStatus } from '@/lib/payments'

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

function sumSince(payments: PaymentRecord[], sinceMs: number) {
  return payments
    .filter((p) => p.paid_at && new Date(p.paid_at).getTime() >= sinceMs)
    .reduce((sum, p) => sum + p.amount, 0)
}

export default function Paiements() {
  const { session } = useAuth()
  const [status, setStatus] = React.useState<StripeStatus | null>(null)
  const [payments, setPayments] = React.useState<PaymentRecord[] | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!session) return
    Promise.all([getStripeStatus(session.sessionId), listPayments(session.sessionId)])
      .then(([s, p]) => {
        setStatus(s)
        setPayments(p)
      })
      .catch((e) => setError(friendlyError(e, 'Erreur de chargement.')))
  }, [session])

  const now = Date.now()
  const dayMs = 24 * 60 * 60 * 1000
  const todayStart = new Date(new Date().toDateString()).getTime()
  const totals = payments
    ? {
        today: sumSince(payments, todayStart),
        week: sumSince(payments, now - 7 * dayMs),
        month: sumSince(payments, now - 30 * dayMs),
      }
    : null

  return (
    <Page title="Paiements">
      <div className="flex flex-col gap-4">
        {error && <p className="text-sm text-destructive">{error}</p>}

        <Card>
          <CardContent className="flex flex-col gap-2">
            <p className="text-sm font-semibold">Connexion Stripe</p>
            {!status && <p className="text-sm text-muted-foreground">Chargement…</p>}
            {status && !status.configured && (
              <p className="text-sm text-muted-foreground">
                Non configuré — ajoute <code>STRIPE_SECRET_KEY</code> dans <code>server/.env</code>.
              </p>
            )}
            {status?.configured && status.error && (
              <p className="text-sm text-destructive">Erreur de connexion : {status.error}</p>
            )}
            {status?.configured && !status.error && (
              <div className="flex flex-col gap-1 text-sm">
                <div className="flex items-center gap-2">
                  <Badge variant="success">Connecté</Badge>
                  <Badge variant={status.live_mode ? 'destructive' : 'outline'}>
                    {status.live_mode ? 'Mode réel' : 'Mode test'}
                  </Badge>
                </div>
                {status.business_name && <p className="text-muted-foreground">{status.business_name}</p>}
                <p className="text-xs text-muted-foreground">
                  Paiements {status.charges_enabled ? 'activés' : 'désactivés'} · Virements{' '}
                  {status.payouts_enabled ? 'activés' : 'désactivés'}
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {totals && (
          <div className="grid grid-cols-3 gap-3">
            <StatCard label="Aujourd'hui" value={`${totals.today.toFixed(0)} €`} />
            <StatCard label="7 jours" value={`${totals.week.toFixed(0)} €`} />
            <StatCard label="30 jours" value={`${totals.month.toFixed(0)} €`} />
          </div>
        )}

        <p className="text-sm font-medium text-muted-foreground">Historique des encaissements</p>

        {payments === null && !error && <p className="py-4 text-center text-sm text-muted-foreground">Chargement…</p>}
        {payments !== null && payments.length === 0 && <EmptyState label="Aucun encaissement en ligne pour l'instant" />}

        <div className="flex flex-col gap-2">
          {payments?.map((p) => (
            <Card key={p.id} className="py-3">
              <CardContent className="flex items-center justify-between gap-2 px-4">
                <div className="min-w-0">
                  <p className="truncate font-medium">{p.client_name || 'Client sans nom'}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {p.number} {p.technicien_name ? `· ${p.technicien_name}` : ''}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {p.paid_at ? new Date(p.paid_at).toLocaleString('fr-FR') : '—'}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="font-semibold tabular-nums">{p.amount.toFixed(2)} €</p>
                  <Badge variant="success">Payée</Badge>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </Page>
  )
}
