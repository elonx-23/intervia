import { Page } from '@/components/layout/Page'
import { Card, CardContent } from '@/components/ui/card'
import { WhatsAppConnection } from '@/components/WhatsAppConnection'
import { WhatsAppIcon } from '@/components/WhatsAppIcon'

// Réglages → WhatsApp : relier, changer ou déconnecter le WhatsApp qui envoie les fiches.
export default function WhatsAppSettings() {
  return (
    <Page title="WhatsApp">
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
    </Page>
  )
}
