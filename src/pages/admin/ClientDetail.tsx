import * as React from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'

import { EmptyState } from '@/components/layout/EmptyState'
import { ErrorState } from '@/components/layout/ErrorState'
import { Page } from '@/components/layout/Page'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { useAuth } from '@/lib/auth'
import { listClients, type ClientSummary } from '@/lib/clients'
import {
  DEVIS_STATUS_LABELS,
  FACTURE_STATUS_LABELS,
  listDocuments,
  totalTTC,
  type PseDocument,
} from '@/lib/documents'
import { friendlyError } from '@/lib/errors'

// Même règle d'identification que côté serveur (téléphone en priorité, sinon
// nom + adresse) — dupliquée ici volontairement, c'est une comparaison
// simple sur des champs déjà en mémoire, pas la peine d'un aller-retour API
// dédié.
function matches(doc: PseDocument, client: ClientSummary) {
  const phone = (doc.phone ?? '').trim()
  if (client.phone) return phone === client.phone
  const name = `${doc.client_first_name} ${doc.client_last_name}`.trim().toLowerCase()
  const address = (doc.address ?? '').trim().toLowerCase()
  return `${name}|${address}` === client.key
}

export default function ClientDetail() {
  const { key } = useParams()
  const navigate = useNavigate()
  const { session } = useAuth()
  const [client, setClient] = React.useState<ClientSummary | null>(null)
  const [documents, setDocuments] = React.useState<PseDocument[] | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!session || !key) return
    const decoded = decodeURIComponent(key)
    Promise.all([listClients(session.sessionId), listDocuments(session.sessionId, 'devis'), listDocuments(session.sessionId, 'facture')])
      .then(([clients, devis, factures]) => {
        const found = clients.find((c) => c.key === decoded)
        if (!found) {
          setError('Client introuvable.')
          return
        }
        setClient(found)
        const all = [...devis, ...factures].filter((d) => matches(d, found))
        all.sort((a, b) => (a.issue_date < b.issue_date ? 1 : -1))
        setDocuments(all)
      })
      .catch((e) => setError(friendlyError(e, 'Erreur de chargement.')))
  }, [session, key])

  if (error) {
    return (
      <Page title="Client">
        <ErrorState label={error} onBack={() => navigate(-1)} />
      </Page>
    )
  }
  if (!client) {
    return (
      <Page title="Client">
        <p className="py-8 text-center text-sm text-muted-foreground">Chargement…</p>
      </Page>
    )
  }

  return (
    <Page title={client.name}>
      <div className="flex flex-col gap-4">
        <Card>
          <CardContent className="flex flex-col gap-2">
            {client.phone && <p className="text-sm text-muted-foreground">{client.phone}</p>}
            {client.address && <p className="text-sm text-muted-foreground">{client.address}</p>}
            <div className="mt-2 grid grid-cols-2 gap-3 text-sm">
              <p>
                Devis : <span className="font-semibold">{client.devis_count}</span>
              </p>
              <p>
                Factures : <span className="font-semibold">{client.facture_count}</span>
              </p>
              <p>
                Payé : <span className="font-semibold">{client.ca_paye.toFixed(2)} €</span>
              </p>
              {client.ca_du > 0 && (
                <p>
                  Dû : <span className="font-semibold text-warning">{client.ca_du.toFixed(2)} €</span>
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        <p className="text-sm font-medium text-muted-foreground">Historique</p>

        {documents === null && <p className="py-4 text-center text-sm text-muted-foreground">Chargement…</p>}
        {documents !== null && documents.length === 0 && <EmptyState label="Aucun document" />}

        <div className="flex flex-col gap-2">
          {documents?.map((d) => {
            const ttc = totalTTC(d.items, d.vat_rate, d.discount_type, d.discount_value)
            const statusLabel =
              d.kind === 'devis'
                ? DEVIS_STATUS_LABELS[d.status as keyof typeof DEVIS_STATUS_LABELS]
                : FACTURE_STATUS_LABELS[d.status as keyof typeof FACTURE_STATUS_LABELS]
            return (
              <Link key={d.id} to={`/${d.kind === 'devis' ? 'devis' : 'factures'}/${d.id}/modifier`}>
                <Card className="liquid py-3">
                  <CardContent className="flex items-center justify-between gap-2 px-4">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{d.number}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(d.issue_date).toLocaleDateString('fr-FR')}
                      </p>
                    </div>
                    <div className="shrink-0 flex items-center gap-2">
                      <span className="font-semibold tabular-nums">{ttc.toFixed(2)} €</span>
                      <Badge variant={d.status === 'payee' || d.status === 'signe' ? 'success' : 'outline'}>
                        {statusLabel}
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            )
          })}
        </div>
      </div>
    </Page>
  )
}
