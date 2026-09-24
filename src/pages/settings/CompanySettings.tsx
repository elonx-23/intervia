import { Loader2, Trash2, Upload } from 'lucide-react'
import * as React from 'react'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Page } from '@/components/layout/Page'
import { apiUpload } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { applyCompanySettings } from '@/lib/company'
import { friendlyError } from '@/lib/errors'
import { getCompanySettings, updateCompanySettings, type CompanySettings } from '@/lib/settings'

const EMPTY: CompanySettings = {
  name: '',
  legalForm: '',
  address: '',
  siret: '',
  vatNumber: '',
  naf: '',
  vatRegime: '',
  phone: '',
  email: '',
  logoUrl: '',
}

export default function CompanyEditSettings() {
  const { session } = useAuth()
  const [form, setForm] = React.useState<CompanySettings>(EMPTY)
  const [loaded, setLoaded] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const [uploading, setUploading] = React.useState(false)
  const [saved, setSaved] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const fileRef = React.useRef<HTMLInputElement>(null)

  React.useEffect(() => {
    if (!session) return
    getCompanySettings(session.sessionId)
      .then((c) => {
        setForm(c)
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
      const updated = await updateCompanySettings(session.sessionId, form)
      applyCompanySettings(updated)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (e) {
      setError(friendlyError(e, "Erreur lors de l'enregistrement."))
    } finally {
      setBusy(false)
    }
  }

  const uploadLogo = async (file: File | undefined) => {
    if (!file || !session) return
    setUploading(true)
    setError(null)
    try {
      const url = await apiUpload(file, 'logo', session.sessionId)
      setForm((f) => ({ ...f, logoUrl: url }))
    } catch (e) {
      setError(friendlyError(e, "Erreur lors de l'envoi du logo."))
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const field = (key: keyof CompanySettings, label: string) => (
    <div className="flex flex-col gap-2">
      <Label>{label}</Label>
      <Input value={form[key]} onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))} />
    </div>
  )

  return (
    <Page title="Entreprise">
      <div className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">
          Ces informations apparaissent sur tous les devis et factures générés (PDF, mentions légales).
        </p>

        {!loaded && !error && <p className="py-4 text-center text-sm text-muted-foreground">Chargement…</p>}

        {loaded && (
          <Card>
            <CardContent className="flex flex-col gap-3">
              <Label>Logo</Label>
              <div className="flex items-center gap-3">
                <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-border bg-secondary/40">
                  {form.logoUrl ? (
                    <img src={form.logoUrl} alt="Logo" className="size-full object-contain" />
                  ) : (
                    <span className="text-xs text-muted-foreground">Aucun</span>
                  )}
                </div>
                <div className="flex flex-col gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => fileRef.current?.click()}
                    disabled={uploading}
                  >
                    {uploading ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
                    {form.logoUrl ? 'Changer le logo' : 'Ajouter un logo'}
                  </Button>
                  {form.logoUrl && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setForm((f) => ({ ...f, logoUrl: '' }))}
                    >
                      <Trash2 className="size-4" /> Retirer
                    </Button>
                  )}
                </div>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={(e) => uploadLogo(e.target.files?.[0])}
                />
              </div>
              <p className="-mt-1 text-xs text-muted-foreground">
                Utilisé sur les PDF de devis/factures à la place du logo par défaut. Format carré recommandé.
              </p>
            </CardContent>
          </Card>
        )}

        {loaded && (
          <Card>
            <CardContent className="flex flex-col gap-3">
              {field('name', 'Nom de la société')}
              {field('legalForm', 'Forme juridique (SARL, SAS…)')}
              {field('address', 'Adresse')}
              <div className="grid grid-cols-2 gap-3">
                {field('phone', 'Téléphone')}
                {field('email', 'Email')}
              </div>
              {field('siret', 'SIRET')}
              <div className="grid grid-cols-2 gap-3">
                {field('vatNumber', 'N° TVA intracommunautaire')}
                {field('naf', 'Code NAF')}
              </div>
              {field('vatRegime', 'Régime de TVA')}
            </CardContent>
          </Card>
        )}

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
