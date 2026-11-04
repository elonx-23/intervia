import { Page } from '@/components/layout/Page'
import { Card, CardContent } from '@/components/ui/card'
import { WhatsAppConnection } from '@/components/WhatsAppConnection'
import { WhatsAppContactsManager } from '@/components/WhatsAppContactsManager'
import { WhatsAppIcon } from '@/components/WhatsAppIcon'

// Réglages → WhatsApp : relier, changer ou déconnecter le WhatsApp qui envoie les fiches.
export default function WhatsAppSettings() {
  return (
    <Page title="WhatsApp">
      <div className="flex flex-col gap-4">
        <Card>
          <CardContent className="flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <WhatsAppIcon className="size-10" />
              <div>
                <p className="font-semibold">WhatsApp</p>
                <p className="text-xs text-muted-foreground">Envoi des fiches depuis ton WhatsApp</p>
              </div>
            </div>
            <WhatsAppConnection />
          </CardContent>
        </Card>

        <div className="mt-2 flex flex-col gap-1 px-1">
          <p className="text-lg font-bold">Mes destinataires</p>
          <p className="text-sm text-muted-foreground">
            Ceux qui reçoivent les fiches depuis le bouton « Envoyer ». ★ = favori, toujours en tête de liste.
          </p>
        </div>
        <WhatsAppContactsManager />
      </div>
    </Page>
  )
}
