import { Search, X } from 'lucide-react'
import * as React from 'react'
import { Link } from 'react-router-dom'

import { SwipeToDelete, SwipeToDeleteGroup } from '@/components/SwipeToDelete'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { EmptyState } from '@/components/layout/EmptyState'
import { Loader } from '@/components/Loader'
import { Page } from '@/components/layout/Page'
import { useAuth } from '@/lib/auth'
import { useLiveEvents } from '@/hooks/useLiveEvents'
import { friendlyError } from '@/lib/errors'
import {
  deleteIntervention,
  listInterventions,
  type Intervention,
  type InterventionStage,
} from '@/lib/interventions'
import { WorkOrderCard } from '@/components/WorkOrderCard'
import { normalizeSearch } from '@/lib/utils'

function matchesSearch(i: Intervention, query: string) {
  const q = normalizeSearch(query.trim())
  if (!q) return true
  const haystack = normalizeSearch(
    [
      i.client_first_name,
      i.client_last_name,
      i.reference,
      i.phone ?? '',
      i.address ?? '',
      i.intervention_type,
    ].join(' '),
  )
  return haystack.includes(q)
}



export default function Interventions() {
  const { session } = useAuth()
  const isAdmin = session?.role === 'admin'

  const [interventions, setInterventions] = React.useState<Intervention[] | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [searchOpen, setSearchOpen] = React.useState(false)
  const [search, setSearch] = React.useState('')

  React.useEffect(() => {
    if (!session) return
    let cancelled = false

    async function load() {
      try {
        const list = await listInterventions(session!.sessionId)
        if (!cancelled) setInterventions(list)
      } catch (e) {
        if (!cancelled) setError(friendlyError(e, 'Erreur de chargement.'))
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [session, isAdmin])

  // Actualisation en tâche de fond dès qu'un autre appareil (admin ↔
  // technicien) modifie une fiche — poussé par le serveur en temps réel
  // (SSE), pas un sondage périodique. Pas de flash "Chargement…".
  const silentRefresh = React.useCallback(() => {
    if (!session) return
    listInterventions(session.sessionId)
      .then(setInterventions)
      .catch(() => {})
  }, [session, isAdmin])
  useLiveEvents(['interventions_changed', 'documents_changed'], silentRefresh)

  const removeIntervention = async (i: Intervention) => {
    if (!session) return
    if (!confirm(`Supprimer définitivement la fiche ${i.reference} ?`)) return
    try {
      await deleteIntervention(session.sessionId, i.id)
      setInterventions((list) => list?.filter((it) => it.id !== i.id) ?? list)
    } catch (e) {
      setError(friendlyError(e, 'Erreur lors de la suppression.'))
    }
  }

  // Onglets : classement calculé par le serveur (voir withStages côté serveur).
  const [tab, setTab] = React.useState<'toutes' | InterventionStage>(() => {
    try {
      return (localStorage.getItem('pse_fiches_tab') as 'toutes' | InterventionStage) || 'toutes'
    } catch {
      return 'toutes'
    }
  })
  const chooseTab = (t: 'toutes' | InterventionStage) => {
    setTab(t)
    try {
      localStorage.setItem('pse_fiches_tab', t)
    } catch {
      // stockage indisponible : pas grave
    }
  }
  const searched = interventions?.filter((i) => matchesSearch(i, search)) ?? []
  const count = (t: InterventionStage) => searched.filter((i) => i.stage === t).length
  const filtered = tab === 'toutes' ? searched : searched.filter((i) => i.stage === tab)
  const TABS: Array<{ value: 'toutes' | InterventionStage; label: string }> = [
    { value: 'toutes', label: `Toutes (${searched.length})` },
    { value: 'a_envoyer', label: `À envoyer (${count('a_envoyer')})` },
    { value: 'envoyee', label: `Envoyées (${count('envoyee')})` },
    { value: 'en_cours', label: `En cours (${count('en_cours')})` },
    { value: 'terminee', label: `Terminées (${count('terminee')})` },
  ]

  return (
    <Page title="Fiches d'intervention">
      <div className="flex flex-col gap-4">
        {isAdmin && (
          <Button asChild size="lg">
            <Link to="/interventions/nouvelle">+ Nouvelle intervention</Link>
          </Button>
        )}

        <div className="flex items-center gap-2">
          {/* Onglets en pastilles qui défilent, avec le nombre de fiches. */}
          <div className="-mx-1 flex min-w-0 flex-1 gap-2 overflow-x-auto px-1 py-0.5">
            {TABS.map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() => chooseTab(t.value)}
                className={`h-9 shrink-0 rounded-full px-3.5 text-sm font-semibold whitespace-nowrap transition-colors ${
                  tab === t.value ? 'bg-foreground text-background' : 'bg-secondary text-secondary-foreground'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setSearchOpen((o) => !o)}
            aria-label="Rechercher"
            className="liquid flex size-9 shrink-0 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors duration-200"
          >
            {searchOpen ? <X className="size-4" /> : <Search className="size-4" />}
          </button>
        </div>

        {searchOpen && (
          <Input
            autoFocus
            placeholder="Nom, téléphone, adresse, référence…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}

        {interventions === null && !error && (
          <Loader className="py-8" />
        )}

        {interventions !== null && filtered.length === 0 && (
          <EmptyState
            label={
              tab === 'a_envoyer'
                ? 'Aucune fiche à envoyer'
                : tab === 'envoyee'
                  ? 'Aucune fiche envoyée en attente'
                  : tab === 'en_cours'
                    ? 'Aucune fiche en cours'
                    : tab === 'terminee'
                      ? 'Aucune fiche terminée'
                      : 'Aucune intervention'
            }
          />
        )}

        <SwipeToDeleteGroup>
          <div className="flex flex-col gap-2.5">
            {filtered.map((i) => {
              return (
                <SwipeToDelete key={i.id} id={i.id} onDelete={() => removeIntervention(i)} disabled={!isAdmin}>
                  <WorkOrderCard intervention={i} />
                </SwipeToDelete>
              )
            })}
          </div>
        </SwipeToDeleteGroup>
      </div>
    </Page>
  )
}
