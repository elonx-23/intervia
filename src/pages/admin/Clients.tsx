import { Search, X } from 'lucide-react'
import * as React from 'react'
import { Link } from 'react-router-dom'

import { EmptyState } from '@/components/layout/EmptyState'
import { Page } from '@/components/layout/Page'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { useAuth } from '@/lib/auth'
import { listClients, type ClientSummary } from '@/lib/clients'
import { friendlyError } from '@/lib/errors'

function normalize(s: string) {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
}

export default function Clients() {
  const { session } = useAuth()
  const [clients, setClients] = React.useState<ClientSummary[] | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [searchOpen, setSearchOpen] = React.useState(false)
  const [search, setSearch] = React.useState('')

  React.useEffect(() => {
    if (!session) return
    listClients(session.sessionId)
      .then(setClients)
      .catch((e) => setError(friendlyError(e, 'Erreur de chargement.')))
  }, [session])

  const filtered = React.useMemo(() => {
    if (!clients) return null
    const q = normalize(search.trim())
    if (!q) return clients
    return clients.filter((c) => normalize(`${c.name} ${c.phone ?? ''} ${c.address ?? ''}`).includes(q))
  }, [clients, search])

  return (
    <Page title="Clients">
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-end gap-2">
          <Button variant="outline" size="icon" onClick={() => setSearchOpen((o) => !o)} aria-label="Rechercher">
            {searchOpen ? <X className="size-4" /> : <Search className="size-4" />}
          </Button>
        </div>

        {searchOpen && (
          <Input
            autoFocus
            placeholder="Nom, téléphone, adresse…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}
        {clients === null && !error && <p className="py-8 text-center text-sm text-muted-foreground">Chargement…</p>}
        {filtered !== null && filtered.length === 0 && <EmptyState label="Aucun client" />}

        <div className="flex flex-col gap-2">
          {filtered?.map((c) => (
            <Link key={c.key} to={`/clients/${encodeURIComponent(c.key)}`}>
              <Card className="liquid py-3">
                <CardContent className="flex items-center justify-between gap-2 px-4">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{c.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {c.phone || c.address || 'Coordonnées inconnues'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {c.devis_count} devis · {c.facture_count} facture{c.facture_count > 1 ? 's' : ''}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-semibold tabular-nums">{c.ca_paye.toFixed(2)} €</p>
                    {c.ca_du > 0 && (
                      <p className="text-xs text-warning tabular-nums">{c.ca_du.toFixed(2)} € dû</p>
                    )}
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </Page>
  )
}
