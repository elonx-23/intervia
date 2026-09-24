import { Eye, EyeOff } from 'lucide-react'
import * as React from 'react'
import { Link, Navigate, useSearchParams } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuth } from '@/lib/auth'
import { friendlyError } from '@/lib/errors'
import { passwordError, resendVerificationEmail, signup } from '@/lib/signup'

export default function Inscription() {
  const { session } = useAuth()
  const [params] = useSearchParams()
  // ?apercu=1 affiche directement l'écran "vérifie ta boîte mail" — pour
  // pouvoir le retravailler ensemble sans repasser tout le formulaire à
  // chaque fois.
  const preview = params.get('apercu') === '1'
  const [firstName, setFirstName] = React.useState('')
  const [lastName, setLastName] = React.useState('')
  const [email, setEmail] = React.useState(preview ? 'prenom.nom@email.com' : '')
  const [password, setPassword] = React.useState('')
  const [confirmPassword, setConfirmPassword] = React.useState('')
  const [showPassword, setShowPassword] = React.useState(false)
  const [acceptCgv, setAcceptCgv] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [sent, setSent] = React.useState(preview)
  const [resent, setResent] = React.useState(false)

  if (session && !preview) return <Navigate to="/" replace />

  const pwError = password ? passwordError(password) : null
  const confirmError = confirmPassword && password !== confirmPassword ? 'Les mots de passe ne correspondent pas.' : null
  const canSubmit =
    firstName && lastName && email && password && confirmPassword && !pwError && !confirmError && acceptCgv

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (pwError) return setError(pwError)
    if (confirmError) return setError(confirmError)
    if (!acceptCgv) return setError('Merci d’accepter les conditions générales de vente pour continuer.')
    setLoading(true)
    try {
      await signup(email.trim(), password, firstName.trim(), lastName.trim())
      setSent(true)
    } catch (e) {
      setError(friendlyError(e, "Erreur lors de l'inscription."))
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
          On a envoyé un lien de confirmation à <strong>{email}</strong>. Clique dessus pour activer ton compte.
        </p>
        {resent ? (
          <p className="text-xs text-muted-foreground">Email renvoyé.</p>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              resendVerificationEmail(email).catch(() => {})
              setResent(true)
            }}
          >
            Renvoyer l'email
          </Button>
        )}
        <Button asChild variant="outline">
          <Link to="/login">Se connecter</Link>
        </Button>
      </div>
    )
  }

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 px-4 py-10">
      <div className="flex flex-col items-center gap-3">
        <div
          className="glass-strong flex size-16 items-center justify-center rounded-3xl text-xl font-bold text-primary"
          style={{ '--elevation-shadow': '0 10px 30px -8px var(--primary)' } as React.CSSProperties}
        >
          PSE
        </div>
        <div className="text-center">
          <h1 className="text-xl font-semibold tracking-tight">Créer un compte</h1>
          <p className="text-sm text-muted-foreground">Pour rejoindre une équipe ou créer la tienne</p>
        </div>
      </div>

      <Card className="w-full max-w-sm shadow-lg shadow-black/5">
        <CardContent>
          <form onSubmit={onSubmit} className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="flex min-w-0 flex-col gap-2">
                <Label htmlFor="firstName">Prénom</Label>
                <Input id="firstName" autoFocus value={firstName} onChange={(e) => setFirstName(e.target.value)} />
              </div>
              <div className="flex min-w-0 flex-col gap-2">
                <Label htmlFor="lastName">Nom</Label>
                <Input id="lastName" value={lastName} onChange={(e) => setLastName(e.target.value)} />
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="password">Mot de passe</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
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
              <div className="relative">
                <Input
                  id="confirmPassword"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  className="pr-10"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
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
              {confirmError && <p className="text-xs text-destructive">{confirmError}</p>}
            </div>

            <label className="flex items-start gap-2.5 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={acceptCgv}
                onChange={(e) => setAcceptCgv(e.target.checked)}
                className="mt-0.5 size-4 shrink-0 rounded border-input"
                style={{ accentColor: 'var(--primary)' }}
              />
              <span>
                J'accepte les{' '}
                <Link to="/reglages/conditions" target="_blank" className="text-primary underline underline-offset-2">
                  conditions générales de vente
                </Link>{' '}
                et la{' '}
                <Link
                  to="/reglages/confidentialite"
                  target="_blank"
                  className="text-primary underline underline-offset-2"
                >
                  politique de confidentialité
                </Link>
                .
              </span>
            </label>

            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button
              type="submit"
              size="lg"
              disabled={loading || !canSubmit}
            >
              {loading ? 'Création…' : 'Créer mon compte'}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Button asChild variant="ghost" size="sm">
        <Link to="/login">J'ai déjà un compte</Link>
      </Button>
    </div>
  )
}
