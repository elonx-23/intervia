import { Loader2, Sparkles, TriangleAlert } from 'lucide-react'
import * as React from 'react'
import { useNavigate } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { CenteredDialogContent, Dialog, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { apiFetch } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { createDevis, type DocumentItem } from '@/lib/documents'
import { friendlyError } from '@/lib/errors'
import { ITEM_CATALOG } from '@/lib/itemPresets'

interface Draft {
  clientFirstName: string
  clientLastName: string
  phone: string
  email: string
  address: string
  postalCode: string
  city: string
  items: DocumentItem[]
  vatRate: number
  notes: string
  totals: { ht: number; ttc: number }
  warnings: string[]
}

const euros = (n: number) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(n)

// « Génération automatique » (admin) : on colle le message d'un technicien,
// l'IA prépare le devis (intitulés propres, montants exacts, TVA déduite des
// totaux), on relit l'aperçu, puis le devis est créé et s'ouvre, prêt à envoyer.
export function AiDevisDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { session } = useAuth()
  const navigate = useNavigate()
  const [text, setText] = React.useState('')
  const [draft, setDraft] = React.useState<Draft | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!open) return
    setDraft(null)
    setError(null)
  }, [open])

  const generate = async () => {
    if (!session) return
    setBusy(true)
    setError(null)
    try {
      setDraft(await apiFetch<Draft>('/api/documents/ai-draft', { method: 'POST', sessionId: session.sessionId, body: { text, catalog: ITEM_CATALOG.map(({ label, description }) => ({ label, description })) } }))
    } catch (e) {
      setError(friendlyError(e, 'La génération a échoué.'))
    } finally {
      setBusy(false)
    }
  }

  const create = async () => {
    if (!session || !draft) return
    setBusy(true)
    setError(null)
    try {
      const created = await createDevis(session.sessionId, {
        interventionId: null,
        clientFirstName: draft.clientFirstName,
        clientLastName: draft.clientLastName,
        phone: draft.phone,
        address: draft.address,
        postalCode: draft.postalCode,
        city: draft.city,
        email: draft.email,
        items: draft.items,
        vatRate: draft.vatRate,
        notes: draft.notes,
        validityDate: null,
        photosBefore: [],
      })
      onOpenChange(false)
      setText('')
      navigate(`/devis/${created.id}/modifier`)
    } catch (e) {
      setError(friendlyError(e, 'Impossible de créer le devis.'))
    } finally {
      setBusy(false)
    }
  }

  const client = draft ? [draft.clientFirstName, draft.clientLastName].filter(Boolean).join(' ') : ''

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <CenteredDialogContent className="flex max-h-[90dvh] flex-col overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="size-5 text-primary" /> Génération automatique
          </DialogTitle>
          <DialogDescription>
            {draft ? 'Vérifie le devis, tu pourras encore tout modifier après.' : 'Colle le message du technicien : client, adresse, lignes avec prix, totaux.'}
          </DialogDescription>
        </DialogHeader>

        {!draft ? (
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={'Dupont Jean\nParis 6\n12 rue des Lilas 75006\n06 12 34 56 78\n\nDéplacement 39\nOuverture de porte 189\n…\n228 HT\n250,80 TTC'}
            className="min-h-56 text-sm"
          />
        ) : (
          <div className="flex flex-col gap-3 text-sm">
            <div className="rounded-xl bg-secondary/40 p-3">
              <p className="font-semibold">{client || 'Client sans nom'}</p>
              {(draft.address || draft.city) && (
                <p className="text-muted-foreground">{[draft.address, [draft.postalCode, draft.city].filter(Boolean).join(' ')].filter(Boolean).join(', ')}</p>
              )}
              {(draft.phone || draft.email) && <p className="text-muted-foreground">{[draft.phone, draft.email].filter(Boolean).join(' · ')}</p>}
            </div>
            <div className="flex flex-col gap-2">
              {draft.items.map((item, i) => (
                <div key={i} className="flex items-start justify-between gap-3 border-b border-border/50 pb-2 last:border-0">
                  <div className="min-w-0">
                    <p className="font-medium">{item.label}</p>
                    {item.description && <p className="text-xs text-muted-foreground">{item.description}</p>}
                  </div>
                  <span className="shrink-0 tabular-nums">{euros(item.quantity * item.unitPrice)}</span>
                </div>
              ))}
            </div>
            <div className="flex flex-col items-end gap-0.5 border-t border-border/70 pt-2">
              <span>Total HT : {euros(draft.totals.ht)}</span>
              <span className="text-muted-foreground">TVA {String(draft.vatRate).replace('.', ',')} %</span>
              <span className="font-semibold">Total TTC : {euros(draft.totals.ttc)}</span>
            </div>
            {draft.warnings.map((w) => (
              <p key={w} className="flex items-start gap-2 rounded-xl bg-warning/10 p-2.5 text-xs">
                <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" /> {w}
              </p>
            ))}
          </div>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}

        <DialogFooter>
          {draft ? (
            <>
              <Button variant="outline" onClick={() => setDraft(null)} disabled={busy}>
                Modifier le message
              </Button>
              <Button onClick={create} disabled={busy}>
                {busy ? <Loader2 className="size-4 animate-spin" /> : 'Créer le devis'}
              </Button>
            </>
          ) : (
            <Button onClick={generate} disabled={busy || text.trim().length < 10}>
              {busy ? (
                <>
                  <Loader2 className="size-4 animate-spin" /> Génération…
                </>
              ) : (
                <>
                  <Sparkles className="size-4" /> Générer le devis
                </>
              )}
            </Button>
          )}
        </DialogFooter>
      </CenteredDialogContent>
    </Dialog>
  )
}
