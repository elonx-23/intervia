import { Page } from '@/components/layout/Page'
import { Card, CardContent } from '@/components/ui/card'
import { WhatsAppConnection } from '@/components/WhatsAppConnection'

// Réglages → WhatsApp : relier, changer ou déconnecter le WhatsApp qui envoie les fiches.
export default function WhatsAppSettings() {
  return (
    <Page title="WhatsApp">
      <Card>
        <CardContent>
          <WhatsAppConnection />
        </CardContent>
      </Card>
    </Page>
  )
}
