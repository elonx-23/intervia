import { Link } from 'react-router-dom'

import { Card, CardContent } from '@/components/ui/card'
import { Page } from '@/components/layout/Page'
import { APP_VERSION } from '@/lib/version'

export default function AboutSettings() {
  return (
    <Page title="À propos">
      <div className="flex flex-col gap-4">
        <Card>
          <CardContent className="flex flex-col items-center gap-1 py-6 text-center">
            <img src="/marketing/logo-mark.png" alt="Intervia" className="mb-2 size-14" />
            <p className="text-base font-semibold">Intervia</p>
            <p className="text-sm text-muted-foreground">Version {APP_VERSION}</p>
          </CardContent>
        </Card>

        <div className="flex flex-col gap-2">
          <Link to="/mentions-legales">
            <Card className="liquid py-3">
              <CardContent className="px-4 text-sm font-medium">Mentions légales</CardContent>
            </Card>
          </Link>
          <Link to="/reglages/conditions">
            <Card className="liquid py-3">
              <CardContent className="px-4 text-sm font-medium">Conditions d'utilisation</CardContent>
            </Card>
          </Link>
          <Link to="/reglages/confidentialite">
            <Card className="liquid py-3">
              <CardContent className="px-4 text-sm font-medium">Politique de confidentialité</CardContent>
            </Card>
          </Link>
        </div>

        <p className="px-1 text-center text-xs text-muted-foreground">
          © {new Date().getFullYear()} Intervia — application interne de gestion des interventions.
        </p>
      </div>
    </Page>
  )
}
