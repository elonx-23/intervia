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
  listTechnicians,
  type Intervention,
  type Technician,
} from '@/lib/interventions'
import { ficheText } from '@/lib/whatsapp'
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
  const [technicians, setTechnicians] = React.useState<Technician[]>([])
  const [error, setError] = React.useState<string | null>(null)
  const [copiedId, setCopiedId] = React.useState<string | null>(null)
  const [searchOpen, setSearchOpen] = React.useState(false)
  const [search, setSearch] = React.useState('')

  React.useEffect(() => {
    if (!session) return
    let cancelled = false

    async function load() {
      try {
        const [list, techs] = await Promise.all([
          listInterventions(session!.sessionId),
          isAdmin ? listTechnicians(session!.sessionId) : Promise.resolve([]),
        ])
        if (!cancelled) {
          setInterventions(list)
          setTechnicians(techs)
        }
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
    Promise.all([
      listInterventions(session.sessionId),
      isAdmin ? listTechnicians(session.sessionId) : Promise.resolve([]),
    ])
      .then(([list, techs]) => {
        setInterventions(list)
        setTechnicians(techs)
      })
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

  const technicianName = React.useCallback(
    (id: string | null) => {
      if (!id) return null
      const t = technicians.find((t) => t.id === id)
      return t ? `${t.first_name} ${t.last_name}` : null
    },
    [technicians],
  )

  const filtered = interventions?.filter((i) => matchesSearch(i, search)) ?? []

  const copyWhatsApp = async (i: Intervention) => {
    try {
      await navigator.clipboard.writeText(ficheText(i))
      setCopiedId(i.id)
      setTimeout(() => setCopiedId((c) => (c === i.id ? null : c)), 1500)
    } catch {
      // clipboard indisponible (contexte non sécurisé, permissions…) — pas bloquant
    }
  }

  return (
    <Page title="Fiches d'intervention">
      <div className="flex flex-col gap-4">
        {isAdmin && (
          <Button asChild size="lg">
            <Link to="/interventions/nouvelle">+ Nouvelle intervention</Link>
          </Button>
        )}

        <div className="flex items-center justify-end">
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
          <EmptyState label="Aucune intervention" />
        )}

        <SwipeToDeleteGroup>
          <div className="flex flex-col gap-3">
            {filtered.map((i) => {
              const tech = technicianName(i.technicien_id)
              return (
                <SwipeToDelete key={i.id} id={i.id} onDelete={() => removeIntervention(i)} disabled={!isAdmin}>
                  <WorkOrderCard
                    intervention={i}
                    technician={tech || null}
                    showCopy={isAdmin}
                    copied={copiedId === i.id}
                    onCopy={() => copyWhatsApp(i)}
                  />
                </SwipeToDelete>
              )
            })}
          </div>
        </SwipeToDeleteGroup>
      </div>
    </Page>
  )
}
