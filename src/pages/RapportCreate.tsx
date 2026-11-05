import { ChevronRight, ClipboardList, FileText, Loader2, MapPin, Phone, Receipt, Search, UserRound, Wrench, X } from 'lucide-react'
import * as React from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'

import { Loader } from '@/components/Loader'
import { Page } from '@/components/layout/Page'
import { TradeIcon } from '@/components/TradeIcon'
import { placeName } from '@/components/WorkOrderCard'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { useAuth } from '@/lib/auth'
import { DEVIS_STATUS_LABELS, FACTURE_STATUS_LABELS, listDocuments, totalTTC, type PseDocument } from '@/lib/documents'
import { friendlyError } from '@/lib/errors'
import { STATUS_LABELS, listInterventions, type Intervention } from '@/lib/interventions'
import { createReport } from '@/lib/reports'
import { INTERVENTION_TONE, documentTone } from '@/lib/tones'
import { formatEuro, normalizeSearch } from '@/lib/utils'

// Nouveau rapport d'intervention : on cherche un CLIENT (ses factures, devis
// et fiches s'affichent) ou directement une INTERVENTION, puis un appui crée
// le rapport, prérempli avec tout ce que l'app sait déjà.

interface ClientGroup {
  key: string
  name: string
  phone: string | null
  address: string | null
  city: string | null
  postalCode: string | null
  documents: PseDocument[]
  interventions: Intervention[]
  last: string
  haystack: string
}

const fullName = (first?: string | null, last?: string | null) => [first, last].filter(Boolean).join(' ').trim()
const digits = (s?: string | null) => String(s ?? '').replace(/\D/g, '')

// Même client : même téléphone ET même nom de famille (un numéro partagé ou
// saisi par défaut ne fusionne pas deux clients), sinon même nom + même adresse.
function clientKey(name: string, phone: string | null | undefined, address: string | null | undefined) {
  const tel = digits(phone)
  const words = normalizeSearch(name).split(/\s+/).filter(Boolean)
  if (tel.length >= 6) return `t:${tel.slice(-9)}|${words[words.length - 1] ?? ''}`
  return `n:${words.join(' ')}|${normalizeSearch(address ?? '')}`
}

function groupClients(interventions: Intervention[], documents: PseDocument[]) {
  const map = new Map<string, ClientGroup>()
  const touch = (
    name: string,
    phone: string | null,
    address: string | null,
    postalCode: string | null,
    city: string | null,
    date: string,
  ): ClientGroup | null => {
    if (!name && !phone && !address) return null
    const key = clientKey(name, phone, address)
    let c = map.get(key)
    if (!c) {
      c = {
        key,
        name: name || 'Client sans nom',
        phone,
        address,
        city,
        postalCode,
        documents: [],
        interventions: [],
        last: date,
        haystack: '',
      }
      map.set(key, c)
    }
    // Les coordonnées les plus récentes l'emportent.
    if (date >= c.last) {
      c.last = date
      if (name) c.name = name
      c.phone = phone || c.phone
      c.address = address || c.address
      c.city = city || c.city
      c.postalCode = postalCode || c.postalCode
    }
    return c
  }
  for (const d of documents) {
    touch(fullName(d.client_first_name, d.client_last_name), d.phone, d.address, d.postal_code, d.city, d.created_at)?.documents.push(d)
  }
  for (const i of interventions) {
    touch(fullName(i.client_first_name, i.client_last_name), i.phone, i.address, i.postal_code, i.city, i.created_at)?.interventions.push(i)
  }
  const list = [...map.values()]
  for (const c of list) {
    c.documents.sort((a, b) => b.created_at.localeCompare(a.created_at))
    c.interventions.sort((a, b) => b.created_at.localeCompare(a.created_at))
    c.haystack = normalizeSearch(
      [
        c.name,
        c.phone,
        digits(c.phone),
        c.address,
        c.postalCode,
        c.city,
        ...c.documents.map((d) => d.number),
        ...c.interventions.map((i) => i.reference),
      ].join(' '),
    )
  }
  return list.sort((a, b) => b.last.localeCompare(a.last))
}

const interventionHaystack = (i: Intervention) =>
  normalizeSearch(
    [
      i.reference,
      fullName(i.client_first_name, i.client_last_name),
      i.phone,
      digits(i.phone),
      i.address,
      i.postal_code,
      i.city,
      i.intervention_type,
      i.description,
    ].join(' '),
  )

const shortDate = (iso: string) => new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' })

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <p className="px-1 pt-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">{children}</p>
}

function Row({
  icon,
  title,
  subtitle,
  right,
  onClick,
  disabled,
}: {
  icon: React.ReactNode
  title: React.ReactNode
  subtitle?: React.ReactNode
  right?: React.ReactNode
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} className="block w-full text-left disabled:opacity-60">
      <Card className="flex-row items-center gap-3 px-4 py-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-secondary text-foreground">{icon}</span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[15px] font-semibold tracking-tight">{title}</div>
          {subtitle && <div className="mt-0.5 truncate text-[13px] text-muted-foreground">{subtitle}</div>}
        </div>
        {right}
        <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
      </Card>
    </button>
  )
}

function InterventionRow({ i, onPick, disabled }: { i: Intervention; onPick: () => void; disabled?: boolean }) {
  const client = fullName(i.client_first_name, i.client_last_name)
  return (
    <Row
      onClick={onPick}
      disabled={disabled}
      icon={<TradeIcon trade={i.intervention_type} className="size-5" />}
      title={
        <span className="flex items-baseline justify-between gap-2">
          <span className="truncate">{placeName(i)}</span>
          <span className="shrink-0 text-xs font-medium text-muted-foreground">{shortDate(i.created_at)}</span>
        </span>
      }
      subtitle={
        <span className="flex items-center justify-between gap-2">
          <span className="truncate">{[client || 'Client sans nom', i.reference].join(' · ')}</span>
          <Badge variant={INTERVENTION_TONE[i.status]} className="shrink-0 text-[10px]">
            {STATUS_LABELS[i.status]}
          </Badge>
        </span>
      }
    />
  )
}

function DocumentRow({ d, onPick, disabled }: { d: PseDocument; onPick: () => void; disabled?: boolean }) {
  const isFacture = d.kind === 'facture'
  const label = isFacture
    ? FACTURE_STATUS_LABELS[d.status as keyof typeof FACTURE_STATUS_LABELS]
    : DEVIS_STATUS_LABELS[d.status as keyof typeof DEVIS_STATUS_LABELS]
  return (
    <Row
      onClick={onPick}
      disabled={disabled}
      icon={isFacture ? <Receipt className="size-5 text-tone-green" /> : <FileText className="size-5 text-tone-violet" />}
      title={
        <span className="flex items-baseline justify-between gap-2">
          <span className="truncate">
            {isFacture ? 'Facture' : 'Devis'} {d.number}
          </span>
          <span className="shrink-0">{formatEuro(totalTTC(d.items, d.vat_rate, d.discount_type, d.discount_value))}</span>
        </span>
      }
      subtitle={
        <span className="flex items-center justify-between gap-2">
          <span className="truncate">
            {shortDate(d.issue_date)}
            {d.items[0] ? ` · ${d.items[0].label}` : ''}
          </span>
          {label && (
            <Badge variant={documentTone(d.kind, d.status)} className="shrink-0 text-[10px]">
              {label}
            </Badge>
          )}
        </span>
      }
    />
  )
}

export default function RapportCreate() {
  const { session } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [data, setData] = React.useState<{ interventions: Intervention[]; clients: ClientGroup[] } | null>(null)
  const [query, setQuery] = React.useState('')
  const [client, setClient] = React.useState<ClientGroup | null>(null)
  const [creating, setCreating] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  const create = React.useCallback(
    async (key: string, source: { interventionId?: string; documentId?: string }) => {
      if (!session) return
      setCreating(key)
      setError(null)
      try {
        const report = await createReport(session.sessionId, source)
        navigate(`/rapports/${report.id}?ia=1`, { replace: true })
      } catch (e) {
        setError(friendlyError(e, 'Impossible de créer le rapport.'))
        setCreating(null)
      }
    },
    [session, navigate],
  )

  // Ouvert depuis une fiche (« Rapport d'intervention ») : création directe.
  const fromIntervention = params.get('intervention')
  React.useEffect(() => {
    if (fromIntervention) create('auto', { interventionId: fromIntervention })
  }, [fromIntervention, create])

  React.useEffect(() => {
    if (!session || fromIntervention) return
    Promise.all([
      listInterventions(session.sessionId),
      listDocuments(session.sessionId, 'facture'),
      listDocuments(session.sessionId, 'devis'),
    ])
      .then(([interventions, factures, devis]) => {
        const sorted = [...interventions].sort((a, b) => b.created_at.localeCompare(a.created_at))
        setData({ interventions: sorted, clients: groupClients(sorted, [...factures, ...devis]) })
      })
      .catch((e) => setError(friendlyError(e, 'Erreur de chargement.')))
  }, [session, fromIntervention])

  const q = normalizeSearch(query.trim())
  const results = React.useMemo(() => {
    if (!data) return null
    if (!q) return { clients: data.clients.slice(0, 6), interventions: data.interventions.slice(0, 8) }
    const words = q.split(/\s+/)
    const hit = (h: string) => words.every((w) => h.includes(w))
    return {
      clients: data.clients.filter((c) => hit(c.haystack)).slice(0, 12),
      interventions: data.interventions.filter((i) => hit(interventionHaystack(i))).slice(0, 15),
    }
  }, [data, q])

  if (fromIntervention) {
    return (
      <Page title="Nouveau rapport">
        {error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : (
          <div className="flex flex-col items-center gap-2 py-16">
            <Loader />
            <p className="text-sm text-muted-foreground">Création du rapport…</p>
          </div>
        )}
      </Page>
    )
  }

  return (
    <Page title="Nouveau rapport">
      <div className="flex flex-col gap-3">
        {error && <p className="text-sm text-destructive">{error}</p>}

        {client ? (
          <>
            <Card className="gap-3 px-4 py-4">
              <div className="flex items-start gap-3">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-tone-blue-soft text-tone-blue-ink">
                  <UserRound className="size-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-lg font-bold tracking-tight">{client.name}</p>
                  {client.phone && (
                    <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                      <Phone className="size-3.5" /> {client.phone}
                    </p>
                  )}
                  {(client.address || client.city) && (
                    <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                      <MapPin className="size-3.5 shrink-0" />
                      <span className="truncate">
                        {[client.address, [client.postalCode, client.city].filter(Boolean).join(' ')].filter(Boolean).join(', ')}
                      </span>
                    </p>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8 shrink-0 rounded-full"
                  onClick={() => setClient(null)}
                  aria-label="Changer de client"
                >
                  <X className="size-4" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">Choisis la facture, le devis ou l'intervention du rapport.</p>
            </Card>

            {client.documents.length > 0 && <SectionTitle>Factures et devis</SectionTitle>}
            {client.documents.map((d) => (
              <DocumentRow key={d.id} d={d} disabled={creating !== null} onPick={() => create(d.id, { documentId: d.id })} />
            ))}
            {client.interventions.length > 0 && <SectionTitle>Interventions</SectionTitle>}
            {client.interventions.map((i) => (
              <InterventionRow key={i.id} i={i} disabled={creating !== null} onPick={() => create(i.id, { interventionId: i.id })} />
            ))}
          </>
        ) : (
          <>
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                autoFocus
                placeholder="Rechercher un client ou une intervention"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="h-12 pl-10 text-base"
              />
            </div>
            <p className="px-1 text-xs text-muted-foreground">Nom, téléphone, adresse, ville, n° de facture ou référence de fiche.</p>

            {!results && !error && <Loader className="py-10" />}
            {results && results.clients.length === 0 && results.interventions.length === 0 && (
              <p className="py-10 text-center text-sm text-muted-foreground">Aucun client ni intervention trouvé.</p>
            )}

            {results && results.clients.length > 0 && <SectionTitle>{q ? 'Clients' : 'Clients récents'}</SectionTitle>}
            {results?.clients.map((c) => (
              <Row
                key={c.key}
                onClick={() => setClient(c)}
                icon={<UserRound className="size-5 text-tone-blue" />}
                title={c.name}
                subtitle={[c.phone, c.city || c.address].filter(Boolean).join(' · ') || 'Coordonnées non renseignées'}
                right={
                  <span className="flex shrink-0 items-center gap-1">
                    {c.documents.some((d) => d.kind === 'facture') && (
                      <Badge variant="green" className="gap-1 text-[10px]">
                        <Receipt className="size-3" /> {c.documents.filter((d) => d.kind === 'facture').length}
                      </Badge>
                    )}
                    {c.documents.some((d) => d.kind === 'devis') && (
                      <Badge variant="violet" className="gap-1 text-[10px]">
                        <FileText className="size-3" /> {c.documents.filter((d) => d.kind === 'devis').length}
                      </Badge>
                    )}
                    {c.interventions.length > 0 && (
                      <Badge variant="blue" className="gap-1 text-[10px]">
                        <Wrench className="size-3" /> {c.interventions.length}
                      </Badge>
                    )}
                  </span>
                }
              />
            ))}

            {results && results.interventions.length > 0 && <SectionTitle>{q ? 'Interventions' : 'Interventions récentes'}</SectionTitle>}
            {results?.interventions.map((i) => (
              <InterventionRow key={i.id} i={i} disabled={creating !== null} onPick={() => create(i.id, { interventionId: i.id })} />
            ))}
          </>
        )}

        {creating && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 backdrop-blur-sm">
            <div className="flex items-center gap-3 rounded-2xl bg-card px-5 py-4 shadow-lg">
              <Loader2 className="size-5 animate-spin text-primary" />
              <span className="text-sm font-medium">
                <ClipboardList className="mr-1 inline size-4" /> Création du rapport…
              </span>
            </div>
          </div>
        )}
      </div>
    </Page>
  )
}
