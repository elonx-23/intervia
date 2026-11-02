import * as React from 'react'

import { Loader } from '@/components/Loader'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { useAuth } from '@/lib/auth'
import { friendlyError } from '@/lib/errors'
import { formatPhone, getTelephonySettings, updateTelephonySettings, type LegalInfo, type TelephonySettings } from '@/lib/telephony'

const LEGAL_FORMS: Array<{ value: string; label: string }> = [
  { value: 'individual', label: 'Entreprise individuelle / auto-entrepreneur' },
  { value: 'corporation', label: 'Société (SARL, SAS, EURL…)' },
  { value: 'association', label: 'Association' },
  { value: 'other', label: 'Autre' },
]

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <Label>{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}

// Onglet Réglages : où sonnent les appels, enregistrement, et les
// informations du titulaire (obligatoires pour attribuer un numéro 01).
export function SettingsPanel({ onSaved }: { onSaved: () => void }) {
  const { session } = useAuth()
  const [form, setForm] = React.useState<TelephonySettings | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [saved, setSaved] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!session) return
    getTelephonySettings(session.sessionId)
      .then((s) =>
        setForm({
          ...s,
          forwardingNumber: formatPhone(s.forwardingNumber),
          forwardingNumber2: formatPhone(s.forwardingNumber2),
        }),
      )
      .catch((e) => setError(friendlyError(e, 'Erreur de chargement.')))
  }, [session])

  if (!form) return error ? <p className="text-sm text-destructive">{error}</p> : <Loader className="py-8" />

  const setLegal = (key: keyof LegalInfo, value: string) => setForm((f) => (f ? { ...f, legal: { ...f.legal, [key]: value } } : f))
  const isIndividual = form.legal.legalform === 'individual'
  const siretDigits = form.legal.siret.replace(/s/g, '')

  const save = async () => {
    if (!session) return
    setBusy(true)
    setError(null)
    setSaved(false)
    try {
      await updateTelephonySettings(session.sessionId, form)
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
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
        <CardContent className="flex flex-col gap-3">
          <p className="text-sm font-semibold">Où sonnent les appels</p>
          <Field label="Téléphone 1 (ton portable)">
            <Input
              type="tel"
              inputMode="tel"
              value={form.forwardingNumber}
              onChange={(e) => setForm({ ...form, forwardingNumber: e.target.value })}
              placeholder="06 12 34 56 78"
            />
          </Field>
          <Field
            label="Téléphone 2 (associé, facultatif)"
            hint="Les deux téléphones sonnent en même temps : le premier qui décroche prend l'appel. Les appels renvoyés vers un mobile sont facturés à la seconde par l'opérateur, seulement quand quelqu'un décroche."
          >
            <Input
              type="tel"
              inputMode="tel"
              value={form.forwardingNumber2}
              onChange={(e) => setForm({ ...form, forwardingNumber2: e.target.value })}
              placeholder="06 98 76 54 32"
            />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-4">
          <p className="text-sm font-semibold">Enregistrement des appels</p>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 text-sm">
              <p className="font-medium">Enregistrer les appels reçus</p>
              <p className="text-muted-foreground">
                Permet de réécouter chaque appel, de le transcrire et de remplir la fiche d'intervention toute seule. L'appelant
                n'a rien à faire. En l'activant, tu acceptes les conditions du service d'enregistrement de l'opérateur et tu
                t'engages à informer tes appelants comme la réglementation l'exige (par exemple sur ton site). Les
                enregistrements sont conservés 60 jours.
              </p>
            </div>
            <Switch checked={form.recordingAccepted} onCheckedChange={(v) => setForm({ ...form, recordingAccepted: v })} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-3">
          <div>
            <p className="text-sm font-semibold">Titulaire des numéros</p>
            <p className="text-xs text-muted-foreground">
              La loi impose d'identifier l'entreprise à laquelle un numéro 01 est attribué. Ces informations ne servent qu'à
              l'attribution de tes numéros.
            </p>
          </div>
          <Field label="Forme juridique">
            <Select value={form.legal.legalform || undefined} onValueChange={(v) => setLegal('legalform', v)}>
              <SelectTrigger>
                <SelectValue placeholder="Choisir…" />
              </SelectTrigger>
              <SelectContent>
                {LEGAL_FORMS.map((f) => (
                  <SelectItem key={f.value} value={f.value}>
                    {f.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label={isIndividual ? 'Nom commercial (facultatif)' : 'Raison sociale'}>
            <Input value={form.legal.organisation} onChange={(e) => setLegal('organisation', e.target.value)} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field
              label={isIndividual ? 'SIRET (facultatif)' : 'SIRET'}
              hint={siretDigits.length > 0 && siretDigits.length !== 14 ? 'Il faut les 14 chiffres du SIRET (pas seulement le SIREN).' : undefined}
            >
              <Input inputMode="numeric" value={form.legal.siret} onChange={(e) => setLegal('siret', e.target.value)} placeholder="14 chiffres" />
            </Field>
            <Field label="Code APE / NAF">
              <Input value={form.legal.ape} onChange={(e) => setLegal('ape', e.target.value)} placeholder="4322A" />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Prénom du contact">
              <Input value={form.legal.firstname} onChange={(e) => setLegal('firstname', e.target.value)} />
            </Field>
            <Field label="Nom du contact">
              <Input value={form.legal.name} onChange={(e) => setLegal('name', e.target.value)} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="E-mail">
              <Input type="email" value={form.legal.email} onChange={(e) => setLegal('email', e.target.value)} />
            </Field>
            <Field label="Téléphone">
              <Input type="tel" inputMode="tel" value={form.legal.phone} onChange={(e) => setLegal('phone', e.target.value)} />
            </Field>
          </div>
          <div className="grid grid-cols-[5rem_1fr] gap-3">
            <Field label="N°">
              <Input value={form.legal.streetNumber} onChange={(e) => setLegal('streetNumber', e.target.value)} />
            </Field>
            <Field label="Rue">
              <Input value={form.legal.streetName} onChange={(e) => setLegal('streetName', e.target.value)} />
            </Field>
          </div>
          <div className="grid grid-cols-[7rem_1fr] gap-3">
            <Field label="Code postal">
              <Input inputMode="numeric" value={form.legal.zip} onChange={(e) => setLegal('zip', e.target.value)} />
            </Field>
            <Field label="Ville">
              <Input value={form.legal.city} onChange={(e) => setLegal('city', e.target.value)} />
            </Field>
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
