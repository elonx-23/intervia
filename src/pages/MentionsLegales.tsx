import { Card, CardContent } from '@/components/ui/card'
import { Page } from '@/components/layout/Page'
import { LEGAL_DOCUMENTS, TARIFF_GRID, TARIFF_GRID_NOTES } from '@/lib/legalNotices'

function formatEuros(n: number) {
  return `${n.toFixed(2).replace('.', ',')} €`
}

// Textes réglementaires complets (droit de rétractation, arrêté du
// 24 janvier 2017 sur l'affichage des prix en dépannage) — trop longs pour
// être joints à chaque PDF, donc rassemblés ici et référencés depuis les
// devis/factures. La grille tarifaire est affichée sur cette même page pour
// la même raison que l'arrêté ci-dessous l'exige explicitement (article 2) :
// un professionnel de dépannage doit rendre ses tarifs publics.
export default function MentionsLegales() {
  return (
    <Page title="Mentions légales">
      <div className="flex flex-col gap-4">
        {LEGAL_DOCUMENTS.map((doc) => (
          <Card key={doc.title}>
            <CardContent className="flex flex-col gap-3">
              <div>
                <p className="text-lg font-semibold">{doc.title}</p>
                {doc.subtitle && <p className="text-sm text-muted-foreground">{doc.subtitle}</p>}
              </div>
              {doc.articles.map((a) => (
                <div key={a.heading} className="flex flex-col gap-1 border-t border-border/60 pt-3">
                  <p className="text-sm font-medium">{a.heading}</p>
                  <p className="text-sm whitespace-pre-line text-muted-foreground">{a.body}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        ))}

        <Card>
          <CardContent className="flex flex-col gap-4">
            <div>
              <p className="text-lg font-semibold">Grille tarifaire des forfaits</p>
              <p className="text-sm text-muted-foreground">
                Tarifs indicatifs en euros. Le prix TTC affiché à droite correspond, dans l'ordre, au taux de TVA à
                10 % puis à 20 % selon la nature des travaux.
              </p>
            </div>
            {TARIFF_GRID.map((section) => (
              <div key={section.category} className="flex flex-col gap-2 border-t border-border/60 pt-3">
                <p className="text-sm font-medium">{section.category}</p>
                <div className="flex flex-col gap-2.5">
                  {section.rows.map((row) => (
                    <div key={row.label} className="flex items-start justify-between gap-3 text-sm">
                      <p className="min-w-0 flex-1">{row.label}</p>
                      <div className="shrink-0 text-right">
                        <p className="font-medium tabular-nums">{formatEuros(row.ht)} HT</p>
                        <p className="text-xs tabular-nums text-muted-foreground">
                          {formatEuros(row.tva10)} / {formatEuros(row.tva20)} TTC
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            <p className="whitespace-pre-line border-t border-border/60 pt-3 text-xs text-muted-foreground">
              {TARIFF_GRID_NOTES}
            </p>
          </CardContent>
        </Card>
      </div>
    </Page>
  )
}
