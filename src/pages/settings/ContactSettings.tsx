import { Mail, Phone } from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'
import { Page } from '@/components/layout/Page'
import { COMPANY } from '@/lib/company'

export default function ContactSettings() {
  return (
    <Page title="Nous contacter">
      <div className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">
          Une question sur une intervention, un devis ou une facture ? Contacte {COMPANY.name}.
        </p>

        <div className="flex flex-col gap-2">
          {COMPANY.phone && (
            <a href={`tel:${COMPANY.phone.replace(/\s/g, '')}`}>
              <Card className="liquid py-3">
                <CardContent className="flex items-center gap-3 px-4">
                  <Phone className="size-5 shrink-0 text-muted-foreground" />
                  <span className="text-sm font-medium">{COMPANY.phone}</span>
                </CardContent>
              </Card>
            </a>
          )}
          {COMPANY.email && (
            <a href={`mailto:${COMPANY.email}`}>
              <Card className="liquid py-3">
                <CardContent className="flex items-center gap-3 px-4">
                  <Mail className="size-5 shrink-0 text-muted-foreground" />
                  <span className="text-sm font-medium">{COMPANY.email}</span>
                </CardContent>
              </Card>
            </a>
          )}
          {!COMPANY.phone && !COMPANY.email && (
            <p className="text-sm text-muted-foreground">
              Aucune coordonnée renseignée pour l'instant — un administrateur peut les ajouter dans Réglages →
              Entreprise.
            </p>
          )}
        </div>
      </div>
    </Page>
  )
}
