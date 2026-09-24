import * as React from 'react'
import { Link } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { friendlyError } from '@/lib/errors'
import { forgotPassword } from '@/lib/signup'

export default function ForgotPassword() {
  const [email, setEmail] = React.useState('')
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [sent, setSent] = React.useState(false)

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      await forgotPassword(email.trim())
      setSent(true)
    } catch (e) {
      setError(friendlyError(e, 'Erreur.'))
    } finally {
      setLoading(false)
    }
  }

  if (sent) {
    return (
      <div className="flex min-h-svh flex-col items-center justify-center gap-4 px-6 text-center">
        <div
          className="glass-strong flex size-16 items-center justify-center rounded-3xl text-xl font-bold text-primary"
          style={{ '--elevation-shadow': '0 10px 30px -8px var(--primary)' } as React.CSSProperties}
        >
          ✓
        </div>
        <h1 className="text-lg font-semibold">Vérifie ta boîte mail</h1>
        <p className="max-w-xs text-sm text-muted-foreground">
          Si un compte existe pour <strong>{email}</strong>, un lien pour choisir un nouveau mot de passe vient de lui
          être envoyé.
        </p>
        <Button asChild variant="outline">
          <Link to="/login">Retour à la connexion</Link>
        </Button>
      </div>
    )
  }

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 px-4">
      <div className="text-center">
        <h1 className="text-xl font-semibold tracking-tight">Mot de passe oublié</h1>
        <p className="text-sm text-muted-foreground">On t'envoie un lien pour en choisir un nouveau.</p>
      </div>

      <Card className="w-full max-w-sm shadow-lg shadow-black/5">
        <CardContent>
          <form onSubmit={onSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" size="lg" disabled={loading || !email}>
              {loading ? 'Envoi…' : 'Envoyer le lien'}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Button asChild variant="ghost" size="sm">
        <Link to="/login">Retour à la connexion</Link>
      </Button>
    </div>
  )
}
