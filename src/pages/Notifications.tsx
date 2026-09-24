import { MapPin } from 'lucide-react'
import * as React from 'react'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { EmptyState } from '@/components/layout/EmptyState'
import { Page } from '@/components/layout/Page'
import { useAuth } from '@/lib/auth'
import { friendlyError } from '@/lib/errors'
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type PseNotification,
} from '@/lib/notifications'

function dateGroup(iso: string) {
  const d = new Date(iso)
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)
  const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString()
  if (sameDay(d, today)) return "Aujourd'hui"
  if (sameDay(d, yesterday)) return 'Hier'
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })
}

export default function Notifications() {
  const { session } = useAuth()
  const [items, setItems] = React.useState<PseNotification[] | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  const load = React.useCallback(async () => {
    if (!session) return
    try {
      setItems(await listNotifications(session.sessionId))
    } catch (e) {
      setError(friendlyError(e, 'Erreur de chargement.'))
    }
  }, [session])

  React.useEffect(() => {
    load()
  }, [load])

  const markRead = async (n: PseNotification) => {
    if (!session || n.read_at) return
    setItems((its) => its?.map((i) => (i.id === n.id ? { ...i, read_at: new Date().toISOString() } : i)) ?? null)
    try {
      await markNotificationRead(session.sessionId, n.id)
    } catch {
      // pas bloquant
    }
  }

  const markAll = async () => {
    if (!session) return
    setItems((its) => its?.map((i) => ({ ...i, read_at: i.read_at ?? new Date().toISOString() })) ?? null)
    try {
      await markAllNotificationsRead(session.sessionId)
    } catch {
      // pas bloquant
    }
  }

  const groups = React.useMemo(() => {
    if (!items) return []
    const map = new Map<string, PseNotification[]>()
    for (const n of items) {
      const key = dateGroup(n.created_at)
      map.set(key, [...(map.get(key) ?? []), n])
    }
    return [...map.entries()]
  }, [items])

  return (
    <Page title="Notifications">
      <div className="flex flex-col gap-4">
        {items && items.some((i) => !i.read_at) && (
          <div className="flex justify-end">
            <Button variant="ghost" size="sm" onClick={markAll}>
              Tout marquer lu
            </Button>
          </div>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}
        {items === null && !error && <p className="py-8 text-center text-sm text-muted-foreground">Chargement…</p>}
        {items !== null && items.length === 0 && <EmptyState label="Aucune notification" />}

        {groups.map(([label, list]) => (
          <div key={label} className="flex flex-col gap-2">
            <p className="text-xs font-medium text-muted-foreground">{label}</p>
            {list.map((n) => {
              const address = (n.data as { address?: string })?.address
              return (
                <Card key={n.id} onClick={() => markRead(n)}>
                  <CardContent className="flex items-start gap-2">
                    {!n.read_at && <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" />}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{n.title}</p>
                      <p className="text-sm text-muted-foreground">{n.body}</p>
                      {address && (
                        <a
                          href={`https://waze.com/ul?q=${encodeURIComponent(address)}&navigate=yes`}
                          target="_blank"
                          rel="noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="mt-1 inline-flex items-center gap-1 text-xs text-primary"
                        >
                          <MapPin className="size-3" /> Ouvrir dans Waze
                        </a>
                      )}
                      <p className="mt-1 text-[10px] text-muted-foreground">
                        {new Date(n.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        ))}
      </div>
    </Page>
  )
}
