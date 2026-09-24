import * as React from 'react'

import { Card, CardContent } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { Page } from '@/components/layout/Page'
import { useAuth } from '@/lib/auth'
import { friendlyError } from '@/lib/errors'
import { getNotificationPrefs, setNotificationPref } from '@/lib/notifications'

// Libellés pour tous les types possibles — le serveur ne renvoie que ceux
// qui concernent le rôle de l'appelant (l'admin en a plus qu'un technicien,
// voir server/notify.mjs), donc cette page s'adapte automatiquement sans
// avoir besoin de connaître le rôle ici.
const LABELS: Record<string, { label: string; description: string }> = {
  intervention_assignee: {
    label: 'Nouvelle intervention assignée',
    description: "Quand l'admin te confie une fiche",
  },
  urgent: {
    label: 'Messages urgents',
    description: "Alertes diffusées par l'admin à tous les techniciens",
  },
  devis_signe: {
    label: 'Devis signé',
    description: 'Quand un client signe un devis',
  },
  facture_signee: {
    label: 'Facture signée',
    description: 'Quand un client signe une facture',
  },
  facture_creee: {
    label: 'Nouvelle facture à encaisser',
    description: 'Quand un devis est transformé en facture',
  },
  facture_payee_stripe: {
    label: 'Facture payée en ligne',
    description: 'Quand un client paie via un lien ou QR code Stripe',
  },
}

export default function NotificationSettings() {
  const { session } = useAuth()
  const [prefs, setPrefs] = React.useState<Record<string, boolean> | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!session) return
    getNotificationPrefs(session.sessionId)
      .then(setPrefs)
      .catch((e) => setError(friendlyError(e, 'Erreur de chargement.')))
  }, [session])

  const toggle = async (type: string, enabled: boolean) => {
    if (!session || !prefs) return
    setPrefs({ ...prefs, [type]: enabled })
    try {
      await setNotificationPref(session.sessionId, type, enabled)
    } catch (e) {
      setPrefs((p) => (p ? { ...p, [type]: !enabled } : p))
      setError(friendlyError(e, 'Erreur.'))
    }
  }

  return (
    <Page title="Notifications">
      <div className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">
          Choisis les notifications que tu veux recevoir, en push comme dans la liste.
        </p>
        {error && <p className="text-sm text-destructive">{error}</p>}
        {!prefs && !error && <p className="py-6 text-center text-sm text-muted-foreground">Chargement…</p>}
        {prefs && (
          <div className="flex flex-col gap-2">
            {Object.entries(prefs).map(([type, enabled]) => {
              const meta = LABELS[type] ?? { label: type, description: '' }
              return (
                <Card key={type} className="py-3">
                  <CardContent className="flex items-center gap-3 px-4">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{meta.label}</p>
                      {meta.description && <p className="text-xs text-muted-foreground">{meta.description}</p>}
                    </div>
                    <Switch checked={enabled} onCheckedChange={(v) => toggle(type, v)} />
                  </CardContent>
                </Card>
              )
            })}
          </div>
        )}
      </div>
    </Page>
  )
}
