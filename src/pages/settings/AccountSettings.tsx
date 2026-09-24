import * as React from 'react'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Page } from '@/components/layout/Page'
import { updateAccount } from '@/lib/account'
import { useAuth } from '@/lib/auth'
import { friendlyError } from '@/lib/errors'

export default function AccountSettings() {
  const { session, updateSession } = useAuth()
  const [form, setForm] = React.useState({
    firstName: session?.firstName ?? '',
    lastName: session?.lastName ?? '',
    email: session?.email ?? '',
    phone: session?.phone ?? '',
  })
  const [busy, setBusy] = React.useState(false)
  const [saved, setSaved] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const save = async () => {
    if (!session) return
    setBusy(true)
    setError(null)
    setSaved(false)
    try {
      const next = await updateAccount(session.sessionId, form)
      updateSession(next)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (e) {
      setError(friendlyError(e, 'Erreur lors de la mise à jour.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Page title="Mon compte">
      <div className="flex flex-col gap-4">
        <Card>
          <CardContent className="flex flex-col gap-3">
            <p className="text-xs text-muted-foreground">
              Identifiant de connexion : <span className="font-medium text-foreground">{session?.username}</span>
              {' · '}rôle {session?.role === 'admin' ? 'administrateur' : 'technicien'}
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-2">
                <Label>Prénom</Label>
                <Input value={form.firstName} onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))} />
              </div>
              <div className="flex flex-col gap-2">
                <Label>Nom</Label>
                <Input value={form.lastName} onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))} />
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <Label>Email</Label>
              <Input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
            </div>
            <div className="flex flex-col gap-2">
              <Label>Téléphone</Label>
              <Input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
            </div>
          </CardContent>
        </Card>

        {error && <p className="text-sm text-destructive">{error}</p>}
        {saved && <p className="text-sm text-success">Enregistré.</p>}

        <Button onClick={save} disabled={busy}>
          {busy ? 'Enregistrement…' : 'Enregistrer'}
        </Button>
      </div>
    </Page>
  )
}
