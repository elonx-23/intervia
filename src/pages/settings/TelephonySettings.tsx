import * as React from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader } from '@/components/Loader'
import { Page } from '@/components/layout/Page'
import { useAuth } from '@/lib/auth'
import { friendlyError } from '@/lib/errors'
import { getTelephonySettings, updateTelephonySettings, type TelephonySettings } from '@/lib/settings'

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

// Phase 1 du chantier téléphonie : saisie manuelle des identifiants Twilio
// (le numéro est acheté sur dashboard.twilio.com pour l'instant — la
// recherche/achat depuis l'app viendra dans une phase ultérieure) + la clé
// OpenAI utilisée plus tard pour transcrire les appels enregistrés (Whisper,
// nettement plus fiable en français que le moteur natif de Twilio).
export default function TelephonySettingsPage() {
  const { session } = useAuth()
  const [settings, setSettings] = React.useState<TelephonySettings | null>(null)
  const [accountSid, setAccountSid] = React.useState('')
  const [authToken, setAuthToken] = React.useState('')
  const [phoneNumber, setPhoneNumber] = React.useState('')
  const [forwardingNumber, setForwardingNumber] = React.useState('')
  const [openaiApiKey, setOpenaiApiKey] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [saved, setSaved] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const load = React.useCallback(() => {
    if (!session) return
    getTelephonySettings(session.sessionId)
      .then((s) => {
        setSettings(s)
        setAccountSid(s.accountSid)
        setPhoneNumber(s.phoneNumber)
        setForwardingNumber(s.forwardingNumber)
      })
      .catch((e) => setError(friendlyError(e, 'Erreur de chargement.')))
  }, [session])

  React.useEffect(() => {
    load()
  }, [load])

  const save = async () => {
    if (!session) return
    setBusy(true)
    setError(null)
    setSaved(false)
    try {
      await updateTelephonySettings(session.sessionId, {
        accountSid,
        authToken: authToken || undefined,
        phoneNumber,
        forwardingNumber,
        openaiApiKey: openaiApiKey || undefined,
      })
      setAuthToken('')
      setOpenaiApiKey('')
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
      load()
    } catch (e) {
      setError(friendlyError(e, "Erreur lors de l'enregistrement."))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Page title="Téléphonie">
      <div className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">
          Reçois les appels de tes clients sur un vrai numéro, transférés vers ton mobile, avec écoute et
          transcription écrite après coup. Fonctionne via Twilio (téléphonie) et OpenAI (transcription) — deux
          services tiers facturés à l'usage, pas inclus dans Intervia.
        </p>

        {!settings && !error && <Loader className="py-4" />}

        {settings && (
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
        )}

        {settings && !settings.configured && (
          <Card>
            <CardContent className="flex flex-col gap-4">
              <p className="text-sm font-semibold">Comment activer la téléphonie</p>
              <TutorialStep n={1}>
                Crée un compte sur{' '}
                <a href="https://www.twilio.com" target="_blank" rel="noreferrer" className="text-primary underline-offset-2 hover:underline">
                  twilio.com
                </a>
                , puis achète un numéro français (Phone Numbers → Buy a number, filtre France).
              </TutorialStep>
              <TutorialStep n={2}>
                Dans la console Twilio, copie le <strong>Account SID</strong> et l'<strong>Auth Token</strong> (page
                d'accueil du dashboard) et colle-les ci-dessous.
              </TutorialStep>
              <TutorialStep n={3}>
                Renseigne le numéro Twilio acheté et ton numéro de mobile réel (celui qui doit sonner quand un client
                appelle).
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
                pour la transcription des appels, et colle-la ci-dessous.
              </TutorialStep>
            </CardContent>
          </Card>
        )}

        {settings && (
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
                <Label>Numéro Twilio</Label>
                <Input value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)} placeholder="+33184xxxxxx" />
              </div>
              <div className="flex flex-col gap-2">
                <Label>Numéro de renvoi (ton mobile)</Label>
                <Input value={forwardingNumber} onChange={(e) => setForwardingNumber(e.target.value)} placeholder="+336xxxxxxxx" />
              </div>
              <div className="flex flex-col gap-2">
                <Label>Clé API OpenAI (transcription)</Label>
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
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}
        {saved && <p className="text-sm text-success">Enregistré.</p>}

        {settings && (
          <Button onClick={save} disabled={busy}>
            {busy ? 'Enregistrement…' : 'Enregistrer'}
          </Button>
        )}
      </div>
    </Page>
  )
}
