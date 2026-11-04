import { CheckCircle2, Loader2, MessageCircle, Smartphone } from 'lucide-react'
import * as React from 'react'

import { Button } from '@/components/ui/button'
import { useLiveEvents } from '@/hooks/useLiveEvents'
import { useAuth } from '@/lib/auth'
import { friendlyError } from '@/lib/errors'
import { connectSession, getSession, logoutSession, type WhatsAppSession } from '@/lib/whatsapp'

// État du WhatsApp relié à l'app (toujours à jour, en direct).
export function useWhatsAppSession() {
  const { session } = useAuth()
  const [wa, setWa] = React.useState<WhatsAppSession | null>(null)
  const load = React.useCallback(() => {
    if (!session) return
    getSession(session.sessionId)
      .then(setWa)
      .catch(() => {})
  }, [session])
  React.useEffect(() => {
    load()
  }, [load])
  useLiveEvents(['whatsapp_changed'], load)
  // Le QR code change toutes les ~20 s : on relit l'état tant qu'il est affiché.
  React.useEffect(() => {
    if (wa?.status !== 'qr' && wa?.status !== 'connexion') return
    const t = setInterval(load, 3000)
    return () => clearInterval(t)
  }, [wa?.status, load])
  return { wa, reload: load }
}

const formatNumber = (n: string) => (n.startsWith('33') && n.length === 11 ? `0${n.slice(2)}`.replace(/(\d{2})(?=\d)/g, '$1 ') : `+${n}`)

// Relier / changer / déconnecter son WhatsApp, par QR code (comme WhatsApp Web).
export function WhatsAppConnection() {
  const { session } = useAuth()
  const { wa, reload } = useWhatsAppSession()
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const run = async (action: (sessionId: string) => Promise<unknown>) => {
    if (!session) return
    setBusy(true)
    setError(null)
    try {
      await action(session.sessionId)
      reload()
    } catch (e) {
      setError(friendlyError(e, 'Erreur, réessaie.'))
    } finally {
      setBusy(false)
    }
  }

  if (!wa) return <Loader2 className="size-5 animate-spin text-muted-foreground" />

  return (
    <div className="flex flex-col gap-3">
      {wa.status === 'connecte' && (
        <>
          <p className="flex items-center gap-2 text-sm font-medium">
            <CheckCircle2 className="size-5 text-success" />
            WhatsApp relié{wa.me ? ` : ${wa.me.name ? `${wa.me.name} · ` : ''}${formatNumber(wa.me.number)}` : ''}
          </p>
          <p className="text-xs text-muted-foreground">Les fiches partent directement depuis ce WhatsApp, un message toutes les quelques secondes.</p>
          <Button
            variant="outline"
            size="sm"
            className="w-fit"
            disabled={busy}
            onClick={() => run(async (id) => {
              await logoutSession(id)
              await connectSession(id)
            })}
          >
            Changer de WhatsApp
          </Button>
          <Button variant="ghost" size="sm" className="w-fit text-destructive" disabled={busy} onClick={() => run(logoutSession)}>
            Déconnecter
          </Button>
        </>
      )}

      {wa.status === 'qr' && wa.qr && (
        <>
          <img src={wa.qr} alt="QR code WhatsApp" className="size-60 self-center rounded-xl bg-white p-2" />
          <ol className="flex list-decimal flex-col gap-1 pl-5 text-sm">
            <li>Ouvre WhatsApp sur ton téléphone.</li>
            <li>
              Va dans <b>Réglages</b> (iPhone) ou <b>⋮</b> (Android), puis <b>Appareils connectés</b>.
            </li>
            <li>
              Appuie sur <b>Connecter un appareil</b> et scanne ce QR code.
            </li>
          </ol>
        </>
      )}

      {wa.status === 'connexion' && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Connexion à WhatsApp…
        </p>
      )}

      {wa.status === 'deconnecte' && (
        <>
          <p className="flex items-center gap-2 text-sm">
            <Smartphone className="size-5 text-muted-foreground" /> Aucun WhatsApp relié.
          </p>
          <Button className="w-fit" disabled={busy} onClick={() => run(connectSession)}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : <MessageCircle className="size-4" />}
            Relier mon WhatsApp
          </Button>
        </>
      )}

      <p className="text-xs text-muted-foreground">
        Liaison non officielle (comme WhatsApp Web) : WhatsApp peut bloquer un numéro qui envoie beaucoup de messages à des inconnus.
        N'envoie qu'à tes contacts habituels.
      </p>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  )
}
