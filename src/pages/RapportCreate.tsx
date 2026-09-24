import { Search } from 'lucide-react'
import * as React from 'react'
import { useNavigate } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { EmptyState } from '@/components/layout/EmptyState'
import { Page } from '@/components/layout/Page'
import { useAuth } from '@/lib/auth'
import { friendlyError } from '@/lib/errors'
import { listInterventions, type Intervention } from '@/lib/interventions'
import { createReport } from '@/lib/reports'
import { downloadReportPdf } from '@/lib/pdf'
import { normalizeSearch } from '@/lib/utils'

function matches(i: Intervention, q: string) {
  if (!q) return true
  const haystack = normalizeSearch(
    [i.client_first_name, i.client_last_name, i.reference, i.intervention_type, i.address ?? ''].join(' '),
  )
  return haystack.includes(normalizeSearch(q))
}

export default function RapportCreate() {
  const { session } = useAuth()
  const navigate = useNavigate()
  const [interventions, setInterventions] = React.useState<Intervention[] | null>(null)
  const [selected, setSelected] = React.useState<Intervention | null>(null)
  const [query, setQuery] = React.useState('')
  const [notes, setNotes] = React.useState('')
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!session) return
    listInterventions(session.sessionId)
      .then(setInterventions)
      .catch((e) => setError(friendlyError(e, 'Erreur de chargement.')))
  }, [session])

  const filtered = React.useMemo(() => interventions?.filter((i) => matches(i, query)) ?? [], [interventions, query])

  const eventDate = selected ? (selected.completed_at ?? selected.started_at ?? selected.created_at) : null

  const generate = async () => {
    if (!session || !selected) return
    setSaving(true)
    setError(null)
    try {
      await createReport(session.sessionId, selected.id, notes)
      const technicienName = [session.firstName, session.lastName].filter(Boolean).join(' ') || 'Technicien'
      await downloadReportPdf(
        technicienName,
        {
          reference: selected.reference,
          clientFirstName: selected.client_first_name,
          clientLastName: selected.client_last_name,
          address: selected.address,
          interventionType: selected.intervention_type,
          description: selected.description,
          eventDate: eventDate!,
        },
        notes,
      )
      navigate(-1)
    } catch (e) {
      setError(friendlyError(e, 'Erreur.'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Page title="Rapport d'intervention">
      <div className="flex flex-col gap-4">
        {error && <p className="text-sm text-destructive">{error}</p>}

        {!selected ? (
          <>
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                autoFocus
                placeholder="Rechercher une fiche (client, référence, type…)"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            {interventions === null && !error && (
              <p className="py-8 text-center text-sm text-muted-foreground">Chargement…</p>
            )}
            {interventions !== null && filtered.length === 0 && <EmptyState label="Aucune fiche trouvée" />}
            <div className="flex flex-col gap-2">
              {filtered.map((i) => (
                <button key={i.id} type="button" onClick={() => setSelected(i)} className="text-left">
                  <Card className="liquid py-3">
                    <CardContent className="flex flex-col gap-0.5 px-4">
                      <span className="text-sm font-medium">
                        {[i.client_first_name, i.client_last_name].filter(Boolean).join(' ') || 'Client'}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {i.reference} · {i.intervention_type || 'Type non précisé'}
                      </span>
                    </CardContent>
                  </Card>
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            <Card>
              <CardContent className="flex flex-col gap-1 px-4">
                <p className="text-sm font-semibold">
                  {[selected.client_first_name, selected.client_last_name].filter(Boolean).join(' ') || 'Client'}
                </p>
                <p className="text-xs text-muted-foreground">
                  {selected.reference} · {selected.intervention_type || 'Type non précisé'}
                </p>
                {eventDate && (
                  <p className="text-xs text-muted-foreground">
                    {new Date(eventDate).toLocaleDateString('fr-FR')} à{' '}
                    {new Date(eventDate).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                  </p>
                )}
                {selected.description && <p className="mt-1 text-sm">{selected.description}</p>}
                <Button variant="ghost" size="sm" className="mt-1 w-fit px-0" onClick={() => setSelected(null)}>
                  Changer de fiche
                </Button>
              </CardContent>
            </Card>

            <div className="flex flex-col gap-2">
              <Label>Compte-rendu</Label>
              <Textarea
                autoFocus
                rows={8}
                placeholder="Détaille ici le travail effectué, les observations…"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>

            <Button size="lg" onClick={generate} disabled={saving}>
              {saving ? 'Génération…' : 'Générer le rapport'}
            </Button>
          </>
        )}
      </div>
    </Page>
  )
}
