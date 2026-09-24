import { Building2, Check, Plus } from 'lucide-react'
import * as React from 'react'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { CenteredDialogContent, Dialog, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { useAuth } from '@/lib/auth'
import { friendlyError } from '@/lib/errors'
import { getMemberships, getMyTeam, joinTeam, switchTeam, type MyTeam, type TeamMembership } from '@/lib/teams'

function TeamLogo({ logoUrl, size = 'md' }: { logoUrl: string | null; size?: 'sm' | 'md' | 'lg' }) {
  const dim = size === 'lg' ? 'size-14' : size === 'md' ? 'size-11' : 'size-8'
  const iconDim = size === 'lg' ? 'size-6' : size === 'md' ? 'size-5' : 'size-4'
  if (logoUrl) {
    return (
      <img
        src={logoUrl}
        alt=""
        className={`${dim} shrink-0 rounded-xl border border-border/60 object-cover`}
      />
    )
  }
  return (
    <div className={`flex ${dim} shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary`}>
      <Building2 className={iconDim} />
    </div>
  )
}

// Un admin gère une seule entreprise (la sienne) — pas de sélecteur, juste
// un rappel visuel non cliquable (logo + nom). S'il doit gérer une AUTRE
// entreprise, il se déconnecte et se reconnecte avec ce compte-là — pas de
// changement à la volée pour un admin, contrairement à un technicien.
function CurrentCompanyBadge() {
  const { session } = useAuth()
  const [team, setTeam] = React.useState<MyTeam | null>(null)

  React.useEffect(() => {
    if (!session) return
    getMyTeam(session.sessionId)
      .then(setTeam)
      .catch(() => {})
  }, [session])

  if (!team) return null

  return (
    <Card className="glass-strong">
      <CardContent className="flex items-center gap-3">
        <TeamLogo logoUrl={team.logoUrl} size="lg" />
        <div className="min-w-0 flex-1">
          <p className="text-xs text-muted-foreground">Mon entreprise</p>
          <p className="font-brand truncate text-2xl leading-tight font-bold">{team.name}</p>
        </div>
      </CardContent>
    </Card>
  )
}

// Un technicien freelance peut travailler pour plusieurs entreprises de
// dépannage — cette carte affiche en gros celle actuellement active (dont
// les données sont visibles dans le reste de l'app). Un tap ouvre un menu
// ancré directement sur la carte (pas une feuille plein écran), aussi large
// qu'elle, listant les autres équipes déjà rejointes, plus une option pour
// en rejoindre une nouvelle par code (ça, ça ouvre une petite boîte de
// dialogue dédiée, la saisie d'un code n'a pas sa place dans un menu).
// Aucune donnée interne (fiches, clients…) d'une autre équipe n'apparaît
// jamais ici — seulement son nom, son logo et sa formule, que l'utilisateur
// connaît déjà en tant que membre.
function TeamSwitcherDropdown() {
  const { session, updateSession } = useAuth()
  const [memberships, setMemberships] = React.useState<TeamMembership[] | null>(null)
  const [menuOpen, setMenuOpen] = React.useState(false)
  const [joinOpen, setJoinOpen] = React.useState(false)
  const [joinCode, setJoinCode] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const load = React.useCallback(async () => {
    if (!session) return
    try {
      setMemberships(await getMemberships(session.sessionId))
    } catch {
      // silencieux — la carte reste discrète si le chargement échoue
    }
  }, [session])

  React.useEffect(() => {
    load()
  }, [load])

  if (!session) return null

  const current = memberships?.find((m) => m.active)
  const others = memberships?.filter((m) => !m.active) ?? []

  const doSwitch = async (teamId: string) => {
    if (!session || busy) return
    setBusy(true)
    try {
      const next = await switchTeam(session.sessionId, teamId)
      updateSession(next)
      await load()
    } catch (e) {
      setError(friendlyError(e, 'Erreur.'))
    } finally {
      setBusy(false)
      setMenuOpen(false)
    }
  }

  const openJoinDialog = () => {
    setMenuOpen(false)
    setError(null)
    setJoinCode('')
    setJoinOpen(true)
  }

  const doJoin = async () => {
    if (!session || !joinCode.trim() || busy) return
    setBusy(true)
    setError(null)
    try {
      const next = await joinTeam(session.sessionId, joinCode.trim())
      updateSession(next)
      await load()
      setJoinOpen(false)
    } catch (e) {
      setError(friendlyError(e, 'Erreur.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
        <DropdownMenuTrigger asChild>
          <button type="button" className="w-full text-left" disabled={busy}>
            <Card className="glass-strong">
              <CardContent className="flex items-center gap-3">
                <TeamLogo logoUrl={current?.logoUrl ?? null} size="lg" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-muted-foreground">Équipe actuelle</p>
                  <p className="font-brand truncate text-2xl leading-tight font-bold">{current?.name ?? '—'}</p>
                </div>
              </CardContent>
            </Card>
          </button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="start" className="w-[var(--radix-dropdown-menu-trigger-width)]">
          {current && (
            <>
              <DropdownMenuLabel>Actuellement</DropdownMenuLabel>
              <DropdownMenuItem disabled className="justify-between opacity-100">
                <span className="flex min-w-0 items-center gap-2.5">
                  <TeamLogo logoUrl={current.logoUrl} size="md" />
                  <span className="font-brand truncate text-xl leading-tight font-bold text-foreground">
                    {current.name}
                  </span>
                </span>
                <Check className="size-5 shrink-0 text-primary" />
              </DropdownMenuItem>
            </>
          )}

          {others.length > 0 && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>Autres équipes rejointes</DropdownMenuLabel>
              {others.map((m) => (
                <DropdownMenuItem key={m.teamId} onSelect={() => doSwitch(m.teamId)}>
                  <span className="flex min-w-0 items-center gap-2.5">
                    <TeamLogo logoUrl={m.logoUrl} size="md" />
                    <span className="font-brand truncate text-xl leading-tight font-bold">{m.name}</span>
                  </span>
                </DropdownMenuItem>
              ))}
            </>
          )}

          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={openJoinDialog} className="text-primary">
            <Plus className="size-4" />
            Rejoindre une autre équipe
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={joinOpen} onOpenChange={setJoinOpen}>
        <CenteredDialogContent>
          <DialogHeader>
            <DialogTitle>Rejoindre une autre équipe</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">Entre le code d'équipe donné par l'administrateur.</p>
            <Input
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              placeholder="EX7K9QM"
              autoCapitalize="characters"
              autoFocus
              className="text-center font-mono tracking-[0.2em]"
            />
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button onClick={doJoin} disabled={busy || !joinCode.trim()}>
              {busy ? 'Connexion…' : 'Rejoindre'}
            </Button>
          </div>
        </CenteredDialogContent>
      </Dialog>
    </>
  )
}

// Le changement d'équipe à la volée n'a de sens que pour un technicien
// (potentiellement freelance, plusieurs entreprises) — un admin possède une
// seule entreprise (la sienne) et doit se reconnecter avec un autre compte
// pour en gérer une autre, jamais basculer depuis ce compte-ci.
export function TeamSwitcher() {
  const { session } = useAuth()
  if (!session) return null
  if (session.role === 'admin') return <CurrentCompanyBadge />
  if (session.role === 'technicien') return <TeamSwitcherDropdown />
  return null
}
