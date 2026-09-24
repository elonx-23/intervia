import { Card, CardContent } from '@/components/ui/card'
import { Page } from '@/components/layout/Page'
import { COMPANY } from '@/lib/company'

// Application interne (pas un service public) : ces conditions encadrent
// l'usage de l'outil par les comptes admin/technicien de l'entreprise, pas
// une relation avec des utilisateurs finaux payants. Générique, à ajuster
// si besoin — pas rédigé par un juriste.
const SECTIONS = [
  {
    title: 'Objet',
    body: `Intervia est un outil interne de gestion des interventions, devis et factures, mis à disposition des comptes administrateur et technicien de ${COMPANY.name}. Son usage est réservé aux personnes autorisées par l'entreprise.`,
  },
  {
    title: 'Comptes et accès',
    body: `Chaque compte (identifiant + code) est personnel et ne doit pas être partagé. L'administrateur peut créer, suspendre ou révoquer un accès à tout moment. Toute action effectuée depuis un compte est réputée effectuée par son titulaire.`,
  },
  {
    title: 'Usage autorisé',
    body: `L'application est destinée exclusivement à la gestion de l'activité de ${COMPANY.name} : suivi des interventions, création et signature de devis, émission et encaissement de factures, et fonctions associées. Toute utilisation à d'autres fins n'est pas autorisée.`,
  },
  {
    title: 'Paiements en ligne',
    body: `Les paiements par carte effectués via les liens de paiement générés par l'application sont traités par Stripe. Intervia ne stocke jamais de numéro de carte bancaire — voir la politique de confidentialité pour le détail des données conservées.`,
  },
  {
    title: 'Disponibilité',
    body: `L'application est hébergée par l'entreprise elle-même (pas de service tiers). Aucune garantie de disponibilité continue n'est apportée ; des interruptions peuvent survenir lors de maintenances.`,
  },
  {
    title: 'Modification des présentes conditions',
    body: `Ces conditions peuvent être mises à jour à tout moment par l'administrateur de l'application. La version en vigueur est celle affichée dans l'app.`,
  },
]

export default function TermsSettings() {
  return (
    <Page title="Conditions d'utilisation">
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
