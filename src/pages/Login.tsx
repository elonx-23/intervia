import { Eye, EyeOff } from 'lucide-react'
import * as React from 'react'
import { Link, Navigate } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuth } from '@/lib/auth'
import { resendVerificationEmail } from '@/lib/signup'

export default function Login() {
  const { session, loginEmail, loading } = useAuth()

  const [email, setEmail] = React.useState('')
  const [password, setPassword] = React.useState('')
  const [showPassword, setShowPassword] = React.useState(false)
  const [emailError, setEmailError] = React.useState<string | null>(null)
  const [resent, setResent] = React.useState(false)

  if (session) return <Navigate to="/" replace />

  const onSubmitEmail = async (e: React.FormEvent) => {
    e.preventDefault()
    setEmailError(null)
    setResent(false)
    const result = await loginEmail(email, password)
    if (!result.ok) setEmailError(result.error)
  }

  const needsVerification = emailError?.includes('Vérifie ton adresse email')

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 px-4">
      <div className="flex flex-col items-center gap-3">
        <img src="/marketing/logo-mark.png" alt="Intervia" className="size-16 drop-shadow-md" />
        <div className="text-center">
          <h1 className="text-xl font-semibold tracking-tight">Intervia</h1>
          <p className="text-sm text-muted-foreground">Connecte-toi pour continuer</p>
        </div>
      </div>

      <Card className="w-full max-w-sm shadow-lg shadow-black/5">
        <CardContent>
          <form onSubmit={onSubmitEmail} className="flex flex-col gap-4">
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
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Mot de passe</Label>
                <Link to="/mot-de-passe-oublie" className="text-xs text-primary underline-offset-2 hover:underline">
                  Mot de passe oublié ?
                </Link>
              </div>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
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
            </div>
            {emailError && <p className="text-sm text-destructive">{emailError}</p>}
            {needsVerification &&
              (resent ? (
                <p className="text-center text-xs text-muted-foreground">Email renvoyé.</p>
              ) : (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    resendVerificationEmail(email).catch(() => {})
                    setResent(true)
                  }}
                >
                  Renvoyer l'email de vérification
                </Button>
              ))}
            <Button type="submit" size="lg" disabled={loading || !email || !password}>
              {loading ? 'Connexion…' : 'Se connecter'}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Button asChild variant="ghost" size="sm">
        <Link to="/inscription">Créer un compte</Link>
      </Button>
    </div>
  )
}
