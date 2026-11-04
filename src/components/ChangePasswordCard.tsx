import { Check, Eye, EyeOff, KeyRound, Loader2, X } from 'lucide-react'
import * as React from 'react'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { changePassword } from '@/lib/account'
import { useAuth } from '@/lib/auth'
import { friendlyError } from '@/lib/errors'

// Mêmes règles que le serveur (password.mjs, passwordError).
const RULES: Array<{ label: string; ok: (p: string) => boolean }> = [
  { label: '6 caractères minimum', ok: (p) => p.length >= 6 },
  { label: 'Une majuscule', ok: (p) => /[A-Z]/.test(p) },
  { label: 'Un caractère spécial (@, &, !…)', ok: (p) => /[^A-Za-z0-9]/.test(p) },
]

function PasswordField({
  label,
  value,
  onChange,
  autoComplete,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  autoComplete: string
}) {
  const [visible, setVisible] = React.useState(false)
  return (
    <div className="flex flex-col gap-2">
      <Label>{label}</Label>
      <div className="relative">
        <Input type={visible ? 'text' : 'password'} autoComplete={autoComplete} value={value} onChange={(e) => onChange(e.target.value)} className="pr-11" />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          className="absolute top-1/2 right-2 flex size-8 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground"
          aria-label={visible ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
        >
          {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </button>
      </div>
    </div>
  )
}

// Réglages → Mon compte : ancien mot de passe obligatoire, nouveau saisi deux fois.
export function ChangePasswordCard() {
  const { session } = useAuth()
  const [current, setCurrent] = React.useState('')
  const [next, setNext] = React.useState('')
  const [confirm, setConfirm] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [done, setDone] = React.useState<string | null>(null)

  const rulesOk = RULES.every((r) => r.ok(next))
  const same = next.length > 0 && next === confirm
  const canSubmit = current.length > 0 && rulesOk && same && !busy

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!session || !canSubmit) return
    setBusy(true)
    setError(null)
    setDone(null)
    try {
      const r = await changePassword(session.sessionId, current, next, confirm)
      setCurrent('')
      setNext('')
      setConfirm('')
      setDone(
        r.disconnected > 0
          ? `Mot de passe changé. ${r.disconnected} autre${r.disconnected > 1 ? 's' : ''} appareil${r.disconnected > 1 ? 's' : ''} déconnecté${r.disconnected > 1 ? 's' : ''}.`
          : 'Mot de passe changé.',
      )
    } catch (err) {
      setError(friendlyError(err, 'Impossible de changer le mot de passe.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardContent>
        <form onSubmit={submit} className="flex flex-col gap-3">
          <p className="flex items-center gap-2 text-sm font-semibold">
            <KeyRound className="size-4 text-primary" /> Changer le mot de passe
          </p>
          <PasswordField label="Mot de passe actuel" value={current} onChange={setCurrent} autoComplete="current-password" />
          <PasswordField label="Nouveau mot de passe" value={next} onChange={setNext} autoComplete="new-password" />
          {next.length > 0 && (
            <ul className="flex flex-col gap-1 text-xs">
              {RULES.map((r) => (
                <li key={r.label} className={`flex items-center gap-1.5 ${r.ok(next) ? 'text-success' : 'text-muted-foreground'}`}>
                  {r.ok(next) ? <Check className="size-3.5" /> : <X className="size-3.5" />} {r.label}
                </li>
              ))}
            </ul>
          )}
          <PasswordField label="Confirme le nouveau mot de passe" value={confirm} onChange={setConfirm} autoComplete="new-password" />
          {confirm.length > 0 && (
            <p className={`flex items-center gap-1.5 text-xs ${same ? 'text-success' : 'text-destructive'}`}>
              {same ? <Check className="size-3.5" /> : <X className="size-3.5" />}
              {same ? 'Les deux mots de passe sont identiques' : 'Les deux mots de passe ne sont pas identiques'}
            </p>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}
          {done && <p className="text-sm text-success">{done}</p>}
          <Button type="submit" disabled={!canSubmit}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : 'Changer le mot de passe'}
          </Button>
          <p className="text-xs text-muted-foreground">Par sécurité, tes autres appareils seront déconnectés.</p>
        </form>
      </CardContent>
    </Card>
  )
}
