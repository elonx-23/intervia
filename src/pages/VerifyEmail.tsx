import * as React from 'react'
import { Link, useParams } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { friendlyError } from '@/lib/errors'
import { verifyEmail } from '@/lib/signup'

export default function VerifyEmail() {
  const { token } = useParams<{ token: string }>()
  const [state, setState] = React.useState<'loading' | 'ok' | 'error'>('loading')
  const [error, setError] = React.useState<string | null>(null)
  const [team, setTeam] = React.useState<string | null>(null)
  const [joinError, setJoinError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!token) return
    verifyEmail(token)
      .then((r) => {
        setTeam(r.team ?? null)
        setJoinError(r.joinError ?? null)
        setState('ok')
      })
      .catch((e) => {
        setError(friendlyError(e, 'Lien de vérification invalide ou expiré.'))
        setState('error')
      })
  }, [token])

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-4 px-6 text-center">
      {state === 'loading' && <p className="text-sm text-muted-foreground">Vérification en cours…</p>}

      {state === 'ok' && (
        <>
          <div
            className="glass-strong flex size-16 items-center justify-center rounded-3xl text-xl font-bold text-primary"
            style={{ '--elevation-shadow': '0 10px 30px -8px var(--primary)' } as React.CSSProperties}
          >
            ✓
          </div>
          <h1 className="text-lg font-semibold">Email confirmé</h1>
          {team ? (
            <p className="max-w-xs text-sm text-muted-foreground">
              Tu as rejoint l'équipe <strong className="text-foreground">{team}</strong>. Connecte-toi pour commencer.
            </p>
          ) : (
            <p className="max-w-xs text-sm text-muted-foreground">Ton compte est actif, tu peux maintenant te connecter.</p>
          )}
          {joinError && <p className="max-w-xs text-sm text-destructive">{joinError} Tu pourras entrer le bon code après connexion.</p>}
          <Button asChild size="lg">
            <Link to="/login">Se connecter</Link>
          </Button>
        </>
      )}

      {state === 'error' && (
        <>
          <h1 className="text-lg font-semibold">Lien invalide</h1>
          <p className="max-w-xs text-sm text-muted-foreground">{error}</p>
          <Button asChild variant="outline">
            <Link to="/inscription">Recommencer l'inscription</Link>
          </Button>
        </>
      )}
    </div>
  )
}
