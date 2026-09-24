import { Eye, EyeOff } from 'lucide-react'
import * as React from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { friendlyError } from '@/lib/errors'
import { passwordError, resetPassword } from '@/lib/signup'

export default function ResetPassword() {
  const { token } = useParams<{ token: string }>()
  const navigate = useNavigate()
  const [password, setPassword] = React.useState('')
  const [confirmPassword, setConfirmPassword] = React.useState('')
  const [showPassword, setShowPassword] = React.useState(false)
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [done, setDone] = React.useState(false)

  const pwError = password ? passwordError(password) : null
  const confirmError = confirmPassword && password !== confirmPassword ? 'Les mots de passe ne correspondent pas.' : null

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (pwError) return setError(pwError)
    if (confirmError) return setError(confirmError)
    if (!token) return
    setLoading(true)
    try {
      await resetPassword(token, password)
      setDone(true)
    } catch (e) {
      setError(friendlyError(e, 'Lien invalide ou expiré.'))
    } finally {
      setLoading(false)
    }
  }

  if (done) {
    return (
      <div className="flex min-h-svh flex-col items-center justify-center gap-4 px-6 text-center">
        <div
          className="glass-strong flex size-16 items-center justify-center rounded-3xl text-xl font-bold text-primary"
          style={{ '--elevation-shadow': '0 10px 30px -8px var(--primary)' } as React.CSSProperties}
        >
          ✓
        </div>
        <h1 className="text-lg font-semibold">Mot de passe mis à jour</h1>
        <p className="max-w-xs text-sm text-muted-foreground">Tu peux te connecter avec ton nouveau mot de passe.</p>
        <Button onClick={() => navigate('/login')}>Se connecter</Button>
      </div>
    )
  }

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 px-4">
      <div className="text-center">
        <h1 className="text-xl font-semibold tracking-tight">Nouveau mot de passe</h1>
        <p className="text-sm text-muted-foreground">Choisis un mot de passe pour ton compte.</p>
      </div>

      <Card className="w-full max-w-sm shadow-lg shadow-black/5">
        <CardContent>
          <form onSubmit={onSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="password">Nouveau mot de passe</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  autoFocus
                  className="pr-10"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                  className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted-foreground"
                >
                  {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
              <p className="text-xs text-muted-foreground">
                6 caractères minimum, une majuscule et un caractère spécial (@, &, …).
              </p>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="confirmPassword">Confirmer le mot de passe</Label>
              <Input
                id="confirmPassword"
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
              {confirmError && <p className="text-xs text-destructive">{confirmError}</p>}
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" size="lg" disabled={loading || !password || !confirmPassword}>
              {loading ? 'Mise à jour…' : 'Mettre à jour le mot de passe'}
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
