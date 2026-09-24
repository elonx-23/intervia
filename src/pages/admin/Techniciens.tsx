import { Ban, CheckCircle2, Copy, Trash2 } from 'lucide-react'
import * as React from 'react'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
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
                Le technicien s'inscrit lui-même sur Intervia, choisit « Rejoindre une équipe » et entre ce
                code.
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
              {seatsFull && (
                <p className="text-xs text-destructive">
                  Nombre maximum de techniciens atteint pour votre formule.
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}
        {list === null && !error && <p className="py-8 text-center text-sm text-muted-foreground">Chargement…</p>}
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
