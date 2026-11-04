import { Laptop, LogOut, MapPin, ShieldAlert, Smartphone } from 'lucide-react'
import * as React from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Page } from '@/components/layout/Page'
import { useAuth } from '@/lib/auth'
import { friendlyError } from '@/lib/errors'
import { disconnectDevice, getDevices, getLoginAttempts, type ConnectedDevice, type LoginAttemptsReport } from '@/lib/security'

function formatWhen(iso: string) {
  return new Date(iso).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

function lastSeen(iso: string) {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (minutes < 10) return 'Actif maintenant'
  if (minutes < 60) return `Actif il y a ${minutes} min`
  return `Dernière activité le ${formatWhen(iso)}`
}

// Appareils connectés au compte, avec ville approximative, et déconnexion.
function ConnectedDevices() {
  const { session, logout } = useAuth()
  const [devices, setDevices] = React.useState<ConnectedDevice[] | null>(null)
  const [busy, setBusy] = React.useState<string | null>(null)

  const load = React.useCallback(() => {
    if (!session) return
    getDevices(session.sessionId)
      .then(setDevices)
      .catch(() => setDevices([]))
  }, [session])
  React.useEffect(() => {
    load()
  }, [load])

  const disconnect = async (d: ConnectedDevice | 'autres') => {
    if (!session) return
    setBusy(d === 'autres' ? 'autres' : d.handle)
    try {
      await disconnectDevice(session.sessionId, d === 'autres' ? 'autres' : d.handle)
      if (d !== 'autres' && d.current) {
        logout()
        return
      }
      load()
    } finally {
      setBusy(null)
    }
  }

  const others = devices?.filter((d) => !d.current).length ?? 0

  return (
    <Card>
      <CardContent className="flex flex-col gap-3">
        <div>
          <p className="text-sm font-semibold">Appareils connectés à ton compte</p>
          <p className="text-xs text-muted-foreground">
            La ville est approximative (d'après l'adresse internet). Un appareil que tu ne reconnais pas ? Déconnecte-le et change ton mot de passe.
          </p>
        </div>
        {!devices && <p className="text-sm text-muted-foreground">Chargement…</p>}
        {devices?.map((d) => {
          const Icon = /iPhone|Android|Téléphone|iPad|Tablette/.test(d.device) ? Smartphone : Laptop
          return (
            <div key={d.handle} className="flex items-start gap-3 rounded-xl border border-border/60 px-3 py-2.5">
              <Icon className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-1.5 text-sm font-medium">
                  {d.device}
                  {d.current && (
                    <Badge variant="success" className="text-[10px]">
                      Cet appareil
                    </Badge>
                  )}
                </p>
                <p className="flex items-center gap-1 text-xs text-muted-foreground">
                  <MapPin className="size-3" />
                  {d.location ?? 'Position inconnue'}
                  {d.ip ? ` · ${d.ip}` : ''}
                </p>
                <p className="text-xs text-muted-foreground">
                  {lastSeen(d.lastSeenAt)} · connecté le {formatWhen(d.createdAt)}
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="shrink-0 text-destructive"
                disabled={busy !== null}
                onClick={() => disconnect(d)}
              >
                <LogOut className="size-4" />
                {d.current ? 'Me déconnecter' : 'Déconnecter'}
              </Button>
            </div>
          )
        })}
        {others > 0 && (
          <Button variant="outline" size="sm" className="w-fit text-destructive" disabled={busy !== null} onClick={() => disconnect('autres')}>
            Déconnecter tous les autres appareils ({others})
          </Button>
        )}
      </CardContent>
    </Card>
  )
}

export default function SecuritySettings() {
  const { session } = useAuth()
  const [report, setReport] = React.useState<LoginAttemptsReport | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!session) return
    getLoginAttempts(session.sessionId)
      .then(setReport)
      .catch((e) => setError(friendlyError(e, 'Erreur de chargement.')))
  }, [session])

  return (
    <Page title="Sécurité">
      <div className="flex flex-col gap-4">
        <ConnectedDevices />

        <Card>
          <CardContent className="flex flex-col gap-2">
            <p className="text-sm font-semibold">Tentatives de connexion échouées</p>
            <p className="text-xs text-muted-foreground">
              Chaque tentative de connexion (code technicien ou email/mot de passe) est limitée à 15 essais par
              15 minutes et par appareil, et journalisée ici pendant 30 jours.
            </p>
            {report && (
              <div className="mt-1">
                <Badge variant={report.failuresLast24h > 20 ? 'destructive' : report.failuresLast24h > 0 ? 'outline' : 'success'}>
                  {report.failuresLast24h} échec{report.failuresLast24h !== 1 ? 's' : ''} sur les dernières 24h
                </Badge>
              </div>
            )}
          </CardContent>
        </Card>

        {error && <p className="text-sm text-destructive">{error}</p>}

        {report && report.recentFailures.length === 0 && (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Aucune tentative échouée sur les 7 derniers jours.
          </p>
        )}

        {report && report.recentFailures.length > 0 && (
          <div className="flex flex-col gap-2">
            {report.recentFailures.map((a, i) => (
              <Card key={i}>
                <CardContent className="flex items-center gap-3 py-3">
                  <ShieldAlert className="size-4 shrink-0 text-destructive" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{a.identifier}</p>
                    <p className="text-xs text-muted-foreground">
                      {a.method === 'code' ? 'Code technicien' : a.method === 'password_change' ? 'Changement de mot de passe' : 'Email/mot de passe'} · {formatWhen(a.created_at)}
                      {a.ip ? ` · ${a.ip}` : ''}
                    </p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </Page>
  )
}
