import { Card, CardContent } from '@/components/ui/card'
import { Page } from '@/components/layout/Page'
import { COMPANY } from '@/lib/company'

// Générique, à ajuster si besoin — pas rédigé par un juriste. Reflète le
// fonctionnement réel de l'app : hébergement auto-géré (pas de cloud tiers
// pour les données), Stripe uniquement pour les paiements en ligne.
const SECTIONS = [
  {
    title: 'Responsable du traitement',
    body: `${COMPANY.name} est responsable des données traitées dans Intervia. L'application est auto-hébergée par l'entreprise — les données ne transitent pas par un service cloud tiers, à l'exception de Stripe pour les paiements en ligne.`,
  },
  {
    title: 'Données collectées',
    body: `Coordonnées des clients (nom, téléphone, adresse, email) saisies lors de la création d'une intervention, d'un devis ou d'une facture ; contenu des devis/factures (articles, montants, signature électronique, photos jointes) ; coordonnées des comptes administrateur et technicien utilisant l'application.`,
  },
  {
    title: 'Finalité',
    body: `Ces données sont utilisées exclusivement pour la gestion des interventions, l'établissement des devis et factures, leur envoi au client, et le suivi de l'activité de l'entreprise. Elles ne sont ni vendues ni partagées avec des tiers à des fins commerciales.`,
  },
  {
    title: 'Paiements en ligne (Stripe)',
    body: `Lorsqu'un client paie via un lien de paiement généré par l'application, la saisie de la carte bancaire est effectuée directement sur les pages sécurisées de Stripe — Intervia ne reçoit et ne stocke jamais le numéro de carte, seulement la confirmation du paiement.`,
  },
  {
    title: 'Conservation',
    body: `Les données sont conservées aussi longtemps que nécessaire à la gestion de la relation client et au respect des obligations comptables et fiscales applicables aux devis et factures.`,
  },
  {
    title: 'Droits des personnes concernées',
    body: `Toute personne dont les données sont traitées (client, technicien) peut demander l'accès, la rectification ou la suppression de ses données en contactant ${COMPANY.name}.`,
  },
]

export default function PrivacySettings() {
  return (
    <Page title="Politique de confidentialité">
      <Card>
        <CardContent className="flex flex-col gap-4">
          {SECTIONS.map((s, i) => (
            <div key={s.title} className="flex flex-col gap-1">
              <p className="text-sm font-medium">
                {i + 1}. {s.title}
              </p>
              <p className="text-sm text-muted-foreground">{s.body}</p>
            </div>
          ))}
        </CardContent>
      </Card>
    </Page>
  )
}
