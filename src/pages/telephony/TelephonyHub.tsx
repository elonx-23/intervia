import { Hash, PhoneCall, Settings2 } from 'lucide-react'
import * as React from 'react'
import { useSearchParams } from 'react-router-dom'

import { Loader } from '@/components/Loader'
import { Page } from '@/components/layout/Page'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { useAuth } from '@/lib/auth'
import { friendlyError } from '@/lib/errors'
import { getTelephonySettings, type TelephonySettings } from '@/lib/telephony'

import { CallsPanel } from './CallsPanel'
import { NumbersPanel } from './NumbersPanel'
import { SettingsPanel } from './SettingsPanel'

type Tab = 'appels' | 'numeros' | 'reglages'

// L'espace Téléphonie, à part du reste de l'app : appels, numéros, réglages.
// L'onglet actif vit dans l'URL (?onglet=…) pour qu'un lien ou un retour
// arrière ramène au bon endroit.
export default function TelephonyHub() {
  const { session } = useAuth()
  const [params, setParams] = useSearchParams()
  const [settings, setSettings] = React.useState<TelephonySettings | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  const raw = params.get('onglet')
  const tab: Tab = raw === 'numeros' || raw === 'reglages' ? raw : 'appels'

  const loadSettings = React.useCallback(() => {
    if (!session) return
    getTelephonySettings(session.sessionId)
      .then(setSettings)
      .catch((e) => setError(friendlyError(e, 'Erreur de chargement.')))
  }, [session])

  React.useEffect(() => {
    loadSettings()
  }, [loadSettings])

  // Tant que rien n'est configuré, on ouvre directement les Réglages.
  React.useEffect(() => {
    if (settings && !settings.configured && !raw) setParams({ onglet: 'reglages' }, { replace: true })
  }, [settings, raw, setParams])

  return (
    <Page title="Téléphonie">
      <div className="flex flex-col gap-4">
        <SegmentedControl<Tab>
          value={tab}
          onChange={(v) => setParams({ onglet: v }, { replace: true })}
          options={[
            { value: 'appels', label: 'Appels', icon: PhoneCall },
            { value: 'numeros', label: 'Numéros', icon: Hash },
            { value: 'reglages', label: 'Réglages', icon: Settings2 },
          ]}
        />

        {error && <p className="text-sm text-destructive">{error}</p>}
        {!settings && !error && <Loader className="py-8" />}

        {settings && tab === 'appels' && <CallsPanel settings={settings} />}
        {settings && tab === 'numeros' && <NumbersPanel settings={settings} onChanged={loadSettings} />}
        {settings && tab === 'reglages' && (
          <SettingsPanel key={settings.accountSid + settings.forwardingNumber} settings={settings} onSaved={loadSettings} />
        )}
      </div>
    </Page>
  )
}
