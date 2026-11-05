import {
  Banknote,
  Bell,
  BellOff,
  BellRing,
  CheckCheck,
  ChevronRight,
  FileCheck,
  Loader2,
  MapPin,
  PenLine,
  PhoneIncoming,
  Receipt,
  Settings2,
  ShieldAlert,
  Siren,
  Trash2,
  Wrench,
  type LucideIcon,
} from 'lucide-react'
import * as React from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { Loader } from '@/components/Loader'
import { Page } from '@/components/layout/Page'
import { SwipeToDelete, SwipeToDeleteGroup } from '@/components/SwipeToDelete'
import { Button } from '@/components/ui/button'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { useLiveEvents } from '@/hooks/useLiveEvents'
import { useAuth } from '@/lib/auth'
import { friendlyError } from '@/lib/errors'
import {
  clearReadNotifications,
  deleteNotification,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  setAppBadge,
  subscribeToPush,
  type PseNotification,
} from '@/lib/notifications'
import { TONE_ICON, type Tone } from '@/lib/tones'

// Une icône et une teinte par type : on reconnaît la notification d'un coup d'œil.
const KINDS: Record<string, { icon: LucideIcon; tone: Tone; label: string }> = {
  intervention_assignee: { icon: Wrench, tone: 'blue', label: 'Intervention' },
  fiche_depuis_appel: { icon: PhoneIncoming, tone: 'cyan', label: 'Appel client' },
  urgent: { icon: Siren, tone: 'red', label: 'Urgent' },
  devis_signe: { icon: FileCheck, tone: 'violet', label: 'Devis' },
  facture_signee: { icon: PenLine, tone: 'green', label: 'Facture' },
  facture_creee: { icon: Receipt, tone: 'green', label: 'Facture' },
  paiement_recu: { icon: Banknote, tone: 'amber', label: 'Paiement' },
  nouvelle_connexion: { icon: ShieldAlert, tone: 'orange', label: 'Sécurité' },
}
const kindOf = (type: string) => KINDS[type] ?? { icon: Bell, tone: 'slate' as Tone, label: 'Information' }

// Les titres des notifications push commencent par un emoji (utile sur
// l'écran verrouillé) : ici l'icône le remplace.
const cleanTitle = (t: string) => t.replace(/^[\p{Extended_Pictographic}️‍\s]+/u, '')

function dayLabel(iso: string) {
  const d = new Date(iso)
  const today = new Date()
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  const days = Math.round((startOf(today) - startOf(d)) / 86_400_000)
  if (days <= 0) return "Aujourd'hui"
  if (days === 1) return 'Hier'
  if (days < 7) {
    const w = d.toLocaleDateString('fr-FR', { weekday: 'long' })
    return w.charAt(0).toUpperCase() + w.slice(1)
  }
  return d.toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    ...(d.getFullYear() !== today.getFullYear() ? { year: 'numeric' } : {}),
  })
}

function timeLabel(iso: string) {
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000)
  if (min < 1) return "À l'instant"
  if (min < 60) return `Il y a ${min} min`
  return new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
}

type PushState = 'unsupported' | 'default' | 'denied' | 'granted' | 'busy' | 'done'
function initialPushState(): PushState {
  if (
    !('serviceWorker' in navigator) ||
    !('PushManager' in window) ||
    !('Notification' in window) ||
    !import.meta.env.VITE_VAPID_PUBLIC_KEY
  ) {
    return 'unsupported'
  }
  return Notification.permission as PushState
}

function NotificationRow({ n, onOpen }: { n: PseNotification; onOpen: () => void }) {
  const kind = kindOf(n.type)
  const Icon = kind.icon
  const unread = !n.read_at
  const address = (n.data as { address?: string })?.address
  const opens = Boolean(n.url && n.url !== '/notifications')
  return (
    // Fond plein (couleur de la carte) : le bouton « Supprimer » reste caché derrière.
    <div className="bg-card">
      <div className={`relative flex gap-3 px-4 py-3.5 ${unread ? 'bg-primary/[0.06]' : ''}`}>
        <button type="button" onClick={onOpen} className="absolute inset-0" aria-label={cleanTitle(n.title)} />
        <span className={`relative flex size-11 shrink-0 items-center justify-center rounded-2xl ${TONE_ICON[kind.tone]}`}>
          <Icon className="size-5" />
        </span>
        <div className="pointer-events-none relative min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">{kind.label}</p>
            <p className={`shrink-0 text-xs ${unread ? 'font-semibold text-primary' : 'text-muted-foreground'}`}>
              {timeLabel(n.created_at)}
            </p>
          </div>
          <p className={`mt-0.5 text-[15px] leading-snug ${unread ? 'font-semibold text-foreground' : 'font-medium text-foreground/85'}`}>
            {cleanTitle(n.title)}
          </p>
          {n.body && <p className="mt-0.5 line-clamp-3 text-[13.5px] leading-snug text-muted-foreground">{n.body}</p>}
          {address && (
            <a
              href={`https://waze.com/ul?q=${encodeURIComponent(address)}&navigate=yes`}
              target="_blank"
              rel="noreferrer"
              className="pointer-events-auto mt-2 inline-flex items-center gap-1.5 rounded-full bg-secondary px-2.5 py-1 text-xs font-medium text-foreground"
            >
              <MapPin className="size-3.5 text-tone-blue" /> Itinéraire Waze
            </a>
          )}
        </div>
        <div className="pointer-events-none relative flex shrink-0 flex-col items-center justify-center gap-2">
          {unread && <span className="size-2.5 rounded-full bg-primary" aria-label="Non lue" />}
          {opens && <ChevronRight className="size-4 text-muted-foreground" />}
        </div>
      </div>
    </div>
  )
}

export default function Notifications() {
  const { session } = useAuth()
  const navigate = useNavigate()
  const [items, setItems] = React.useState<PseNotification[] | null>(null)
  const [filter, setFilter] = React.useState<'toutes' | 'non_lues'>('toutes')
  const [push, setPush] = React.useState<PushState>(initialPushState)
  const [error, setError] = React.useState<string | null>(null)

  const load = React.useCallback(async () => {
    if (!session) return
    try {
      const list = await listNotifications(session.sessionId)
      setItems(list)
      setAppBadge(list.filter((n) => !n.read_at).length)
    } catch (e) {
      setError(friendlyError(e, 'Erreur de chargement.'))
    }
  }, [session])

  React.useEffect(() => {
    load()
  }, [load])
  // Nouvelle notification (ou lue sur un autre appareil) : la liste suit en direct.
  useLiveEvents(['notifications_changed'], load)

  const unreadCount = items?.filter((n) => !n.read_at).length ?? 0
  const readCount = (items?.length ?? 0) - unreadCount

  const open = async (n: PseNotification) => {
    if (!session) return
    if (!n.read_at) {
      setItems((its) => its?.map((i) => (i.id === n.id ? { ...i, read_at: new Date().toISOString() } : i)) ?? null)
      markNotificationRead(session.sessionId, n.id).catch(() => {})
    }
    if (n.url && n.url !== '/notifications') navigate(n.url)
  }

  const markAll = async () => {
    if (!session) return
    setItems((its) => its?.map((i) => ({ ...i, read_at: i.read_at ?? new Date().toISOString() })) ?? null)
    setAppBadge(0)
    markAllNotificationsRead(session.sessionId).catch(() => {})
  }

  const remove = async (n: PseNotification) => {
    if (!session) return
    setItems((its) => its?.filter((i) => i.id !== n.id) ?? null)
    deleteNotification(session.sessionId, n.id).catch(() => load())
  }

  const clearRead = async () => {
    if (!session || !window.confirm(`Effacer les ${readCount} notification${readCount > 1 ? 's' : ''} lue${readCount > 1 ? 's' : ''} ?`))
      return
    setItems((its) => its?.filter((i) => !i.read_at) ?? null)
    clearReadNotifications(session.sessionId).catch(() => load())
  }

  const enablePush = async () => {
    if (!session) return
    setPush('busy')
    try {
      await subscribeToPush(session.sessionId)
      setPush('done')
    } catch {
      setPush('Notification' in window ? (Notification.permission as PushState) : 'unsupported')
    }
  }

  const visible = React.useMemo(() => (items ?? []).filter((n) => filter === 'toutes' || !n.read_at), [items, filter])
  const groups = React.useMemo(() => {
    const map = new Map<string, PseNotification[]>()
    for (const n of visible) {
      const key = dayLabel(n.created_at)
      map.set(key, [...(map.get(key) ?? []), n])
    }
    return [...map.entries()]
  }, [visible])

  return (
    <Page title="Notifications">
      <div className="flex flex-col gap-4">
        {/* Notifications du téléphone : un appui pour les activer. */}
        {(push === 'default' || push === 'busy') && (
          <div className="surface flex items-center gap-3 rounded-2xl px-4 py-3.5">
            <span className={`flex size-11 shrink-0 items-center justify-center rounded-2xl ${TONE_ICON.blue}`}>
              <BellRing className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">Recevoir les notifications sur ce téléphone</p>
              <p className="text-xs text-muted-foreground">Même app fermée : nouvelle fiche, devis signé, paiement reçu…</p>
            </div>
            <Button size="sm" onClick={enablePush} disabled={push === 'busy'}>
              {push === 'busy' ? <Loader2 className="size-4 animate-spin" /> : 'Activer'}
            </Button>
          </div>
        )}
        {push === 'done' && (
          <p className="flex items-center gap-2 rounded-2xl bg-tone-green-soft px-4 py-3 text-sm font-medium text-tone-green-ink">
            <CheckCheck className="size-4" /> Notifications activées sur ce téléphone.
          </p>
        )}
        {push === 'denied' && (
          <p className="flex items-start gap-2 rounded-2xl bg-secondary px-4 py-3 text-xs text-muted-foreground">
            <BellOff className="mt-0.5 size-4 shrink-0" />
            Les notifications sont bloquées pour l'app : autorise-les dans les réglages du téléphone (Notifications), puis rouvre l'app.
          </p>
        )}

        {items && items.length > 0 && (
          <div className="flex items-center gap-2">
            <SegmentedControl
              value={filter}
              onChange={setFilter}
              options={[
                { value: 'toutes', label: `Toutes (${items.length})` },
                { value: 'non_lues', label: unreadCount ? `Non lues (${unreadCount})` : 'Non lues' },
              ]}
              className="flex-1"
            />
          </div>
        )}

        {items && items.length > 0 && (
          <div className="-mt-1 flex items-center justify-between gap-2 px-1">
            <Button variant="ghost" size="sm" className="h-8 shrink-0 px-2 text-primary" onClick={markAll} disabled={unreadCount === 0}>
              <CheckCheck className="size-4" /> Tout lire
            </Button>
            <div className="flex items-center gap-1">
              {readCount > 0 && (
                <Button variant="ghost" size="sm" className="h-8 px-2 text-muted-foreground" onClick={clearRead}>
                  <Trash2 className="size-4" /> Effacer les lues
                </Button>
              )}
              <Button variant="ghost" size="icon" className="size-8 rounded-full text-muted-foreground" asChild>
                <Link to="/reglages/notifications" aria-label="Réglages des notifications">
                  <Settings2 className="size-4" />
                </Link>
              </Button>
            </div>
          </div>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}
        {items === null && !error && <Loader className="py-10" />}

        {items !== null && visible.length === 0 && (
          <div className="flex flex-col items-center gap-3 py-14 text-center">
            <span className={`flex size-16 items-center justify-center rounded-full ${TONE_ICON.slate}`}>
              {filter === 'non_lues' && items.length > 0 ? <CheckCheck className="size-7" /> : <Bell className="size-7" />}
            </span>
            <div>
              <p className="text-base font-semibold">{filter === 'non_lues' && items.length > 0 ? 'Tout est lu' : 'Aucune notification'}</p>
              <p className="mt-1 text-sm text-muted-foreground">Les nouvelles fiches, signatures et paiements s'afficheront ici.</p>
            </div>
            <Button variant="outline" size="sm" asChild>
              <Link to="/reglages/notifications">
                <Settings2 className="size-4" /> Choisir mes notifications
              </Link>
            </Button>
          </div>
        )}

        <SwipeToDeleteGroup>
          {groups.map(([label, list]) => (
            <section key={label} className="flex flex-col gap-2">
              <p className="px-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">{label}</p>
              <div className="surface overflow-hidden rounded-2xl">
                {list.map((n, i) => (
                  <div key={n.id} className={i > 0 ? 'border-t border-border/70' : ''}>
                    <SwipeToDelete id={n.id} onDelete={() => remove(n)} className="rounded-none">
                      <NotificationRow n={n} onOpen={() => open(n)} />
                    </SwipeToDelete>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </SwipeToDeleteGroup>
        {visible.length > 0 && (
          <p className="pb-4 text-center text-xs text-muted-foreground">Glisse une notification vers la gauche pour la supprimer.</p>
        )}
      </div>
    </Page>
  )
}
