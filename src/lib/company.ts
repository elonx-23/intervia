// Valeurs par défaut tant que rien n'a été configuré dans Réglages →
// Entreprise. L'objet est ensuite MUTÉ en place (pas remplacé) par
// applyCompanySettings() une fois les vrais réglages chargés — tous les
// endroits qui lisent COMPANY.xxx au moment de l'affichage (pas à
// l'import) voient donc automatiquement la valeur à jour.
export const COMPANY = {
  name: 'PSE DÉPANNAGE',
  legalForm: 'SARL',
  address: '58 rue de Monceau, 75008 Paris',
  siret: '99474318500013',
  vatNumber: 'FR26994743185',
  naf: '4322A',
  vatRegime: 'TVA sur les encaissements',
  phone: '',
  email: '',
  logoUrl: '',
}

export function applyCompanySettings(data: Partial<typeof COMPANY>) {
  Object.assign(COMPANY, data)
}

export function legalFooterLines(): string[] {
  return [
    `${COMPANY.name} — ${COMPANY.legalForm} — ${COMPANY.address}`,
    `SIRET ${COMPANY.siret} — TVA ${COMPANY.vatNumber} — NAF ${COMPANY.naf}`,
    COMPANY.vatRegime,
  ]
}

// Conditions générales affichées sur les devis/factures (onglet "Aperçu" et
// PDF) — mentions courantes pour une entreprise de dépannage, dont les
// pénalités de retard obligatoires en droit français (art. L441-10 du code
// de commerce). Générique et à ajuster si besoin, pas rédigé par un juriste.
// Fonction (pas une constante) pour reprendre le nom d'entreprise à jour à
// chaque appel, pas celui capturé au chargement du module.
export function legalClauses(): { title: string; body: string }[] {
  return [
    {
      title: 'Acceptation du devis',
      body: `Le devis est valable pour la durée indiquée. La signature du client vaut acceptation ferme des prestations, quantités et prix qui y figurent.`,
    },
    {
      title: 'Exécution des travaux',
      body: `Les travaux sont réalisés selon les règles de l'art. Toute prestation supplémentaire constatée sur place et non prévue au devis initial fait l'objet d'un accord préalable du client avant réalisation.`,
    },
    {
      title: 'Modalités de paiement',
      body: `Sauf mention contraire, le règlement est dû à réception de la facture. ${COMPANY.name} accepte les paiements par espèces, carte bancaire, virement ou chèque.`,
    },
    {
      title: 'Pénalités de retard',
      body: `Conformément à l'article L441-10 du code de commerce, tout retard de paiement entraîne de plein droit l'application de pénalités calculées au taux d'intérêt légal en vigueur, ainsi qu'une indemnité forfaitaire pour frais de recouvrement de 40 €.`,
    },
    {
      title: 'Garantie',
      body: `Les pièces et équipements posés bénéficient de la garantie du fabricant. La main d'œuvre est garantie contre tout défaut d'installation pendant une durée raisonnable après intervention, sur présentation de la facture.`,
    },
    {
      title: 'Responsabilité',
      body: `${COMPANY.name} ne saurait être tenue responsable des dommages résultant de l'état antérieur des installations, de vices cachés préexistants, ou d'une utilisation non conforme des équipements après intervention.`,
    },
    {
      title: 'Litiges et juridiction compétente',
      body: `En cas de différend, les parties s'engagent à rechercher une solution amiable. À défaut d'accord, le litige relève de la juridiction compétente du ressort du siège de l'entreprise.`,
    },
  ]
}
