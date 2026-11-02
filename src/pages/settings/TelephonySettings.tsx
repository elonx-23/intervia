import { Loader2, Phone, Trash2 } from 'lucide-react'
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
import {
  buyNumber,
  getTelephonySettings,
  listOwnedNumbers,
  releaseNumber,
  searchAvailableNumbers,
  updateTelephonySettings,
  type AvailableNumber,
  type OwnedNumber,
  type TelephonySettings,
} from '@/lib/telephony'

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

// Une fois les identifiants Twilio renseignés, tout le reste (chercher un
// numéro français, l'acheter, le libérer) se fait depuis cette page — jamais
// besoin d'ouvrir dashboard.twilio.com. Twilio reste le fournisseur réel
// derrière (aucun logiciel ne peut distribuer de vrais numéros de téléphone
// sans un opérateur télécom quelque part dans la chaîne), simplement rendu
// invisible dans l'usage courant.
export default function TelephonySettingsPage() {
  const { session } = useAuth()
  const [settings, setSettings] = React.useState<TelephonySettings | null>(null)
  const [accountSid, setAccountSid] = React.useState('')
  const [authToken, setAuthToken] = React.useState('')
  const [forwardingNumber, setForwardingNumber] = React.useState('')
  const [forwardingNumber2, setForwardingNumber2] = React.useState('')
  const [openaiApiKey, setOpenaiApiKey] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [saved, setSaved] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const [owned, setOwned] = React.useState<OwnedNumber[] | null>(null)
  const [available, setAvailable] = React.useState<AvailableNumber[] | null>(null)
  const [searching, setSearching] = React.useState(false)
  const [numberBusy, setNumberBusy] = React.useState<string | null>(null)
  const [numberError, setNumberError] = React.useState<string | null>(null)

  const load = React.useCallback(() => {
    if (!session) return
    getTelephonySettings(session.sessionId)
      .then((s) => {
        setSettings(s)
        setAccountSid(s.accountSid)
        setForwardingNumber(s.forwardingNumber)
        setForwardingNumber2(s.forwardingNumber2)
      })
      .catch((e) => setError(friendlyError(e, 'Erreur de chargement.')))
  }, [session])

  const loadOwned = React.useCallback(() => {
    if (!session) return
    listOwnedNumbers(session.sessionId)
      .then(setOwned)
      .catch(() => setOwned([]))
  }, [session])

  React.useEffect(() => {
    load()
  }, [load])

  React.useEffect(() => {
    if (settings?.configured) loadOwned()
  }, [settings?.configured, loadOwned])

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
      load()
    } catch (e) {
      setError(friendlyError(e, "Erreur lors de l'enregistrement."))
    } finally {
      setBusy(false)
    }
  }

  const search = async () => {
    if (!session) return
    setSearching(true)
    setNumberError(null)
    try {
      setAvailable(await searchAvailableNumbers(session.sessionId))
    } catch (e) {
      setNumberError(friendlyError(e, 'Erreur de recherche.'))
    } finally {
      setSearching(false)
    }
  }

  const buy = async (phoneNumber: string) => {
    if (!session) return
    setNumberBusy(phoneNumber)
    setNumberError(null)
    try {
      await buyNumber(session.sessionId, phoneNumber)
      setAvailable(null)
      loadOwned()
      load()
    } catch (e) {
      setNumberError(friendlyError(e, "Erreur lors de l'achat."))
    } finally {
      setNumberBusy(null)
    }
  }

  const release = async (sid: string) => {
    if (!session) return
    setNumberBusy(sid)
    setNumberError(null)
    try {
      await releaseNumber(session.sessionId, sid)
      loadOwned()
      load()
    } catch (e) {
      setNumberError(friendlyError(e, 'Erreur lors de la suppression.'))
    } finally {
      setNumberBusy(null)
    }
  }

  return (
    <Page title="Téléphonie">
      <div className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">
          Reçois les appels de tes clients sur un vrai numéro, transférés vers ton mobile, avec écoute et
          transcription écrite après coup. Fonctionne via Twilio (téléphonie) et OpenAI (transcription) — deux
          services tiers facturés à l'usage, pas inclus dans Intervia. Une fois connecté ci-dessous, tu cherches et
          achètes ton numéro directement sur cette page.
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
                </a>{' '}
                (gratuit à l'inscription, facturé ensuite à l'usage).
              </TutorialStep>
              <TutorialStep n={2}>
                Dans la console Twilio, copie le <strong>Account SID</strong> et l'<strong>Auth Token</strong> (page
                d'accueil du dashboard) et colle-les ci-dessous.
              </TutorialStep>
              <TutorialStep n={3}>
                Renseigne ton numéro de portable, et celui de ton associé si besoin : les deux sonneront quand un
                client appelle.
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
              <TutorialStep n={5}>
                Enregistre, puis plus bas sur cette page, cherche et achète ton numéro français — sans jamais quitter
                Intervia.
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
                <Label>Téléphone 1 (ton portable)</Label>
                <Input value={forwardingNumber} onChange={(e) => setForwardingNumber(e.target.value)} placeholder="06 12 34 56 78" />
              </div>
              <div className="flex flex-col gap-2">
                <Label>Téléphone 2 (associé, facultatif)</Label>
                <Input value={forwardingNumber2} onChange={(e) => setForwardingNumber2(e.target.value)} placeholder="06 98 76 54 32" />
                <p className="text-xs text-muted-foreground">
                  Les appels entrants sonnent sur les deux téléphones en même temps. Le premier qui décroche prend
                  l'appel, et seul celui-là est facturé.
                </p>
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

        {settings?.configured && (
          <Card>
            <CardContent className="flex flex-col gap-3">
              <p className="text-sm font-semibold">Tes numéros</p>
              {owned === null && <Loader className="py-2" />}
              {owned && owned.length === 0 && (
                <p className="text-sm text-muted-foreground">Aucun numéro acheté pour l'instant.</p>
              )}
              {owned?.map((n) => (
                <div key={n.sid} className="flex items-center justify-between gap-2 rounded-xl border border-border/60 px-3 py-2">
                  <div className="flex items-center gap-2 text-sm">
                    <Phone className="size-4 text-primary" />
                    <span className="font-medium">{n.phoneNumber}</span>
                    {n.phoneNumber === settings.phoneNumber && (
                      <Badge variant="success" className="text-[10px]">
                        Actif
                      </Badge>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive"
                    disabled={numberBusy === n.sid}
                    onClick={() => release(n.sid)}
                  >
                    {numberBusy === n.sid ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {settings?.configured && (
          <Card>
            <CardContent className="flex flex-col gap-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold">Acheter un numéro français</p>
                <Button variant="outline" size="sm" onClick={search} disabled={searching}>
                  {searching ? <Loader2 className="size-4 animate-spin" /> : 'Chercher'}
                </Button>
              </div>
              {numberError && <p className="text-sm text-destructive">{numberError}</p>}
              {available && available.length === 0 && (
                <p className="text-sm text-muted-foreground">Aucun numéro disponible pour l'instant, réessaie.</p>
              )}
              {available?.map((n) => (
                <div key={n.phoneNumber} className="flex items-center justify-between gap-2 rounded-xl border border-border/60 px-3 py-2">
                  <div className="text-sm">
                    <p className="font-medium">{n.phoneNumber}</p>
                    {(n.locality || n.region) && (
                      <p className="text-xs text-muted-foreground">{[n.locality, n.region].filter(Boolean).join(', ')}</p>
                    )}
                  </div>
                  <Button size="sm" disabled={numberBusy === n.phoneNumber} onClick={() => buy(n.phoneNumber)}>
                    {numberBusy === n.phoneNumber ? <Loader2 className="size-4 animate-spin" /> : 'Acheter'}
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    </Page>
  )
}
