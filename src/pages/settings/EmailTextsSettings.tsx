import * as React from 'react'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Page } from '@/components/layout/Page'
import { useAuth } from '@/lib/auth'
import { friendlyError } from '@/lib/errors'
import { getEmailTexts, updateEmailTexts, type EmailTexts } from '@/lib/settings'

const EMPTY: EmailTexts = { devis: '', devisSigne: '', facture: '', factureAcquittee: '' }

// 4 scénarios distincts plutôt qu'un seul texte générique : le ton d'un
// premier envoi de devis n'est pas celui d'une confirmation de facture
// réglée. {numero}/{montant}/{client}/{entreprise} sont remplacés par les
// vraies valeurs du document à l'envoi (voir server/emailTemplates.mjs
// ::fillEmailText).
const FIELDS: { key: keyof EmailTexts; label: string; hint: string }[] = [
  { key: 'devis', label: 'Envoi de devis', hint: 'Quand un devis (pas encore signé) est envoyé au client.' },
  { key: 'devisSigne', label: 'Envoi de devis signé', hint: 'Quand un devis déjà signé est renvoyé/consulté.' },
  { key: 'facture', label: 'Envoi de facture', hint: "Quand une facture (pas encore réglée) est envoyée." },
  { key: 'factureAcquittee', label: 'Envoi de facture acquittée', hint: 'Quand une facture déjà réglée est envoyée.' },
]

export default function EmailTextsSettings() {
  const { session } = useAuth()
  const [form, setForm] = React.useState<EmailTexts>(EMPTY)
  const [loaded, setLoaded] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const [saved, setSaved] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!session) return
    getEmailTexts(session.sessionId)
      .then((t) => {
        setForm(t)
        setLoaded(true)
      })
      .catch((e) => setError(friendlyError(e, 'Erreur de chargement.')))
  }, [session])

  const save = async () => {
    if (!session) return
    setBusy(true)
    setError(null)
    setSaved(false)
    try {
      const updated = await updateEmailTexts(session.sessionId, form)
      setForm(updated)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (e) {
      setError(friendlyError(e, "Erreur lors de l'enregistrement."))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Page title="Emails">
      <div className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">
          Personnalise le message envoyé au client avec chaque devis/facture. Utilise{' '}
          <code className="rounded bg-secondary px-1 py-0.5 text-xs">{'{numero}'}</code>,{' '}
          <code className="rounded bg-secondary px-1 py-0.5 text-xs">{'{montant}'}</code>,{' '}
          <code className="rounded bg-secondary px-1 py-0.5 text-xs">{'{client}'}</code> et{' '}
          <code className="rounded bg-secondary px-1 py-0.5 text-xs">{'{entreprise}'}</code> — remplacés
          automatiquement à l'envoi.
        </p>

        {!loaded && !error && <p className="py-4 text-center text-sm text-muted-foreground">Chargement…</p>}

        {loaded &&
          FIELDS.map(({ key, label, hint }) => (
            <Card key={key}>
              <CardContent className="flex flex-col gap-2">
                <Label>{label}</Label>
                <p className="-mt-1 text-xs text-muted-foreground">{hint}</p>
                <Textarea
                  rows={3}
                  value={form[key]}
                  onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                />
              </CardContent>
            </Card>
          ))}

        {error && <p className="text-sm text-destructive">{error}</p>}
        {saved && <p className="text-sm text-success">Enregistré.</p>}

        {loaded && (
          <Button onClick={save} disabled={busy}>
            {busy ? 'Enregistrement…' : 'Enregistrer'}
          </Button>
        )}
      </div>
    </Page>
  )
}
