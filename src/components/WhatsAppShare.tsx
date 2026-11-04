import { Check, FileText, Loader2, Megaphone, MessageCircle, Plus, Search, Send, Star, Trash2, UserCheck, Users, X } from 'lucide-react'
import * as React from 'react'
import { Link } from 'react-router-dom'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { CenteredDialogContent, Dialog, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { useWhatsAppSession } from '@/components/WhatsAppConnection'
import { useLiveEvents } from '@/hooks/useLiveEvents'
import { useAuth } from '@/lib/auth'
import { friendlyError } from '@/lib/errors'
import type { Intervention } from '@/lib/interventions'
import {
  CATEGORY_LABEL,
  deleteContact,
  addContactsBulk,
  addFavorite,
  listFavorites,
  removeFavorite,
  ficheText,
  getShares,
  isGroup,
  listChats,
  listContacts,
  sendDirect,
  recordShares,
  setTakenBy,
  shortCode,
  whatsappLink,
  type InterventionShare,
  type ShareCategory,
  type TakenBy,
  type WhatsAppContact,
  type WhatsAppChat,
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
  const [chatKind, setChatKind] = React.useState<'favoris' | 'tous' | 'contacts' | 'groupes'>('tous')
  // Favoris (étoile) : identifiants de discussion → affichés en premier partout.
  const [favorites, setFavorites] = React.useState<Map<string, { name: string | null; kind: 'contact' | 'groupe' }>>(new Map())
  const [error, setError] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [queue, setQueue] = React.useState<WhatsAppContact[] | null>(null)
  const [opened, setOpened] = React.useState<Set<string>>(new Set())
  const { wa } = useWhatsAppSession()
  const direct = wa?.status === 'connecte'
  const [chats, setChats] = React.useState<WhatsAppChat[] | null>(null)
  const [chatQuery, setChatQuery] = React.useState('')
  const [picked, setPicked] = React.useState<Set<string>>(new Set())
  // « proposition » : code court aux listes (ex. OP PARIS 6) ; « fiche » : la fiche complète.
  const [mode, setMode] = React.useState<'proposition' | 'fiche'>('proposition')
  // Envoi direct en cours : lignes suivies en direct (envoi → envoyé / échec).
  const [sending, setSending] = React.useState<InterventionShare[] | null>(null)

  React.useEffect(() => {
    if (!open || !session) return
    setQueue(null)
    setSending(null)
    setChats(null)
    setPicked(new Set())
    setMode('proposition')
    setOpened(new Set())
    setSelected(new Set())
    setError(null)
    setMessage(shortCode(intervention))
    listContacts(session.sessionId)
      .then(setContacts)
      .catch((e) => setError(friendlyError(e, 'Erreur de chargement.')))
    listFavorites(session.sessionId)
      .then((list) => {
        setFavorites(new Map(list.map((f) => [f.id, { name: f.name, kind: f.kind }])))
        if (list.length > 0) setChatKind('favoris')
      })
      .catch(() => {})
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

  // Suivi en direct des envois directs (le serveur les fait partir un par un).
  const refreshSending = React.useCallback(() => {
    if (!session || !sending) return
    getShares(session.sessionId, intervention.id)
      .then((d) => setSending((cur) => (cur ? d.shares.filter((x) => cur.some((c) => c.id === x.id)) : cur)))
      .catch(() => {})
  }, [session, sending, intervention.id])
  useLiveEvents(['interventions_changed'], refreshSending)

  const showChats = async () => {
    if (!session) return
    setError(null)
    setPicked(new Set())
    setChatQuery('')
    try {
      setChats(await listChats(session.sessionId))
    } catch (e) {
      setError(friendlyError(e, 'Impossible de lire tes discussions.'))
    }
  }

  // Ajoute les discussions cochées au tableau de l'onglet en cours.
  const addPicked = async () => {
    if (!session || !chats) return
    try {
      const items = chats.filter((c) => picked.has(c.id)).map((c) => ({ id: c.id, name: c.name }))
      const added = await addContactsBulk(session.sessionId, category, items)
      setContacts((list) => [...list, ...added].sort((a, b) => a.name.localeCompare(b.name)))
      setSelected((sel) => new Set([...sel, ...added.map((c) => c.id)]))
      setChats(null)
    } catch (e) {
      setError(friendlyError(e, "Impossible d'ajouter ces discussions."))
    }
  }

  // Tableau vide et WhatsApp relié : la liste des discussions s'ouvre d'elle-même.
  const tabCount = contacts.filter((c) => c.category === category).length
  React.useEffect(() => {
    if (open && direct && !chats && tabCount === 0) showChats()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, direct, category, tabCount])

  const toggleFavorite = (id: string, name: string, kind: 'contact' | 'groupe') => {
    if (!session) return
    setFavorites((cur) => {
      const next = new Map(cur)
      if (next.has(id)) {
        next.delete(id)
        removeFavorite(session.sessionId, id).catch(() => {})
      } else {
        next.set(id, { name, kind })
        addFavorite(session.sessionId, { id, name, kind }).catch(() => {})
      }
      return next
    })
  }
  const byFavoriteThenName = <T extends { name: string }>(key: (x: T) => string) => (a: T, b: T) =>
    Number(favorites.has(key(b))) - Number(favorites.has(key(a))) || a.name.localeCompare(b.name)

  const switchMode = (m: 'proposition' | 'fiche') => {
    setMode(m)
    setMessage(m === 'fiche' ? ficheText(intervention) : shortCode(intervention))
  }

  // Total des destinataires : ceux cochés dans le tableau + les discussions
  // WhatsApp sélectionnées (ajoutées au tableau au moment de l'envoi).
  const recipientCount = chosen.length + (direct ? picked.size : 0)

  const send = async () => {
    if (!session || recipientCount === 0) return
    setBusy(true)
    setError(null)
    try {
      if (direct) {
        let fromChats: WhatsAppContact[] = []
        if (picked.size > 0 && chats) {
          const items = chats.filter((c) => picked.has(c.id)).map((c) => ({ id: c.id, name: c.name }))
          fromChats = await addContactsBulk(session.sessionId, category, items)
          setContacts((list) => [...list, ...fromChats].sort((a, b) => a.name.localeCompare(b.name)))
          setPicked(new Set())
        }
        const ids = [...new Set([...chosen.map((c) => c.id), ...fromChats.map((c) => c.id)])]
        const { shares } = await sendDirect(session.sessionId, intervention.id, ids, message, mode)
        setSending(shares.filter((x) => x.status === 'envoi' && ids.includes(x.contact_id ?? '')))
        onSent()
        return
      }
      await recordShares(
        session.sessionId,
        intervention.id,
        chosen.map((c) => c.id),
        mode,
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
      {/* Plein écran sur téléphone (plus de place pour lire et choisir), fenêtre sur grand écran. */}
      <CenteredDialogContent
        className="top-0 left-0 flex h-[100dvh] max-h-none w-full max-w-none translate-x-0 translate-y-0 flex-col gap-4 overflow-y-auto rounded-none border-0 px-4 pt-[max(1.25rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] sm:top-1/2 sm:left-1/2 sm:h-auto sm:max-h-[92dvh] sm:w-[calc(100%-2rem)] sm:max-w-2xl sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-3xl sm:p-6"
        style={{ backgroundColor: 'var(--background)', backdropFilter: 'none', WebkitBackdropFilter: 'none' }}
        showCloseButton={false}
      >
        <DialogHeader>
          <div className="flex items-center justify-between gap-2">
            <DialogTitle className="text-xl">Envoyer la fiche</DialogTitle>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="flex size-10 items-center justify-center rounded-full bg-secondary text-muted-foreground"
              aria-label="Fermer"
            >
              <X className="size-5" />
            </button>
          </div>
          <DialogDescription>
            {sending
              ? 'Envoi depuis ton WhatsApp relié.'
              : queue
                ? 'Ouvre chaque conversation et appuie sur Envoyer dans WhatsApp.'
                : direct
                  ? 'Choisis la liste et les contacts : le message part directement de ton WhatsApp.'
                  : 'Choisis la liste et les contacts. Astuce : relie ton WhatsApp dans Réglages pour envoyer en un clic.'}
          </DialogDescription>
        </DialogHeader>

        {sending ? (
          <div className="flex flex-col gap-2">
            {sending.map((x) => (
              <div key={x.id} className="flex items-center justify-between gap-2 rounded-xl border border-border/60 px-3 py-2.5 text-sm">
                <span className="min-w-0 truncate font-medium">{x.contact_name}</span>
                {x.status === 'envoye' ? (
                  <Badge variant="success" className="shrink-0 text-[10px]">
                    <Check className="size-3" /> Envoyé
                  </Badge>
                ) : x.status === 'echec' ? (
                  <span className="shrink-0 text-right text-xs text-destructive">
                    <X className="mr-0.5 inline size-3" />
                    {x.error || 'Échec'}
                  </span>
                ) : (
                  <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                    <Loader2 className="size-3.5 animate-spin" /> En file…
                  </span>
                )}
              </div>
            ))}
            <p className="text-xs text-muted-foreground">Les messages partent un par un, à quelques secondes d'intervalle. Tu peux fermer cette fenêtre.</p>
            <DialogFooter>
              <Button onClick={() => onOpenChange(false)}>Fermer</Button>
            </DialogFooter>
          </div>
        ) : queue ? (
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

            <div className="grid grid-cols-2 gap-2">
              <Button variant={mode === 'proposition' ? 'default' : 'outline'} size="sm" onClick={() => switchMode('proposition')}>
                <Megaphone className="size-4" /> Proposition
              </Button>
              <Button variant={mode === 'fiche' ? 'default' : 'outline'} size="sm" onClick={() => switchMode('fiche')}>
                <FileText className="size-4" /> Fiche complète
              </Button>
            </div>
            <div className="flex flex-col gap-1">
              <p className="text-xs text-muted-foreground">
                {mode === 'proposition' ? 'Proposition : qui est dispo pour cette intervention ?' : 'Fiche complète, pour celui qui prend l’intervention'}
              </p>
              {mode === 'proposition' ? (
                <Input value={message} onChange={(e) => setMessage(e.target.value)} className="font-semibold" />
              ) : (
                <Textarea value={message} onChange={(e) => setMessage(e.target.value)} className="min-h-32 text-sm" />
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              {inTab.length > 0 && (
                <label className="flex min-h-12 items-center gap-3 rounded-2xl bg-secondary/70 px-4 py-2 text-[15px] font-semibold">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleAll}
                    className="size-5"
                    style={{ accentColor: 'var(--primary)' }}
                  />
                  Tout le monde ({inTab.length})
                </label>
              )}
              {[...inTab].sort(byFavoriteThenName<WhatsAppContact>((c) => c.phone)).map((c) => (
                <div
                  key={c.id}
                  className={`flex min-h-16 items-center gap-3 rounded-2xl border px-3 py-2.5 ${
                    selected.has(c.id) ? 'border-primary/50 bg-primary/10' : 'surface'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selected.has(c.id)}
                    onChange={() => toggle(c.id)}
                    className="size-5 shrink-0"
                    style={{ accentColor: 'var(--primary)' }}
                    aria-label={c.name}
                  />
                  <button type="button" className="flex min-w-0 flex-1 items-center gap-3 text-left" onClick={() => toggle(c.id)}>
                    <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-tone-green-soft text-sm font-bold text-tone-green-ink">
                      {isGroup(c.phone) ? <Users className="size-5" /> : c.name.slice(0, 1).toUpperCase()}
                    </span>
                    <span className="min-w-0">
                    <span className="block truncate text-base font-semibold">{c.name}</span>
                    <span className="block truncate text-sm text-muted-foreground">
                      {isGroup(c.phone) ? (
                        <>
                          <Users className="mr-1 inline size-3" />
                          Groupe WhatsApp
                        </>
                      ) : (
                        c.phone
                      )}
                    </span>
                    </span>
                  </button>
                  <button
                    type="button"
                    className="flex size-10 shrink-0 items-center justify-center rounded-full"
                    onClick={() => toggleFavorite(c.phone, c.name, isGroup(c.phone) ? 'groupe' : 'contact')}
                    aria-label={favorites.has(c.phone) ? 'Retirer des favoris' : 'Ajouter aux favoris'}
                  >
                    <Star className={`size-5 ${favorites.has(c.phone) ? 'fill-tone-amber text-tone-amber' : 'text-muted-foreground'}`} />
                  </button>
                  <Button variant="ghost" size="icon" className="size-10 text-muted-foreground" onClick={() => remove(c.id)} aria-label="Retirer">
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              ))}
              {inTab.length === 0 && <p className="text-xs text-muted-foreground">Aucun contact dans cette liste pour l'instant.</p>}
            </div>

            {/* Ajout au tableau : uniquement depuis les discussions du WhatsApp relié. */}
            {direct ? (
              <div className="flex flex-col gap-2 rounded-xl border border-border/70 p-2.5">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold">Ajouter depuis WhatsApp ({CATEGORY_LABEL[category]})</p>
                  {!chats && (
                    <Button variant="outline" size="sm" onClick={showChats}>
                      <Users className="size-4" /> Voir mes discussions
                    </Button>
                  )}
                </div>
                {chats &&
                  (() => {
                    const already = new Set(contacts.filter((c) => c.category === category).map((c) => c.phone))
                    const q = chatQuery.trim().toLowerCase()
                    const list = chats
                      .filter(
                        (c) =>
                          !already.has(c.id) &&
                          (chatKind === 'tous' ||
                            (chatKind === 'favoris' ? favorites.has(c.id) : c.kind === (chatKind === 'groupes' ? 'groupe' : 'contact'))) &&
                          (!q || `${c.name} ${c.detail ?? ''}`.toLowerCase().includes(q)),
                      )
                      .sort(byFavoriteThenName<WhatsAppChat>((c) => c.id))
                    const allPicked = list.length > 0 && list.every((c) => picked.has(c.id))
                    return (
                      <>
                        <div className="relative">
                          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                          <Input
                            className="h-12 pl-9 text-base"
                            placeholder="Chercher un contact ou un groupe"
                            value={chatQuery}
                            onChange={(e) => setChatQuery(e.target.value)}
                          />
                        </div>
                        {/* Filtres en pastilles qui défilent (lisibles même sur petit écran). */}
                        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
                          {(
                            [
                              ['favoris', `★ Favoris (${chats.filter((c) => favorites.has(c.id)).length})`],
                              ['tous', `Tous (${chats.length})`],
                              ['contacts', `Contacts (${chats.filter((c) => c.kind === 'contact').length})`],
                              ['groupes', `Groupes (${chats.filter((c) => c.kind === 'groupe').length})`],
                            ] as const
                          ).map(([value, label]) => (
                            <button
                              key={value}
                              type="button"
                              onClick={() => setChatKind(value)}
                              className={`h-10 shrink-0 rounded-full px-4 text-sm font-semibold whitespace-nowrap ${
                                chatKind === value ? 'bg-primary text-primary-foreground' : 'bg-secondary text-secondary-foreground'
                              }`}
                            >
                              {label}
                            </button>
                          ))}
                        </div>
                        {list.length > 0 && (
                          <label className="flex min-h-12 items-center gap-3 rounded-2xl bg-secondary/70 px-4 py-2 text-[15px] font-semibold">
                            <input
                              type="checkbox"
                              className="size-5"
                              style={{ accentColor: 'var(--primary)' }}
                              checked={allPicked}
                              onChange={() =>
                                setPicked((p) => {
                                  const next = new Set(p)
                                  for (const c of list) {
                                    if (allPicked) next.delete(c.id)
                                    else next.add(c.id)
                                  }
                                  return next
                                })
                              }
                            />
                            Tout sélectionner ({list.length})
                          </label>
                        )}
                        <div className="surface flex max-h-[62dvh] min-h-72 flex-col overflow-y-auto rounded-2xl">
                          {list.length === 0 && (
                            <p className="p-4 text-sm text-muted-foreground">
                              {chats.length === 0
                                ? 'Aucune discussion pour l’instant : elles arrivent quelques minutes après la liaison.'
                                : chatKind === 'favoris'
                                  ? 'Aucun favori : touche l’étoile ☆ d’une discussion pour l’ajouter ici.'
                                  : 'Aucune discussion ne correspond.'}
                            </p>
                          )}
                          {list.slice(0, 400).map((c) => (
                            <label
                              key={c.id}
                              className={`flex min-h-16 cursor-pointer items-center gap-3 border-b border-border/60 px-3 py-2.5 last:border-b-0 ${
                                picked.has(c.id) ? 'bg-primary/10' : 'hover:bg-secondary/60'
                              }`}
                            >
                              <input
                                type="checkbox"
                                className="size-5 shrink-0"
                                style={{ accentColor: 'var(--primary)' }}
                                checked={picked.has(c.id)}
                                onChange={() =>
                                  setPicked((p) => {
                                    const next = new Set(p)
                                    if (next.has(c.id)) next.delete(c.id)
                                    else next.add(c.id)
                                    return next
                                  })
                                }
                              />
                              <span
                                className={`flex size-11 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                                  c.kind === 'groupe' ? 'bg-tone-cyan-soft text-tone-cyan-ink' : 'bg-tone-green-soft text-tone-green-ink'
                                }`}
                              >
                                {c.kind === 'groupe' ? <Users className="size-5" /> : c.name.slice(0, 1).toUpperCase()}
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-base font-semibold">{c.name}</span>
                                <span className="block truncate text-sm text-muted-foreground">
                                  {c.kind === 'groupe' ? `Groupe · ${c.detail ?? ''}` : (c.detail ?? 'Contact')}
                                </span>
                              </span>
                              <button
                                type="button"
                                className="flex size-10 shrink-0 items-center justify-center rounded-full"
                                onClick={(e) => {
                                  e.preventDefault()
                                  e.stopPropagation()
                                  toggleFavorite(c.id, c.name, c.kind)
                                }}
                                aria-label={favorites.has(c.id) ? 'Retirer des favoris' : 'Ajouter aux favoris'}
                              >
                                <Star className={`size-5 ${favorites.has(c.id) ? 'fill-tone-amber text-tone-amber' : 'text-muted-foreground'}`} />
                              </button>
                            </label>
                          ))}
                        </div>
                        <div className="flex gap-2">
                          <Button size="sm" variant="outline" onClick={addPicked} disabled={picked.size === 0}>
                            <Plus className="size-4" /> Garder{picked.size > 0 ? ` (${picked.size})` : ''} dans le tableau {CATEGORY_LABEL[category]}
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setChats(null)}>
                            Fermer
                          </Button>
                        </div>
                      </>
                    )
                  })()}
              </div>
            ) : (
              <p className="rounded-xl bg-secondary/50 p-3 text-sm">
                Pour ajouter des contacts et des groupes,{' '}
                <Link to="/reglages/whatsapp" className="font-medium text-primary underline-offset-2 hover:underline">
                  relie ton WhatsApp dans Réglages
                </Link>
                .
              </p>
            )}

            {error && <p className="text-sm text-destructive">{error}</p>}

            <DialogFooter className="sticky bottom-0 -mx-4 flex-row gap-2 border-t border-border/70 bg-background/95 px-4 py-3 backdrop-blur sm:-mx-1 sm:px-1">
              <Button variant="outline" size="lg" className="flex-1 sm:flex-none" onClick={() => onOpenChange(false)}>
                Annuler
              </Button>
              <Button size="lg" className="flex-[2] sm:flex-none" onClick={send} disabled={busy || recipientCount === 0 || !message.trim()}>
                <Send className="size-4" />
                Envoyer{recipientCount > 0 ? ` à ${recipientCount}` : ''}
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
export function WhatsAppSendButton({
  intervention,
  onSent,
  className,
}: {
  intervention: Intervention
  onSent: () => void
  className?: string
}) {
  const [open, setOpen] = React.useState(false)
  return (
    <>
      <Button variant="outline" size="sm" className={className} onClick={() => setOpen(true)}>
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

  const load = React.useCallback(() => {
    if (!session) return
    getShares(session.sessionId, intervention.id)
      .then((d) => {
        setShares(d.shares)
        setTaken(d.takenBy)
      })
      .catch(() => {})
  }, [session, intervention.id])
  React.useEffect(() => {
    load()
  }, [load, refreshKey])
  // Envois directs : « en file » → envoyé / échec, en direct.
  useLiveEvents(['interventions_changed'], load)

  // Un contact par personne (le plus récent envoi), pour le choix « Prise par ».
  const recipients = [...new Map(shares.filter((s) => s.contact_id).map((s) => [s.contact_id!, s])).values()]

  const choose = async (contactId: string | null) => {
    if (!session) return
    setTaken(await setTakenBy(session.sessionId, intervention.id, contactId).catch(() => takenBy))
  }

  // Fiche complète à celui qui a pris l'intervention : directement si
  // WhatsApp est relié, sinon en ouvrant sa conversation.
  const { wa } = useWhatsAppSession()
  const [ficheSent, setFicheSent] = React.useState<'envoi' | 'ok' | string | null>(null)
  const sendFiche = async () => {
    if (!session || !takenBy) return
    const recipient = recipients.find((x) => x.contact_id === takenBy.contactId)
    if (wa?.status === 'connecte') {
      setFicheSent('envoi')
      try {
        await sendDirect(session.sessionId, intervention.id, [takenBy.contactId], ficheText(intervention), 'fiche')
        setFicheSent('ok')
      } catch (e) {
        setFicheSent(friendlyError(e, "Erreur d'envoi."))
      }
    } else if (recipient?.phone && !isGroup(recipient.phone)) {
      window.open(whatsappLink(recipient.phone, ficheText(intervention)), '_blank')
      recordShares(session.sessionId, intervention.id, [takenBy.contactId], 'fiche').catch(() => {})
      setFicheSent('ok')
    }
  }

  if (shares.length === 0 && !takenBy) return null
  const owed = takenBy && intervention.amount != null ? (intervention.amount * takenBy.percent) / 100 : null

  return (
    <Card>
      <CardContent className="flex flex-col gap-2.5">
        <p className="text-sm font-semibold">Envoyée sur WhatsApp</p>
        <div className="flex flex-wrap gap-1.5">
          {recipients.map((s) => (
            <Badge key={s.contact_id} variant={s.status === 'echec' ? 'destructive' : 'outline'} className="text-[10px]">
              {s.contact_name} · {CATEGORY_LABEL[s.category]} · {s.status === 'envoi' ? 'en file' : s.status === 'echec' ? 'échec' : fmt(s.sent_at)}
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
            <div className="flex flex-col gap-1.5">
              <Button size="sm" className="w-fit" onClick={sendFiche} disabled={ficheSent === 'envoi'}>
                {ficheSent === 'envoi' ? <Loader2 className="size-4 animate-spin" /> : <FileText className="size-4" />}
                Envoyer la fiche complète à {takenBy.name}
              </Button>
              {ficheSent === 'ok' && <p className="text-xs text-success">Fiche envoyée.</p>}
              {ficheSent && ficheSent !== 'ok' && ficheSent !== 'envoi' && <p className="text-xs text-destructive">{ficheSent}</p>}
            </div>
          )}
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
