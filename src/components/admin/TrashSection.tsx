import { RotateCcw, Trash2 } from 'lucide-react'
import * as React from 'react'

import { CollapsibleRow } from '@/components/CollapsibleRow'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { useAuth } from '@/lib/auth'
import { useLiveEvents } from '@/hooks/useLiveEvents'
import {
  listTrash,
  permanentlyDeleteDocument,
  purgeAllTrash,
  restoreAllTrash,
  restoreDocument,
  totalTTC,
  type PseDocument,
} from '@/lib/documents'
import { friendlyError } from '@/lib/errors'

type TrashFilter = 'toutes' | 'devis' | 'facture'

// Corbeille des devis/factures supprimés — admin uniquement, pour repérer un
// geste malheureux (glisser-supprimer) et récupérer ou effacer pour de bon.
export function TrashSection() {
  const { session } = useAuth()
  const [open, setOpen] = React.useState(false)
  const [trash, setTrash] = React.useState<PseDocument[] | null>(null)
  const [filter, setFilter] = React.useState<TrashFilter>('toutes')
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const load = React.useCallback(() => {
    if (!session) return
    listTrash(session.sessionId)
      .then(setTrash)
      .catch((e) => setError(friendlyError(e, 'Erreur de chargement de la corbeille.')))
  }, [session])

  React.useEffect(() => {
    load()
  }, [load])

  useLiveEvents(['documents_changed'], load)

  const filtered = (trash ?? []).filter((d) => filter === 'toutes' || d.kind === filter)

  const restore = async (id: string) => {
    if (!session) return
    setBusy(true)
    try {
      await restoreDocument(session.sessionId, id)
      setTrash((list) => list?.filter((d) => d.id !== id) ?? list)
    } catch (e) {
      setError(friendlyError(e, 'Erreur.'))
    } finally {
      setBusy(false)
    }
  }

  const purgeOne = async (doc: PseDocument) => {
    if (!session) return
    if (!confirm(`Supprimer définitivement ${doc.kind === 'devis' ? 'ce devis' : 'cette facture'} ${doc.number} ? Cette action est irréversible.`)) {
      return
    }
    setBusy(true)
    try {
      await permanentlyDeleteDocument(session.sessionId, doc.id)
      setTrash((list) => list?.filter((d) => d.id !== doc.id) ?? list)
    } catch (e) {
      setError(friendlyError(e, 'Erreur.'))
    } finally {
      setBusy(false)
    }
  }

  const restoreAll = async () => {
    if (!session || !trash?.length) return
    setBusy(true)
    try {
      await restoreAllTrash(session.sessionId)
      setTrash([])
    } catch (e) {
      setError(friendlyError(e, 'Erreur.'))
    } finally {
      setBusy(false)
    }
  }

  const purgeAll = async () => {
    if (!session || !trash?.length) return
    if (!confirm(`Supprimer définitivement les ${trash.length} document(s) de la corbeille ? Cette action est irréversible.`)) {
      return
    }
    setBusy(true)
    try {
      await purgeAllTrash(session.sessionId)
      setTrash([])
    } catch (e) {
      setError(friendlyError(e, 'Erreur.'))
    } finally {
      setBusy(false)
    }
  }

  if (trash !== null && trash.length === 0) return null

  return (
    <Card>
      <CardContent>
        <CollapsibleRow
          icon={Trash2}
          open={open}
          onToggle={() => setOpen((o) => !o)}
          label={
            <span className="text-muted-foreground">
              Corbeille {trash && trash.length > 0 && <span className="font-medium text-foreground">({trash.length})</span>}
            </span>
          }
        >
          {error && <p className="text-sm text-destructive">{error}</p>}

          <SegmentedControl
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'toutes', label: 'Tout' },
              { value: 'devis', label: 'Devis' },
              { value: 'facture', label: 'Factures' },
            ]}
          />

          <div className="flex flex-col gap-2">
            {filtered.map((d) => (
              <div key={d.id} className="flex items-center justify-between gap-2 rounded-xl border border-border/70 bg-secondary/40 p-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {d.kind === 'devis' ? 'Devis' : 'Facture'} {d.number}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {[d.client_first_name, d.client_last_name].filter(Boolean).join(' ') || 'Client sans nom'} ·{' '}
                    {totalTTC(d.items, d.vat_rate, d.discount_type, d.discount_value).toFixed(2)} €
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button variant="ghost" size="icon" className="size-8" disabled={busy} onClick={() => restore(d.id)} aria-label="Restaurer">
                    <RotateCcw className="size-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8 text-destructive"
                    disabled={busy}
                    onClick={() => purgeOne(d)}
                    aria-label="Supprimer définitivement"
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </div>
            ))}
            {filtered.length === 0 && (
              <p className="py-2 text-center text-xs text-muted-foreground">Rien ici.</p>
            )}
          </div>

          {trash && trash.length > 0 && (
            <div className="flex flex-col gap-2">
              <Button variant="outline" size="sm" disabled={busy} onClick={restoreAll}>
                Tout restaurer
              </Button>
              <Button variant="outline" size="sm" className="text-destructive" disabled={busy} onClick={purgeAll}>
                Tout supprimer définitivement
              </Button>
            </div>
          )}
        </CollapsibleRow>
      </CardContent>
    </Card>
  )
}
