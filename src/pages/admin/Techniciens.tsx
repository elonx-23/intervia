import { Ban, Check, CheckCircle2, Copy, Link2, MessageCircle, MessageSquare, Trash2 } from 'lucide-react'
import * as React from 'react'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Loader } from '@/components/Loader'
import { Page } from '@/components/layout/Page'
import { useAuth } from '@/lib/auth'
import { friendlyError } from '@/lib/errors'
import { getMyTeam, type MyTeam } from '@/lib/teams'
import { deleteTechnician, listTechnicians, setTechnicianActive, type Technician } from '@/lib/techniciansAdmin'

export default function Techniciens() {
  const { session } = useAuth()
  const [list, setList] = React.useState<Technician[] | null>(null)
  const [team, setTeam] = React.useState<MyTeam | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [copied, setCopied] = React.useState(false)
  const [linkCopied, setLinkCopied] = React.useState(false)

  const load = React.useCallback(async () => {
    if (!session) return
    try {
      const [technicians, myTeam] = await Promise.all([listTechnicians(session.sessionId), getMyTeam(session.sessionId)])
      setList(technicians)
      setTeam(myTeam)
    } catch (e) {
      setError(friendlyError(e, 'Erreur de chargement.'))
    }
  }, [session])

  React.useEffect(() => {
    load()
  }, [load])

  const copyJoinCode = async () => {
    if (!team) return
    try {
      await navigator.clipboard.writeText(team.joinCode)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // clipboard indisponible (contexte non sécurisé, permission refusée…) —
      // le code reste affiché à l'écran, l'utilisateur peut le copier à la main
    }
  }

  // Lien d'invitation : le technicien crée son compte avec le code déjà
  // rempli, et rejoint l'équipe dès qu'il confirme son email.
  const inviteLink = team ? `${window.location.origin}/inscription?code=${encodeURIComponent(team.joinCode)}` : ''
  const inviteText = team
    ? `Rejoins l'équipe ${team.name} sur Intervia : crée ton compte avec ce lien (le code de l'équipe est déjà rempli) ${inviteLink}`
    : ''
  const isApple = /iPhone|iPad|iPod/.test(navigator.userAgent)
  const copyInviteLink = async () => {
    try {
      await navigator.clipboard.writeText(inviteLink)
      setLinkCopied(true)
      setTimeout(() => setLinkCopied(false), 2000)
    } catch {
      // le lien reste affiché, copiable à la main
    }
  }

  const toggleActive = async (t: Technician) => {
    if (!session) return
    try {
      await setTechnicianActive(session.sessionId, t.id, !t.active)
      load()
    } catch (e) {
      setError(friendlyError(e, 'Erreur.'))
    }
  }

  const remove = async (t: Technician) => {
    if (!session || !confirm(`Supprimer ${t.first_name} ${t.last_name} ?`)) return
    try {
      await deleteTechnician(session.sessionId, t.id)
      load()
    } catch (e) {
      setError(friendlyError(e, 'Erreur.'))
    }
  }

  const seatsFull = team ? team.usedTechnicienSeats >= team.maxTechnicienSeats : false

  return (
    <Page title="Techniciens">
      <div className="flex flex-col gap-4">
        {team && (
          <Card className="glass-strong">
            <CardContent className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <p className="font-medium">Inviter un technicien</p>
                <span className={`text-xs ${seatsFull ? 'text-destructive' : 'text-muted-foreground'}`}>
                  {team.usedTechnicienSeats} / {team.maxTechnicienSeats} sièges
                </span>
              </div>
              <p className="text-sm text-muted-foreground">
                Envoie ce lien à ton technicien : il crée son compte, confirme son email et arrive directement dans ton équipe.
              </p>
              <div className="flex items-center gap-2 rounded-lg bg-secondary/60 px-3 py-2 text-xs">
                <Link2 className="size-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate">{inviteLink}</span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <Button variant="outline" size="sm" onClick={copyInviteLink}>
                  {linkCopied ? <Check className="size-4" /> : <Copy className="size-4" />} {linkCopied ? 'Copié' : 'Copier'}
                </Button>
                <Button variant="outline" size="sm" asChild>
                  <a href={`https://wa.me/?text=${encodeURIComponent(inviteText)}`} target="_blank" rel="noreferrer">
                    <MessageCircle className="size-4" /> WhatsApp
                  </a>
                </Button>
                <Button variant="outline" size="sm" asChild>
                  <a href={`sms:${isApple ? '&' : '?'}body=${encodeURIComponent(inviteText)}`}>
                    <MessageSquare className="size-4" /> SMS
                  </a>
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Il a déjà un compte ? Il entre simplement le code de l'équipe après s'être connecté :
              </p>
              <div className="flex items-center gap-2">
                <span className="flex-1 rounded-lg bg-secondary/60 px-3 py-2 text-center font-mono text-lg tracking-[0.2em]">
                  {team.joinCode}
                </span>
                <Button variant="outline" size="icon" onClick={copyJoinCode} aria-label="Copier le code">
                  <Copy className="size-4" />
                </Button>
              </div>
              {copied && <p className="text-xs text-success">Code copié !</p>}
              {seatsFull && <p className="text-xs text-destructive">Nombre maximum de techniciens atteint pour votre formule.</p>}
            </CardContent>
          </Card>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}
        {list === null && !error && <Loader className="py-8" />}
        {list?.length === 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Aucun technicien pour l'instant — partage le code ci-dessus pour en inviter un.
          </p>
        )}

        <div className="flex flex-col gap-3">
          {list?.map((t) => (
            <Card key={t.id}>
              <CardContent className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <p className="font-medium">
                    {t.first_name} {t.last_name}
                  </p>
                  <span className={`text-xs ${t.active ? 'text-success' : 'text-muted-foreground'}`}>
                    {t.active ? 'Actif' : 'En veille'}
                  </span>
                </div>
                {t.phone && <p className="text-sm text-muted-foreground">{t.phone}</p>}
                <div className="flex flex-wrap gap-1">
                  <Button variant="ghost" size="sm" onClick={() => toggleActive(t)}>
                    {t.active ? <Ban className="size-4" /> : <CheckCircle2 className="size-4" />}
                    {t.active ? 'Mettre en veille' : 'Réactiver'}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => remove(t)}>
                    <Trash2 className="size-4" /> Supprimer
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </Page>
  )
}
