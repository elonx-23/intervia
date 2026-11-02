import * as React from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuth } from '@/lib/auth'
import { friendlyError } from '@/lib/errors'
import { updateTelephonySettings, type TelephonySettings } from '@/lib/telephony'

function TutorialStep({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
        {n}
      </span>
      <p className="text-sm text-muted-foreground">{children}</p>
    </div>
  )
}

// Onglet Réglages de l'espace Téléphonie : identifiants Twilio + OpenAI et
// les deux téléphones de renvoi. Jamais d'auth token ni de clé OpenAI
// relus en clair (le serveur ne renvoie que "configuré ou non").
export function SettingsPanel({ settings, onSaved }: { settings: TelephonySettings; onSaved: () => void }) {
  const { session } = useAuth()
  const [accountSid, setAccountSid] = React.useState(settings.accountSid)
  const [authToken, setAuthToken] = React.useState('')
  const [forwardingNumber, setForwardingNumber] = React.useState(settings.forwardingNumber)
  const [forwardingNumber2, setForwardingNumber2] = React.useState(settings.forwardingNumber2)
  const [openaiApiKey, setOpenaiApiKey] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [saved, setSaved] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const save = async () => {
    if (!session) return
    setBusy(true)
    setError(null)
    setSaved(false)
    try {
      await updateTelephonySettings(session.sessionId, {
        accountSid,
        authToken: authToken || undefined,
        forwardingNumber,
        forwardingNumber2,
        openaiApiKey: openaiApiKey || undefined,
      })
      setAuthToken('')
      setOpenaiApiKey('')
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
      onSaved()
    } catch (e) {
      setError(friendlyError(e, "Erreur lors de l'enregistrement."))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardContent className="flex flex-col gap-2">
          <p className="text-sm font-semibold">Statut</p>
          {settings.configured ? (
            <Badge variant="success" className="w-fit">
              Connecté
            </Badge>
          ) : (
            <p className="text-sm text-muted-foreground">Non configuré pour l'instant.</p>
          )}
        </CardContent>
      </Card>

      {!settings.configured && (
        <Card>
          <CardContent className="flex flex-col gap-4">
            <p className="text-sm font-semibold">Comment activer la téléphonie</p>
            <TutorialStep n={1}>
              Crée un compte sur{' '}
              <a href="https://www.twilio.com" target="_blank" rel="noreferrer" className="text-primary underline-offset-2 hover:underline">
                twilio.com
              </a>{' '}
              (gratuit à l'inscription, facturé ensuite à l'usage).
            </TutorialStep>
            <TutorialStep n={2}>
              Dans la console Twilio, copie le <strong>Account SID</strong> et l'<strong>Auth Token</strong> (page
              d'accueil du dashboard) et colle-les ci-dessous.
            </TutorialStep>
            <TutorialStep n={3}>
              Renseigne ton numéro de portable, et celui de ton associé si besoin : les deux sonneront quand un client
              appelle.
            </TutorialStep>
            <TutorialStep n={4}>
              Crée une clé sur{' '}
              <a
                href="https://platform.openai.com/api-keys"
                target="_blank"
                rel="noreferrer"
                className="text-primary underline-offset-2 hover:underline"
              >
                platform.openai.com
              </a>{' '}
              : elle sert à transcrire les appels et à remplir les fiches d'intervention toute seule.
            </TutorialStep>
            <TutorialStep n={5}>Enregistre, puis achète ton numéro 01 dans l'onglet Numéros.</TutorialStep>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-col gap-2">
            <Label>Account SID Twilio</Label>
            <Input value={accountSid} onChange={(e) => setAccountSid(e.target.value)} placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" />
          </div>
          <div className="flex flex-col gap-2">
            <Label>Auth Token Twilio</Label>
            <Input
              type="password"
              value={authToken}
              onChange={(e) => setAuthToken(e.target.value)}
              placeholder={settings.hasAuthToken ? 'Laisser vide pour ne pas changer' : 'Auth token'}
              autoComplete="off"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label>Téléphone 1 (ton portable)</Label>
            <Input value={forwardingNumber} onChange={(e) => setForwardingNumber(e.target.value)} placeholder="06 12 34 56 78" />
          </div>
          <div className="flex flex-col gap-2">
            <Label>Téléphone 2 (associé, facultatif)</Label>
            <Input value={forwardingNumber2} onChange={(e) => setForwardingNumber2(e.target.value)} placeholder="06 98 76 54 32" />
            <p className="text-xs text-muted-foreground">
              Les appels entrants sonnent sur les deux téléphones en même temps. Le premier qui décroche prend l'appel,
              et seul celui-là est facturé.
            </p>
          </div>
          <div className="flex flex-col gap-2">
            <Label>Clé API OpenAI (transcription + fiches automatiques)</Label>
            <Input
              type="password"
              value={openaiApiKey}
              onChange={(e) => setOpenaiApiKey(e.target.value)}
              placeholder={settings.hasOpenaiKey ? 'Laisser vide pour ne pas changer' : 'sk-…'}
              autoComplete="off"
            />
          </div>
        </CardContent>
      </Card>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {saved && <p className="text-sm text-success">Enregistré.</p>}

      <Button onClick={save} disabled={busy}>
        {busy ? 'Enregistrement…' : 'Enregistrer'}
      </Button>
    </div>
  )
}
