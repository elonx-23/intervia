import { ArrowLeftRight, Loader2, MoreHorizontal, Plus, Search, Star, Trash2, Users, X } from 'lucide-react'
import * as React from 'react'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { useWhatsAppSession } from '@/components/WhatsAppConnection'
import { useAuth } from '@/lib/auth'
import { friendlyError } from '@/lib/errors'
import {
  CATEGORY_LABEL,
  addContactsBulk,
  addFavorite,
  deleteContact,
  isGroup,
  listChats,
  listContacts,
  listFavorites,
  removeFavorite,
  updateContact,
  type ShareCategory,
  type WhatsAppChat,
  type WhatsAppContact,
} from '@/lib/whatsapp'

type Favorites = Map<string, { name: string | null; kind: 'contact' | 'groupe' }>

const LISTS: Array<{ category: ShareCategory; title: string; hint: string; tone: 'orange' | 'violet' }> = [
  { category: '25', title: 'Techniciens · 25 %', hint: 'Reçoivent les propositions et prennent 25 %.', tone: 'orange' },
  { category: '50', title: 'Partenaires · 50/50', hint: 'Entreprises partenaires, partage à 50 %.', tone: 'violet' },
]

const AVATAR = { orange: 'bg-tone-orange-soft text-tone-orange-ink', violet: 'bg-tone-violet-soft text-tone-violet-ink' }

// Ligne d'un contact (ou groupe) d'une liste.
function ContactRow({
  contact,
  favorite,
  tone,
  onFavorite,
  onMove,
  onDelete,
}: {
  contact: WhatsAppContact
  favorite: boolean
  tone: 'orange' | 'violet'
  onFavorite: () => void
  onMove: () => void
  onDelete: () => void
}) {
  const group = isGroup(contact.phone)
  return (
    <div className="flex min-h-16 items-center gap-3 border-b border-border/60 px-4 py-2.5 last:border-b-0">
      <span className={`flex size-11 shrink-0 items-center justify-center rounded-full text-sm font-bold ${AVATAR[tone]}`}>
        {group ? <Users className="size-5" /> : contact.name.slice(0, 1).toUpperCase()}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-base font-semibold">{contact.name}</span>
        <span className="block truncate text-sm text-muted-foreground">{group ? 'Groupe WhatsApp' : contact.phone}</span>
      </span>
      <button
        type="button"
        onClick={onFavorite}
        className="flex size-10 shrink-0 items-center justify-center rounded-full"
        aria-label={favorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}
      >
        <Star className={`size-5 ${favorite ? 'fill-tone-amber text-tone-amber' : 'text-muted-foreground'}`} />
      </button>
      {/* Actions moins fréquentes dans un menu, pour laisser toute la place au nom. */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" className="flex size-10 shrink-0 items-center justify-center rounded-full text-muted-foreground" aria-label="Plus d'actions">
            <MoreHorizontal className="size-5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-60">
          <DropdownMenuItem onSelect={onMove}>
            <ArrowLeftRight className="size-4" />
            {contact.category === '25' ? 'Passer en partenaire 50/50' : 'Passer en technicien 25 %'}
          </DropdownMenuItem>
          <DropdownMenuItem variant="destructive" onSelect={onDelete}>
            <Trash2 className="size-4" /> Retirer de la liste
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

// Ajout depuis les discussions du WhatsApp relié (recherche, filtres, favoris).
function ChatPicker({
  category,
  contacts,
  favorites,
  onFavorite,
  onAdded,
  onClose,
}: {
  category: ShareCategory
  contacts: WhatsAppContact[]
  favorites: Favorites
  onFavorite: (id: string, name: string, kind: 'contact' | 'groupe') => void
  onAdded: (added: WhatsAppContact[]) => void
  onClose: () => void
}) {
  const { session } = useAuth()
  const [chats, setChats] = React.useState<WhatsAppChat[] | null>(null)
  const [query, setQuery] = React.useState('')
  const [kind, setKind] = React.useState<'favoris' | 'tous' | 'contacts' | 'groupes'>(favorites.size > 0 ? 'favoris' : 'tous')
  const [picked, setPicked] = React.useState<Set<string>>(new Set())
  const [error, setError] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)

  React.useEffect(() => {
    if (!session) return
    listChats(session.sessionId)
      .then(setChats)
      .catch((e) => setError(friendlyError(e, 'Impossible de lire tes discussions.')))
  }, [session])

  const already = new Set(contacts.filter((c) => c.category === category).map((c) => c.phone))
  const q = query.trim().toLowerCase()
  const list = (chats ?? [])
    .filter(
      (c) =>
        !already.has(c.id) &&
        (kind === 'tous' || (kind === 'favoris' ? favorites.has(c.id) : c.kind === (kind === 'groupes' ? 'groupe' : 'contact'))) &&
        (!q || `${c.name} ${c.detail ?? ''}`.toLowerCase().includes(q)),
    )
    .sort((a, b) => Number(favorites.has(b.id)) - Number(favorites.has(a.id)) || a.name.localeCompare(b.name))
  const allPicked = list.length > 0 && list.every((c) => picked.has(c.id))

  const add = async () => {
    if (!session || !chats) return
    setBusy(true)
    try {
      const items = chats.filter((c) => picked.has(c.id)).map((c) => ({ id: c.id, name: c.name }))
      onAdded(await addContactsBulk(session.sessionId, category, items))
      onClose()
    } catch (e) {
      setError(friendlyError(e, "Impossible d'ajouter ces discussions."))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-base font-semibold">
          Ajouter aux {CATEGORY_LABEL[category] === '25 %' ? 'techniciens 25 %' : 'partenaires 50/50'}
        </p>
        <button
          type="button"
          onClick={onClose}
          className="flex size-9 items-center justify-center rounded-full bg-secondary"
          aria-label="Fermer"
        >
          <X className="size-4" />
        </button>
      </div>
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="h-12 pl-9 text-base"
          placeholder="Chercher un contact ou un groupe"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      {chats && (
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
              onClick={() => setKind(value)}
              className={`h-10 shrink-0 rounded-full px-4 text-sm font-semibold whitespace-nowrap ${
                kind === value ? 'bg-primary text-primary-foreground' : 'bg-secondary text-secondary-foreground'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      )}
      {!chats && !error && <Loader2 className="size-5 animate-spin text-muted-foreground" />}
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
      {chats && (
        <div className="surface flex max-h-[55dvh] min-h-56 flex-col overflow-y-auto rounded-2xl">
          {list.length === 0 && (
            <p className="p-4 text-sm text-muted-foreground">
              {chats.length === 0
                ? 'Aucune discussion pour l’instant : elles arrivent quelques minutes après la liaison.'
                : kind === 'favoris'
                  ? 'Aucun favori : touche l’étoile ☆ d’une discussion pour l’ajouter ici.'
                  : 'Aucune discussion ne correspond.'}
            </p>
          )}
          {list.slice(0, 400).map((c) => (
            <label
              key={c.id}
              className={`flex min-h-16 cursor-pointer items-center gap-3 border-b border-border/60 px-3 py-2.5 last:border-b-0 ${
                picked.has(c.id) ? 'bg-primary/10' : ''
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
                  onFavorite(c.id, c.name, c.kind)
                }}
                aria-label={favorites.has(c.id) ? 'Retirer des favoris' : 'Ajouter aux favoris'}
              >
                <Star className={`size-5 ${favorites.has(c.id) ? 'fill-tone-amber text-tone-amber' : 'text-muted-foreground'}`} />
              </button>
            </label>
          ))}
        </div>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button size="lg" onClick={add} disabled={busy || picked.size === 0}>
        {busy ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
        Ajouter{picked.size > 0 ? ` (${picked.size})` : ''}
      </Button>
    </div>
  )
}

// Réglages → WhatsApp : synthèse et gestion des destinataires des fiches.
// Techniciens (25 %) d'abord, puis partenaires (50/50) ; favoris en tête.
export function WhatsAppContactsManager() {
  const { session } = useAuth()
  const { wa } = useWhatsAppSession()
  const [contacts, setContacts] = React.useState<WhatsAppContact[] | null>(null)
  const [favorites, setFavorites] = React.useState<Favorites>(new Map())
  const [picker, setPicker] = React.useState<ShareCategory | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!session) return
    listContacts(session.sessionId)
      .then(setContacts)
      .catch((e) => setError(friendlyError(e, 'Erreur de chargement.')))
    listFavorites(session.sessionId)
      .then((list) => setFavorites(new Map(list.map((f) => [f.id, { name: f.name, kind: f.kind }]))))
      .catch(() => {})
  }, [session])

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

  const move = async (c: WhatsAppContact) => {
    if (!session) return
    const target: ShareCategory = c.category === '25' ? '50' : '25'
    const r = await updateContact(session.sessionId, c.id, { category: target }).catch(() => null)
    if (!r) return
    setContacts((list) => (list ?? []).flatMap((x) => (x.id !== c.id ? [x] : 'merged' in r ? [] : [{ ...x, category: target }])))
  }

  const remove = async (c: WhatsAppContact) => {
    if (!session) return
    await deleteContact(session.sessionId, c.id).catch(() => {})
    setContacts((list) => (list ?? []).filter((x) => x.id !== c.id))
  }

  if (!contacts)
    return error ? <p className="text-sm text-destructive">{error}</p> : <Loader2 className="size-5 animate-spin text-muted-foreground" />

  const connected = wa?.status === 'connecte'
  const techs = contacts.filter((c) => c.category === '25')
  const partners = contacts.filter((c) => c.category === '50')
  const groups = contacts.filter((c) => isGroup(c.phone)).length
  const favCount = contacts.filter((c) => favorites.has(c.phone)).length

  return (
    <div className="flex flex-col gap-4">
      {/* Synthèse */}
      <div className="grid grid-cols-2 gap-3">
        {[
          { label: 'Techniciens 25 %', value: techs.length, cls: 'bg-tone-orange-soft text-tone-orange-ink' },
          { label: 'Partenaires 50/50', value: partners.length, cls: 'bg-tone-violet-soft text-tone-violet-ink' },
          { label: 'Groupes', value: groups, cls: 'bg-tone-cyan-soft text-tone-cyan-ink' },
          { label: 'Favoris', value: favCount, cls: 'bg-tone-amber-soft text-tone-amber-ink' },
        ].map((t) => (
          <div key={t.label} className={`flex flex-col gap-0.5 rounded-2xl px-4 py-3 ${t.cls}`}>
            <span className="text-2xl font-bold tabular-nums">{t.value}</span>
            <span className="text-xs font-semibold">{t.label}</span>
          </div>
        ))}
      </div>

      {LISTS.map((l) => {
        const items = contacts
          .filter((c) => c.category === l.category)
          .sort((a, b) => Number(favorites.has(b.phone)) - Number(favorites.has(a.phone)) || a.name.localeCompare(b.name))
        return (
          <Card key={l.category} className="gap-3 py-4">
            <CardContent className="flex flex-col gap-3 px-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-base font-bold">{l.title}</p>
                  <p className="text-xs text-muted-foreground">{l.hint}</p>
                </div>
                {connected && picker !== l.category && (
                  <Button size="sm" variant="outline" onClick={() => setPicker(l.category)}>
                    <Plus className="size-4" /> Ajouter
                  </Button>
                )}
              </div>
              {picker === l.category ? (
                <ChatPicker
                  category={l.category}
                  contacts={contacts}
                  favorites={favorites}
                  onFavorite={toggleFavorite}
                  onAdded={(added) => setContacts((list) => [...(list ?? []), ...added])}
                  onClose={() => setPicker(null)}
                />
              ) : items.length === 0 ? (
                <p className="rounded-xl bg-secondary/60 px-3 py-3 text-sm text-muted-foreground">
                  {connected
                    ? 'Personne pour l’instant : appuie sur « Ajouter ».'
                    : 'Relie ton WhatsApp ci-dessus pour ajouter des contacts et des groupes.'}
                </p>
              ) : (
                <div className="-mx-4 border-t border-border/60">
                  {items.map((c) => (
                    <ContactRow
                      key={c.id}
                      contact={c}
                      favorite={favorites.has(c.phone)}
                      tone={l.tone}
                      onFavorite={() => toggleFavorite(c.phone, c.name, isGroup(c.phone) ? 'groupe' : 'contact')}
                      onMove={() => move(c)}
                      onDelete={() => remove(c)}
                    />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
