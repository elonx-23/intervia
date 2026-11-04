import { Check, Copy, MapPin, Search, X } from 'lucide-react'
import * as React from 'react'
import { Link } from 'react-router-dom'

import { SwipeToDelete, SwipeToDeleteGroup } from '@/components/SwipeToDelete'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
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
  STATUS_LABELS,
  type Intervention,
  type Technician,
} from '@/lib/interventions'
import { ficheText } from '@/lib/whatsapp'
import { INTERVENTION_TONE, TONE_EDGE, TONE_ICON, friendlyDate } from '@/lib/tones'
import { TradeIcon } from '@/components/TradeIcon'
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
              const client = [i.client_first_name, i.client_last_name].filter(Boolean).join(' ')
              const tech = technicianName(i.technicien_id)
              return (
                <SwipeToDelete key={i.id} id={i.id} onDelete={() => removeIntervention(i)} disabled={!isAdmin}>
                  <Card className={`relative overflow-hidden py-4 before:absolute before:inset-y-0 before:left-0 before:w-1 ${TONE_EDGE[INTERVENTION_TONE[i.status]]}`}>
                    <CardContent className="flex flex-col gap-2.5 pl-5">
                      <Link to={`/interventions/${i.id}`} className="flex min-w-0 flex-col gap-2.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-medium text-muted-foreground">
                            {i.reference} · {friendlyDate(i.created_at)}
                          </span>
                          <Badge variant={INTERVENTION_TONE[i.status]}>{STATUS_LABELS[i.status]}</Badge>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${TONE_ICON[INTERVENTION_TONE[i.status]]}`}>
                            <TradeIcon trade={i.intervention_type} className="size-5" />
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[15px] font-semibold">{client || 'Client sans nom'}</p>
                            <p className="truncate text-sm text-muted-foreground">
                              {[i.intervention_type || 'Type non précisé', i.city].filter(Boolean).join(' · ')}
                            </p>
                          </div>
                          {i.amount != null && (
                            <span className="shrink-0 text-[15px] font-bold">{String(i.amount).replace('.', ',')} €</span>
                          )}
                        </div>
                        {i.address && (
                          <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                            <MapPin className="size-3.5 shrink-0" />
                            <span className="truncate">{i.address}</span>
                          </p>
                        )}
                      </Link>
                      <div className="flex items-center justify-between gap-2 border-t border-border/70 pt-2.5 text-sm">
                        <span className={tech ? 'flex min-w-0 items-center gap-2' : 'font-medium text-tone-amber-ink'}>
                          {tech ? (
                            <>
                              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-secondary text-[10px] font-bold">
                                {tech
                                  .split(' ')
                                  .map((w) => w[0])
                                  .join('')
                                  .slice(0, 2)
                                  .toUpperCase()}
                              </span>
                              <span className="truncate">{tech}</span>
                            </>
                          ) : (
                            'Non assignée'
                          )}
                        </span>
                        {isAdmin && (
                          <Button variant="ghost" size="sm" className="h-8 shrink-0 text-muted-foreground" onClick={() => copyWhatsApp(i)}>
                            {copiedId === i.id ? <Check className="size-4" /> : <Copy className="size-4" />}
                            {copiedId === i.id ? 'Copié' : 'Copier'}
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </SwipeToDelete>
              )
            })}
          </div>
        </SwipeToDeleteGroup>
      </div>
    </Page>
  )
}
