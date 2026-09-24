import { Building2, Crown, Gem, Sparkles, Users2 } from 'lucide-react'

import type { TeamPlan } from '@/lib/teams'

export type FormuleKey = TeamPlan | 'technicien'

export interface Formule {
  view: FormuleKey
  icon: typeof Users2
  title: string
  price: string
  pitch: string
  points: string[]
  accent: string
  accent2: string
  badge: number
  priceSize: number
}

// La couleur et la taille montent avec le prix — d'un coup d'œil, plus la
// bulle est grosse et vive, plus la formule engage. Partagé entre l'écran de
// choix post-inscription (NoTeamYet) et Réglages → Abonnement.
export const FORMULES: Formule[] = [
  {
    view: 'technicien',
    icon: Users2,
    title: 'Technicien',
    price: 'Gratuit',
    pitch: "Rejoins l'équipe d'une entreprise avec un code",
    points: [
      '**100% gratuit**, aucune carte bancaire',
      '**Tes fiches assignées** en un coup d’œil',
      'Devis/factures générés **automatiquement**',
      'Notification **push** dès qu’on t’assigne une fiche',
      'Itinéraire en **un tap** vers chaque intervention',
    ],
    accent: '#059669',
    accent2: '#34D399',
    badge: 44,
    priceSize: 14,
  },
  {
    view: 'solo',
    icon: Sparkles,
    title: 'Perso',
    price: '29,90€/mois',
    pitch: 'Un seul accès qui réunit tout — pour toi seul(e)',
    points: [
      'Remplace **ton carnet, ton tableur et ta facturation**',
      '**Devis → facture signée** en un clic',
      '**Paiement en ligne** encaissé directement',
      'Statistiques de ton **chiffre d’affaires**',
      '**Sauvegardes automatiques** de toutes tes données',
    ],
    accent: '#2563EB',
    accent2: '#60A5FA',
    badge: 54,
    priceSize: 17,
  },
  {
    view: 'entreprise',
    icon: Building2,
    title: 'Société',
    price: '59,90€/mois',
    pitch: 'Pilote une équipe entière',
    points: [
      'Tout Perso, pour **toute l’équipe**',
      '**1 accès admin + 2 accès technicien** inclus',
      'Répartition des interventions **en un geste**',
      'Suivi **en direct** de chaque technicien sur le terrain',
      'Tableau de bord du CA, **par technicien**',
    ],
    accent: '#7C3AED',
    accent2: '#C084FC',
    badge: 66,
    priceSize: 21,
  },
  {
    view: 'entreprise_plus',
    icon: Crown,
    title: 'Société+',
    price: '149,90€/mois',
    pitch: 'Pour les grosses équipes de dépannage',
    points: [
      'Tout Société, **en plus grand**',
      '**1 accès admin + 10 accès technicien** inclus',
      'Pensé pour les **équipes à forte activité**',
      'Support **prioritaire dédié**',
      'Statistiques **avancées** par technicien',
    ],
    accent: '#B45309',
    accent2: '#FDE047',
    badge: 78,
    priceSize: 24,
  },
  {
    view: 'ultra',
    icon: Gem,
    title: 'Ultra',
    price: '259,90€/mois',
    pitch: 'Techniciens illimités',
    points: [
      'Tout Société+, **sans limite**',
      'Accès technicien **illimité**',
      'Accompagnement **dédié** à la mise en place',
      'Accès **prioritaire** aux nouvelles fonctionnalités',
      'Facturation **sur-mesure** disponible',
    ],
    accent: '#DC2626',
    accent2: '#FCA5A5',
    badge: 90,
    priceSize: 28,
  },
]
