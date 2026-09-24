import type { DocumentItem } from '@/lib/documents'

export const ITEM_PRESETS: Record<string, DocumentItem[]> = {
  Plomberie: [
    { label: 'Déplacement + diagnostic', quantity: 1, unitPrice: 60, itemType: 'service' },
    { label: "Main d'œuvre plomberie", quantity: 1, unitPrice: 80, itemType: 'service' },
  ],
  Électricité: [
    { label: 'Déplacement + diagnostic', quantity: 1, unitPrice: 60, itemType: 'service' },
    { label: "Main d'œuvre électricité", quantity: 1, unitPrice: 80, itemType: 'service' },
  ],
  Serrurerie: [
    { label: 'Déplacement + diagnostic', quantity: 1, unitPrice: 60, itemType: 'service' },
    { label: "Ouverture de porte", quantity: 1, unitPrice: 120, itemType: 'service' },
  ],
  Chauffage: [
    { label: 'Déplacement + diagnostic', quantity: 1, unitPrice: 60, itemType: 'service' },
    { label: "Main d'œuvre chauffage", quantity: 1, unitPrice: 90, itemType: 'service' },
  ],
}

// Catalogue pour l'assistance à l'écriture (autocomplétion) sur le champ
// "Désignation" — le technicien tape, choisit une suggestion qui préremplit
// le nom, une description détaillée et un prix de départ, puis ajuste
// montant/quantité si besoin. Uniquement des prestations/articles de
// serrurerie.
export const ITEM_CATALOG: DocumentItem[] = [
  {
    label: 'Ouverture de porte claquée',
    description: 'Mise à disposition du matériel. Forfait d’ouverture de porte.',
    quantity: 1,
    unitPrice: 90,
    itemType: 'service',
  },
  {
    label: 'Ouverture de porte à clé cassée',
    description: 'Mise à disposition du matériel. Forfait d’ouverture de porte.',
    quantity: 1,
    unitPrice: 120,
    itemType: 'service',
  },
  {
    label: 'Ouverture de porte blindée',
    description: 'Mise à disposition du matériel. Forfait d’ouverture de porte blindée.',
    quantity: 1,
    unitPrice: 180,
    itemType: 'service',
  },
  {
    label: 'Ouverture de coffre-fort',
    description: 'Mise à disposition du matériel. Forfait d’ouverture de coffre-fort.',
    quantity: 1,
    unitPrice: 150,
    itemType: 'service',
  },
  {
    label: 'Changement de cylindre standard',
    description: "Dépose de l'ancien cylindre et pose du nouveau.",
    quantity: 1,
    unitPrice: 90,
    itemType: 'service',
  },
  {
    label: 'Changement de cylindre haute sécurité',
    description: "Dépose de l'ancien cylindre et pose d'un modèle certifié.",
    quantity: 1,
    unitPrice: 180,
    itemType: 'service',
  },
  {
    label: 'Cylindre standard',
    description: 'Fourni avec 3 clés.',
    quantity: 1,
    unitPrice: 35,
    itemType: 'materiel',
  },
  {
    label: 'Cylindre haute sécurité',
    description: 'Certifié A2P**. Fourni avec 5 clés et carte de reproduction. Système renforcé haute sûreté.',
    quantity: 1,
    unitPrice: 90,
    itemType: 'materiel',
  },
  {
    label: 'Serrure 3 points en applique',
    description: 'Certifiée A2P*. Fournie avec 3 clés. Système renforcé haute sûreté.',
    quantity: 1,
    unitPrice: 150,
    itemType: 'materiel',
  },
  {
    label: 'Serrure 3 points à larder',
    description: 'Certifiée A2P*. Fournie avec 3 clés. Système renforcé haute sûreté.',
    quantity: 1,
    unitPrice: 165,
    itemType: 'materiel',
  },
  {
    label: 'Serrure 5 points',
    description: 'Certifiée A2P***. Fournie avec 5 clés. Système renforcé haute sûreté.',
    quantity: 1,
    unitPrice: 220,
    itemType: 'materiel',
  },
  {
    label: 'Réparation de serrure',
    description: "Remise en état d'une serrure défectueuse.",
    quantity: 1,
    unitPrice: 80,
    itemType: 'service',
  },
  {
    label: 'Réparation de barillet',
    description: 'Remise en état ou remplacement du barillet.',
    quantity: 1,
    unitPrice: 70,
    itemType: 'service',
  },
  {
    label: 'Blindage de porte',
    description: "Renforcement complet de la porte contre l'effraction.",
    quantity: 1,
    unitPrice: 850,
    itemType: 'service',
  },
  {
    label: 'Pose de verrou supplémentaire',
    description: 'Installation d’un verrou additionnel.',
    quantity: 1,
    unitPrice: 95,
    itemType: 'service',
  },
  {
    label: 'Verrou de sécurité',
    description: 'Certifié A2P. Fourni avec 2 clés. Système renforcé haute sûreté.',
    quantity: 1,
    unitPrice: 40,
    itemType: 'materiel',
  },
  {
    label: 'Double de clé',
    description: "Reproduction d'une clé existante.",
    quantity: 1,
    unitPrice: 15,
    itemType: 'materiel',
  },
  {
    label: 'Carte magnétique / badge',
    description: 'Compatible avec les lecteurs standards.',
    quantity: 1,
    unitPrice: 25,
    itemType: 'materiel',
  },
  {
    label: 'Reprogrammation de digicode',
    description: "Mise à jour du code d'accès.",
    quantity: 1,
    unitPrice: 60,
    itemType: 'service',
  },
  {
    label: 'Poignée de porte',
    description: 'Finition laiton ou inox.',
    quantity: 1,
    unitPrice: 30,
    itemType: 'materiel',
  },
  {
    label: 'Réglage de porte sur bâti',
    description: "Ajustement de l'alignement, des paumelles et de la gâche pour une fermeture optimale.",
    quantity: 1,
    unitPrice: 70,
    itemType: 'service',
  },
  {
    label: 'Serrure carénée pour portail/garage',
    description: 'Corps renforcé anti-arrachement. Fournie avec 3 clés.',
    quantity: 1,
    unitPrice: 135,
    itemType: 'materiel',
  },
  {
    label: "Main d'œuvre — installation de serrure",
    description: 'Installation et réglage (hors fourniture). Déplacement inclus.',
    quantity: 1,
    unitPrice: 90,
    itemType: 'service',
  },
  {
    label: "Main d'œuvre serrurerie",
    description: 'Temps d’intervention, hors fourniture.',
    quantity: 1,
    unitPrice: 80,
    itemType: 'service',
  },
]

export function presetsFor(interventionType: string | null | undefined): DocumentItem[] {
  if (!interventionType) return []
  const key = Object.keys(ITEM_PRESETS).find(
    (k) => k.toLowerCase() === interventionType.toLowerCase(),
  )
  return key ? ITEM_PRESETS[key].map((i) => ({ ...i })) : []
}
