import { ClipboardList, Search, X } from 'lucide-react'
import * as React from 'react'
import { Link } from 'react-router-dom'

import { Page } from '@/components/layout/Page'
import { EmptyState } from '@/components/layout/EmptyState'
import { SwipeToDelete, SwipeToDeleteGroup } from '@/components/SwipeToDelete'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { useAuth } from '@/lib/auth'
import { useLiveEvents } from '@/hooks/useLiveEvents'
import {
  cancelDeletionRequest,
  confirmDeletion,
  deleteDocument,
  listDocuments,
  totalTTC,
  type DocumentKind,
  type PseDocument,
} from '@/lib/documents'
import { friendlyError } from '@/lib/errors'
import { downloadReportPdf } from '@/lib/pdf'
import { listReports, type InterventionReportListItem } from '@/lib/reports'
import { normalizeSearch } from '@/lib/utils'

function matchesSearch(d: PseDocument, query: string) {
  const q = normalizeSearch(query.trim())
  if (!q) return true
  const haystack = normalizeSearch(
    [d.client_first_name, d.client_last_name, d.number, d.phone ?? '', d.address ?? ''].join(' '),
  )
  return haystack.includes(q)
}

type DevisFilter = 'toutes' | 'ouverts' | 'fermes'
type FactureFilter = 'toutes' | 'non_payees' | 'payees'

function matchesDevisFilter(d: PseDocument, filter: DevisFilter) {
  if (filter === 'toutes') return true
  if (filter === 'fermes') return d.status === 'expire'
  return d.status !== 'expire'
}

function matchesFactureFilter(d: PseDocument, filter: FactureFilter) {
  if (filter === 'toutes') return true
  return filter === 'payees' ? d.status === 'payee' : d.status === 'emise'
}

// Devis et Factures sont deux destinations séparées de la navigation
// (comme les onglets "Estimates"/"Invoices" des apps de facturation), pas
// une seule page avec un bouton de bascule — ce composant sert les deux,
// avec un `kind` fixe passé par la route plutôt qu'un état interne.
export function Documents({ kind }: { kind: DocumentKind }) {
  const { session } = useAuth()
  const [docs, setDocs] = React.useState<PseDocument[] | null>(null)
  const [reports, setReports] = React.useState<InterventionReportListItem[]>([])
  const [error, setError] = React.useState<string | null>(null)
  const [filter, setFilter] = React.useState<DevisFilter | FactureFilter>('toutes')
  const [searchOpen, setSearchOpen] = React.useState(false)
  const [search, setSearch] = React.useState('')

  const isAdmin = session?.role === 'admin'

  const removeDoc = async (docToDelete: PseDocument) => {
    if (!session) return
    const label = docToDelete.kind === 'devis' ? 'ce devis' : 'cette facture'
    const msg = isAdmin
      ? `Supprimer ${label} ${docToDelete.number} ?`
      : `Demander la suppression ${docToDelete.kind === 'devis' ? 'de ce devis' : 'de cette facture'} ${docToDelete.number} ? Elle restera visible (en attente) jusqu'à confirmation par un admin.`
    if (!confirm(msg)) return
    try {
      const updated = await deleteDocument(session.sessionId, docToDelete.id)
      setDocs((list) => list?.map((d) => (d.id === docToDelete.id ? updated : d)).filter((d) => !d.deleted_at) ?? list)
    } catch (e) {
      setError(friendlyError(e, 'Erreur lors de la suppression.'))
    }
  }

  const cancelRequest = async (doc: PseDocument) => {
    if (!session) return
    try {
      const updated = await cancelDeletionRequest(session.sessionId, doc.id)
      setDocs((list) => list?.map((d) => (d.id === doc.id ? updated : d)) ?? list)
    } catch (e) {
      setError(friendlyError(e, 'Erreur.'))
    }
  }

  const confirmDelete = async (doc: PseDocument) => {
    if (!session) return
    if (!confirm(`Confirmer la suppression définitive de ${doc.number} ?`)) return
    try {
      await confirmDeletion(session.sessionId, doc.id)
      setDocs((list) => list?.filter((d) => d.id !== doc.id) ?? list)
    } catch (e) {
      setError(friendlyError(e, 'Erreur.'))
    }
  }

  const load = React.useCallback(async () => {
    if (!session) return
    try {
      setDocs(await listDocuments(session.sessionId, kind))
      // Les rapports d'intervention n'ont pas leur propre onglet — ils
      // s'affichent mélangés à la liste des factures (teinte bleue
      // distincte, voir ReportRow), jamais dans celle des devis.
      setReports(kind === 'facture' ? await listReports(session.sessionId) : [])
    } catch (e) {
      setError(friendlyError(e, 'Erreur de chargement.'))
    }
  }, [session, kind])

  React.useEffect(() => {
    setDocs(null)
    setReports([])
    setFilter('toutes')
    setSearch('')
    setSearchOpen(false)
    load()
  }, [load])

  // Actualisation en tâche de fond dès qu'un autre appareil (admin ↔
  // technicien) modifie un devis/facture — poussé par le serveur en temps
  // réel (SSE), pas un sondage périodique. Ne touche pas au filtre/à la
  // recherche en cours ni n'affiche de flash "Chargement…".
  const silentRefresh = React.useCallback(() => {
    if (!session) return
    listDocuments(session.sessionId, kind)
      .then(setDocs)
      .catch(() => {})
  }, [session, kind])
  useLiveEvents(['documents_changed'], silentRefresh)

  const filtered = React.useMemo(() => {
    if (!docs) return null
    return docs.filter(
      (d) =>
        (kind === 'devis' ? matchesDevisFilter(d, filter as DevisFilter) : matchesFactureFilter(d, filter as FactureFilter)) &&
        matchesSearch(d, search),
    )
  }, [docs, filter, kind, search])

  // Un rapport n'a pas de statut payé/non payé — il ne correspond à aucun
  // des deux filtres facture, donc ne s'affiche que sur "Toutes" (jamais
  // exclu silencieusement, juste hors-sujet pour ces deux-là).
  const filteredReports = React.useMemo(() => {
    if (filter !== 'toutes') return []
    const q = normalizeSearch(search.trim())
    if (!q) return reports
    return reports.filter((r) =>
      normalizeSearch([r.i_client_first_name, r.i_client_last_name, r.i_reference].join(' ')).includes(q),
    )
  }, [reports, filter, search])

  type Entry = { type: 'facture'; doc: PseDocument; date: string } | { type: 'rapport'; report: InterventionReportListItem; date: string }

  // Regroupées par année (la plus récente en premier), avec le total TTC de
  // chaque groupe affiché dans son en-tête — comme un relevé comptable. Les
  // rapports (kind === 'facture' uniquement) sont mélangés dans les mêmes
  // groupes, triés avec le reste, mais jamais comptés dans le total (aucun
  // montant associé).
  const groups = React.useMemo(() => {
    if (!filtered) return []
    const entries: Entry[] = [
      ...filtered.map((doc): Entry => ({ type: 'facture', doc, date: doc.issue_date })),
      ...filteredReports.map((report): Entry => ({ type: 'rapport', report, date: report.created_at })),
    ]
    const byYear = new Map<string, Entry[]>()
    for (const e of entries) {
      const year = e.date.slice(0, 4)
      if (!byYear.has(year)) byYear.set(year, [])
      byYear.get(year)!.push(e)
    }
    return Array.from(byYear.entries())
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([year, items]) => ({
        year,
        items: items.sort((a, b) => b.date.localeCompare(a.date)),
        total: items.reduce(
          (sum, e) => sum + (e.type === 'facture' ? totalTTC(e.doc.items, e.doc.vat_rate, e.doc.discount_type, e.doc.discount_value) : 0),
          0,
        ),
      }))
  }, [filtered, filteredReports])

  let rowIndex = 0

  return (
    <Page
      title=""
      toolbar={
        <>
          <div className="flex-1">
            <SegmentedControl
              value={filter}
              onChange={(v) => setFilter(v as DevisFilter | FactureFilter)}
              options={
                kind === 'devis'
                  ? [
                      { value: 'toutes', label: 'Toutes' },
                      {
                        value: 'ouverts',
                        label: 'Ouverts',
                        activeBg: 'bg-primary/12',
                        activeText: 'text-primary',
                      },
                      {
                        value: 'fermes',
                        label: 'Fermés',
                        activeBg: 'bg-slate-500/12',
                        activeText: 'text-slate-600 dark:text-slate-300',
                      },
                    ]
                  : [
                      { value: 'toutes', label: 'Toutes' },
                      {
                        value: 'non_payees',
                        label: 'Non payées',
                        activeBg: 'bg-amber-500/12',
                        activeText: 'text-amber-600 dark:text-amber-400',
                      },
                      {
                        value: 'payees',
                        label: 'Payées',
                        activeBg: 'bg-success/12',
                        activeText: 'text-success',
                      },
                    ]
              }
            />
          </div>
          <Button
            variant="outline"
            size="icon"
            className="shrink-0"
            onClick={() => setSearchOpen((o) => !o)}
            aria-label="Rechercher"
          >
            {searchOpen ? <X className="size-4" /> : <Search className="size-4" />}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {searchOpen && (
          <Input
            autoFocus
            placeholder="Nom, téléphone, adresse, numéro…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}
        {docs === null && !error && <p className="py-8 text-center text-sm text-muted-foreground">Chargement…</p>}
        {filtered !== null && filtered.length === 0 && <EmptyState label="Aucun document" />}

        <SwipeToDeleteGroup>
          <div className="flex flex-col gap-1">
            {groups.map((group) => (
              <div key={group.year} className="flex flex-col">
                <div className="flex items-center justify-between rounded-lg bg-secondary/60 px-3 py-1.5 text-sm text-muted-foreground">
                  <span>{group.year}</span>
                  <span>{group.total.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €</span>
                </div>
                <div className="flex flex-col">
                  {group.items.map((entry) =>
                    entry.type === 'rapport' ? (
                      <ReportRow key={entry.report.id} report={entry.report} alt={rowIndex++ % 2 === 1} />
                    ) : (
                      <DocumentRow
                        key={entry.doc.id}
                        doc={entry.doc}
                        alt={rowIndex++ % 2 === 1}
                        isAdmin={isAdmin}
                        onDelete={() => removeDoc(entry.doc)}
                        onCancelRequest={() => cancelRequest(entry.doc)}
                        onConfirmDelete={() => confirmDelete(entry.doc)}
                      />
                    ),
                  )}
                </div>
              </div>
            ))}
          </div>
        </SwipeToDeleteGroup>
      </div>
    </Page>
  )
}

function DocumentRow({
  doc: d,
  alt,
  isAdmin,
  onDelete,
  onCancelRequest,
  onConfirmDelete,
}: {
  doc: PseDocument
  alt: boolean
  isAdmin: boolean
  onDelete: () => void
  onCancelRequest: () => void
  onConfirmDelete: () => void
}) {
  const client = [d.client_first_name, d.client_last_name].filter(Boolean).join(' ')
  const ttc = totalTTC(d.items, d.vat_rate, d.discount_type, d.discount_value)

  // Suppression demandée par un technicien, pas encore confirmée par un
  // admin — reste visible mais grisée, pas de navigation ni de balayage
  // possible tant qu'elle est dans cet état.
  if (d.deletion_requested_at) {
    return (
      <div
        className={`flex items-center justify-between gap-3 border-b border-border/60 px-3 py-3 opacity-50 last:border-b-0 ${alt ? 'bg-secondary/70' : 'bg-background'}`}
      >
        <div className="min-w-0">
          <p className="truncate font-medium line-through">{client || 'Client sans nom'}</p>
          <p className="text-xs text-muted-foreground">{d.number} · Suppression en attente</p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {isAdmin && (
            <Button variant="ghost" size="sm" className="text-destructive" onClick={onConfirmDelete}>
              Confirmer
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={onCancelRequest}>
            Récupérer
          </Button>
        </div>
      </div>
    )
  }

  let statusLine: { text: string; tone: 'success' | 'muted' } | null = null
  if (d.kind === 'devis') {
    if (d.status === 'signe' && d.signed_at) {
      statusLine = { text: `Signé ${new Date(d.signed_at).toLocaleDateString('fr-FR')}`, tone: 'success' }
    } else if (d.status === 'expire') {
      statusLine = { text: 'Expiré', tone: 'muted' }
    }
  } else {
    if (d.status === 'payee' && d.paid_at) {
      statusLine = { text: `Payé le ${new Date(d.paid_at).toLocaleDateString('fr-FR')}`, tone: 'success' }
    } else if (d.due_date) {
      statusLine = { text: `Échéance le ${new Date(d.due_date).toLocaleDateString('fr-FR')}`, tone: 'muted' }
    }
  }

  return (
    <SwipeToDelete id={d.id} onDelete={onDelete} className="rounded-none">
      <Link
        to={`/${d.kind === 'devis' ? 'devis' : 'factures'}/${d.id}/modifier`}
        className={`liquid flex items-center justify-between gap-3 border-b border-border/60 px-3 py-3 last:border-b-0 ${alt ? 'bg-secondary/70' : 'bg-background'}`}
      >
        <div className="min-w-0">
          <p className="truncate font-medium">{client || 'Client sans nom'}</p>
          <p className="text-xs text-muted-foreground">{d.number}</p>
        </div>
        <div className="shrink-0 text-right">
          <p className="font-medium">{ttc.toFixed(2)} €</p>
          {statusLine && (
            <p className={`text-xs ${statusLine.tone === 'success' ? 'text-success' : 'text-muted-foreground'}`}>
              {statusLine.text}
            </p>
          )}
        </div>
      </Link>
    </SwipeToDelete>
  )
}

// Rangée distincte pour un rapport d'intervention, mélangé à la liste des
// factures — fond bleu translucide façon "verre" (même famille que .glass,
// juste une teinte primaire en plus) pour qu'on le distingue d'un coup
// d'œil d'une vraie facture, pas de montant ni de statut payé à afficher.
// Cliquer régénère directement le PDF (pas de fiche à ouvrir/éditer).
function ReportRow({ report, alt }: { report: InterventionReportListItem; alt: boolean }) {
  const { session } = useAuth()
  const client = [report.i_client_first_name, report.i_client_last_name].filter(Boolean).join(' ')
  const eventDate = report.i_completed_at ?? report.i_started_at ?? report.i_created_at

  const download = () => {
    if (!session) return
    const technicienName = [session.firstName, session.lastName].filter(Boolean).join(' ') || 'Technicien'
    downloadReportPdf(
      technicienName,
      {
        reference: report.i_reference,
        clientFirstName: report.i_client_first_name,
        clientLastName: report.i_client_last_name,
        address: report.i_address,
        interventionType: report.i_intervention_type,
        description: report.i_description,
        eventDate,
      },
      report.notes,
    ).catch(() => {})
  }

  return (
    <button
      type="button"
      onClick={download}
      className={`liquid flex w-full items-center justify-between gap-3 border-b border-border/60 bg-primary/8 px-3 py-3 text-left backdrop-blur-sm last:border-b-0 ${alt ? 'bg-primary/12' : ''}`}
    >
      <div className="flex min-w-0 items-center gap-2.5">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
          <ClipboardList className="size-4" />
        </span>
        <div className="min-w-0">
          <p className="truncate font-medium">{client || 'Client sans nom'}</p>
          <p className="text-xs text-muted-foreground">{report.i_reference} · Rapport d'intervention</p>
        </div>
      </div>
      <div className="shrink-0 text-right">
        <p className="text-xs text-primary">{new Date(eventDate).toLocaleDateString('fr-FR')}</p>
      </div>
    </button>
  )
}

export function DevisList() {
  return <Documents kind="devis" />
}

export function FacturesList() {
  return <Documents kind="facture" />
}
