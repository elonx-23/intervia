import { Check, MessageCircle, Plus, Send, Trash2, UserCheck } from 'lucide-react'
import * as React from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { CenteredDialogContent, Dialog, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { useAuth } from '@/lib/auth'
import { friendlyError } from '@/lib/errors'
import type { Intervention } from '@/lib/interventions'
import {
  CATEGORY_LABEL,
  addContact,
  deleteContact,
  getShares,
  listContacts,
  recordShares,
  setTakenBy,
  shortCode,
  whatsappLink,
  type InterventionShare,
  type ShareCategory,
  type TakenBy,
  type WhatsAppContact,
} from '@/lib/whatsapp'

// ---------- Fenêtre d'envoi ----------

// Deux onglets (25 % / 50/50) : on coche les contacts (ou tout le monde),
// puis l'app ouvre la conversation WhatsApp de chacun avec le code de la
// fiche prêt à partir (ex. « OP PARIS 6 ») — il reste à appuyer sur Envoyer.
function SendDialog({
  intervention,
  open,
  onOpenChange,
  onSent,
}: {
  intervention: Intervention
  open: boolean
  onOpenChange: (open: boolean) => void
  onSent: () => void
}) {
  const { session } = useAuth()
  const [category, setCategory] = React.useState<ShareCategory>('25')
  const [contacts, setContacts] = React.useState<WhatsAppContact[]>([])
  const [selected, setSelected] = React.useState<Set<string>>(new Set())
  const [message, setMessage] = React.useState('')
  const [newName, setNewName] = React.useState('')
  const [newPhone, setNewPhone] = React.useState('')
  const [error, setError] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [queue, setQueue] = React.useState<WhatsAppContact[] | null>(null)
  const [opened, setOpened] = React.useState<Set<string>>(new Set())

  React.useEffect(() => {
    if (!open || !session) return
    setQueue(null)
    setOpened(new Set())
    setSelected(new Set())
    setError(null)
    setMessage(shortCode(intervention))
    listContacts(session.sessionId)
      .then(setContacts)
      .catch((e) => setError(friendlyError(e, 'Erreur de chargement.')))
  }, [open, session, intervention])

  const inTab = contacts.filter((c) => c.category === category)
  const allSelected = inTab.length > 0 && inTab.every((c) => selected.has(c.id))
  const toggle = (id: string) =>
    setSelected((s) => {
      const next = new Set(s)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  const toggleAll = () =>
    setSelected((s) => {
      const next = new Set(s)
      for (const c of inTab) {
        if (allSelected) next.delete(c.id)
        else next.add(c.id)
      }
      return next
    })

  const add = async () => {
    if (!session) return
    setError(null)
    try {
      const c = await addContact(session.sessionId, {
        name: newName,
        phone: newPhone,
        category,
      })
      setContacts((list) => [...list, c].sort((a, b) => a.name.localeCompare(b.name)))
      setSelected((s) => new Set(s).add(c.id))
      setNewName('')
      setNewPhone('')
    } catch (e) {
      setError(friendlyError(e, "Impossible d'ajouter le contact."))
    }
  }

  const remove = async (id: string) => {
    if (!session) return
    await deleteContact(session.sessionId, id).catch(() => {})
    setContacts((list) => list.filter((c) => c.id !== id))
    setSelected((s) => {
      const next = new Set(s)
      next.delete(id)
      return next
    })
  }

  const chosen = contacts.filter((c) => selected.has(c.id))

  const send = async () => {
    if (!session || chosen.length === 0) return
    setBusy(true)
    setError(null)
    try {
      await recordShares(
        session.sessionId,
        intervention.id,
        chosen.map((c) => c.id),
      )
      setQueue(chosen)
      onSent()
    } catch (e) {
      setError(friendlyError(e, "Erreur lors de l'envoi."))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <CenteredDialogContent className="flex max-h-[90dvh] flex-col overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Envoyer la fiche</DialogTitle>
          <DialogDescription>
            {queue ? 'Ouvre chaque conversation et appuie sur Envoyer dans WhatsApp.' : 'Choisis la liste et les contacts.'}
          </DialogDescription>
        </DialogHeader>

        {queue ? (
          <div className="flex flex-col gap-2">
            {queue.map((c) => (
              <a
                key={c.id}
                href={whatsappLink(c.phone, message)}
                target="_blank"
                rel="noreferrer"
                onClick={() => setOpened((s) => new Set(s).add(c.id))}
                className="flex items-center justify-between gap-2 rounded-xl border border-border/60 px-3 py-2.5 text-sm"
              >
                <span className="min-w-0 truncate font-medium">
                  {c.name} <span className="text-xs text-muted-foreground">· {CATEGORY_LABEL[c.category]}</span>
                </span>
                {opened.has(c.id) ? (
                  <Badge variant="success" className="shrink-0 text-[10px]">
                    <Check className="size-3" /> Ouvert
                  </Badge>
                ) : (
                  <span className="flex shrink-0 items-center gap-1 text-xs font-medium text-primary">
                    <MessageCircle className="size-4" /> Ouvrir WhatsApp
                  </span>
                )}
              </a>
            ))}
            <DialogFooter>
              <Button onClick={() => onOpenChange(false)}>Terminé</Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <SegmentedControl
              options={[
                { value: '25', label: 'Techniciens 25 %' },
                { value: '50', label: 'Partenaires 50/50' },
              ]}
              value={category}
              onChange={setCategory}
            />

            <div className="flex flex-col gap-1">
              <p className="text-xs text-muted-foreground">Message</p>
              <Input value={message} onChange={(e) => setMessage(e.target.value)} className="font-semibold" />
            </div>

            <div className="flex flex-col gap-1.5">
              {inTab.length > 0 && (
                <label className="flex items-center gap-2.5 rounded-xl bg-secondary/50 px-3 py-2 text-sm font-medium">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleAll}
                    className="size-4"
                    style={{ accentColor: 'var(--primary)' }}
                  />
                  Tout le monde ({inTab.length})
                </label>
              )}
              {inTab.map((c) => (
                <div key={c.id} className="flex items-center gap-2.5 rounded-xl border border-border/60 px-3 py-2 text-sm">
                  <input
                    type="checkbox"
                    checked={selected.has(c.id)}
                    onChange={() => toggle(c.id)}
                    className="size-4"
                    style={{ accentColor: 'var(--primary)' }}
                    aria-label={c.name}
                  />
                  <button type="button" className="min-w-0 flex-1 text-left" onClick={() => toggle(c.id)}>
                    <span className="block truncate font-medium">{c.name}</span>
                    <span className="block text-xs text-muted-foreground">{c.phone}</span>
                  </button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8 text-muted-foreground"
                    onClick={() => remove(c.id)}
                    aria-label="Retirer"
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              ))}
              {inTab.length === 0 && <p className="text-xs text-muted-foreground">Aucun contact dans cette liste pour l'instant.</p>}
            </div>

            <div className="flex flex-col gap-2 rounded-xl border border-dashed border-border p-2.5">
              <p className="text-xs font-medium text-muted-foreground">Ajouter un contact ({CATEGORY_LABEL[category]})</p>
              <div className="grid grid-cols-2 gap-2">
                <Input placeholder="Nom" value={newName} onChange={(e) => setNewName(e.target.value)} />
                <Input
                  placeholder="06 12 34 56 78"
                  type="tel"
                  inputMode="tel"
                  value={newPhone}
                  onChange={(e) => setNewPhone(e.target.value)}
                />
              </div>
              <Button variant="outline" size="sm" className="w-fit" onClick={add} disabled={!newName.trim() || !newPhone.trim()}>
                <Plus className="size-4" /> Ajouter
              </Button>
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Annuler
              </Button>
              <Button onClick={send} disabled={busy || chosen.length === 0 || !message.trim()}>
                <Send className="size-4" />
                Envoyer{chosen.length > 0 ? ` à ${chosen.length}` : ''}
              </Button>
            </DialogFooter>
          </div>
        )}
      </CenteredDialogContent>
    </Dialog>
  )
}

// ---------- Bloc sur la fiche ----------

const fmt = (iso: string) =>
  new Date(iso).toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
const euros = (n: number) => `${n.toFixed(2).replace('.', ',').replace(',00', '')} €`

// Bouton « Envoyer » (barre d'actions de la fiche).
export function WhatsAppSendButton({ intervention, onSent }: { intervention: Intervention; onSent: () => void }) {
  const [open, setOpen] = React.useState(false)
  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
        <Send className="size-4" />
        Envoyer
      </Button>
      <SendDialog intervention={intervention} open={open} onOpenChange={setOpen} onSent={onSent} />
    </>
  )
}

// Suivi sur la fiche : à qui elle a été envoyée, qui l'a prise, et la part à
// lui reverser (25 % ou 50 % du prix annoncé).
export function WhatsAppShareStatus({ intervention, refreshKey }: { intervention: Intervention; refreshKey: number }) {
  const { session } = useAuth()
  const [shares, setShares] = React.useState<InterventionShare[]>([])
  const [takenBy, setTaken] = React.useState<TakenBy | null>(null)

  React.useEffect(() => {
    if (!session) return
    getShares(session.sessionId, intervention.id)
      .then((d) => {
        setShares(d.shares)
        setTaken(d.takenBy)
      })
      .catch(() => {})
  }, [session, intervention.id, refreshKey])

  // Un contact par personne (le plus récent envoi), pour le choix « Prise par ».
  const recipients = [...new Map(shares.filter((s) => s.contact_id).map((s) => [s.contact_id!, s])).values()]

  const choose = async (contactId: string | null) => {
    if (!session) return
    setTaken(await setTakenBy(session.sessionId, intervention.id, contactId).catch(() => takenBy))
  }

  if (shares.length === 0 && !takenBy) return null
  const owed = takenBy && intervention.amount != null ? (intervention.amount * takenBy.percent) / 100 : null

  return (
    <Card>
      <CardContent className="flex flex-col gap-2.5">
        <p className="text-sm font-semibold">Envoyée sur WhatsApp</p>
        <div className="flex flex-wrap gap-1.5">
          {recipients.map((s) => (
            <Badge key={s.contact_id} variant="outline" className="text-[10px]">
              {s.contact_name} · {CATEGORY_LABEL[s.category]} · {fmt(s.sent_at)}
            </Badge>
          ))}
        </div>

        <div className="flex flex-col gap-1.5">
          <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <UserCheck className="size-3.5" /> Prise par
          </p>
          <div className="flex flex-wrap gap-1.5">
            {recipients.map((s) => (
              <Button
                key={s.contact_id}
                size="sm"
                variant={takenBy?.contactId === s.contact_id ? 'default' : 'outline'}
                onClick={() => choose(takenBy?.contactId === s.contact_id ? null : s.contact_id)}
              >
                {s.contact_name}
              </Button>
            ))}
          </div>
          {takenBy && (
            <p className="text-sm">
              {takenBy.name} · {takenBy.percent === 50 ? '50/50' : `${takenBy.percent} %`}
              {owed != null ? ` · à reverser : ${euros(owed)}` : ' · prix annoncé à renseigner'}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
