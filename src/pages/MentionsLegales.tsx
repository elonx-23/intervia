import { Card, CardContent } from '@/components/ui/card'
import { Page } from '@/components/layout/Page'
import { LEGAL_DOCUMENTS } from '@/lib/legalNotices'

// Textes réglementaires complets (droit de rétractation, arrêté du
// 24 janvier 2017 sur l'affichage des prix en dépannage) — trop longs pour
// être joints à chaque PDF, donc rassemblés ici et référencés depuis les
// devis/factures.
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
      </div>
    </Page>
  )
}
