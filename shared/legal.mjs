// Mentions légales et conditions générales de vente des devis et factures —
// UN SEUL texte pour l'app (éditeur, aperçu, PDF, signature) et le serveur
// (PDF joints aux emails).
//
// Rédigées pour une entreprise de dépannage d'urgence (serrurerie, plomberie,
// électricité, vitrerie…) qui intervient chez des particuliers et des
// professionnels, en s'appuyant sur : Code de la consommation (L111-1,
// L112-1, L221-5, L221-18, L221-25, L221-28, L217-3 s., L612-1), arrêté du
// 24 janvier 2017 (prestations de dépannage, réparation et entretien),
// Code de commerce (L441-9, L441-10, D441-5), Code civil (1641 s., 2367),
// Code monétaire et financier (L112-6). Protègent l'entreprise au maximum de
// ce que la loi permet : une clause contraire au droit de la consommation
// serait réputée non écrite. À faire relire par un juriste ou une
// organisation professionnelle pour l'adapter précisément à l'entreprise.

const clean = (v) => String(v ?? '').trim()
// Le « € » au milieu d'une phrase chevauche le mot suivant dans les PDF
// (police intégrée) : dans les textes, on écrit « euros ».
const euros = (v) => clean(v).replace(/\s*€/g, ' euros').replace(/\s+/g, ' ').trim()
const nameOf = (c) => clean(c?.name) || "L'entreprise"
const nameIn = (c) => clean(c?.name) || "l'entreprise"

/** Pied de page légal : uniquement les morceaux renseignés. */
export function companyLegalLines(company) {
  const c = company ?? {}
  const join = (parts) => parts.filter((p) => clean(p)).join(' — ')
  const form = clean(c.legalForm) ? `${clean(c.legalForm)}${clean(c.capital) ? ` au capital de ${euros(c.capital)}` : ''}` : ''
  return [
    join([c.name, form, c.address]),
    join([
      clean(c.siret) && `SIRET ${clean(c.siret)}`,
      c.registration,
      clean(c.vatNumber) && `TVA ${clean(c.vatNumber)}`,
      clean(c.naf) && `NAF ${clean(c.naf)}`,
    ]),
    join([c.vatRegime, clean(c.insurance) && `Assurance professionnelle : ${clean(c.insurance)}`]),
  ].filter((l) => clean(l))
}

/** Gratuit ou payant (mention obligatoire du devis, arrêté du 24 janvier 2017). */
export function devisFeeMention(company) {
  const fee = euros(company?.devisFee)
  return fee ? `Devis payant : ${fee.replace(/\.$/, '')}.` : 'Devis gratuit.'
}

/** Ce que le client signe sur un devis (encadré « Bon pour accord »). */
export const DEVIS_CONSENT =
  "« Devis reçu avant l'exécution des travaux. » J'ai pris connaissance des conditions générales de vente ci-jointes et je les accepte. Je demande l'exécution immédiate de l'intervention."

/** Mentions courtes imprimées sur le devis, au-dessus du « Bon pour accord ». */
export function devisMentions(company) {
  return [
    devisFeeMention(company),
    'Vous pouvez conserver les pièces, éléments ou appareils remplacés (arrêté du 24 janvier 2017).',
    "Travaux urgents expressément demandés par le client : pas de droit de rétractation (art. L221-28 8° du Code de la consommation). Autres cas : voir l'article « Droit de rétractation » des conditions générales.",
  ]
}

/** Mentions de paiement imprimées sur la facture (obligatoires, art. L441-9 du Code de commerce). */
export function factureMentions() {
  return [
    "Paiement comptant le jour de l'intervention. Pas d'escompte pour paiement anticipé.",
    "Client professionnel, en cas de retard : pénalités au taux de trois fois le taux d'intérêt légal et indemnité forfaitaire de 40 euros pour frais de recouvrement (art. L441-10 et D441-5 du Code de commerce).",
  ]
}

/** Conditions générales de vente (devis, factures, signature, page d'accueil de l'éditeur). */
export function legalClauses(company) {
  const c = company ?? {}
  const Name = nameOf(c)
  const name = nameIn(c)
  const contact = [clean(c.address), clean(c.email)].filter(Boolean).join(', ')
  const insurance = clean(c.insurance)
  const mediator = clean(c.mediator)
  return [
    {
      title: "Champ d'application et acceptation",
      body: `Les présentes conditions générales s'appliquent à toutes les prestations de dépannage, de réparation, d'entretien et d'installation réalisées par ${name}, pour des clients particuliers comme professionnels. Elles sont remises au client avec le devis, avant toute intervention. Le client reconnaît en avoir pris connaissance avant de signer le devis ou de commander l'intervention, et les accepte sans réserve. La signature du devis vaut commande ferme et définitive, sous réserve du droit de rétractation dans les seuls cas où la loi le prévoit.`,
    },
    {
      title: 'Devis et information préalable',
      body: `Conformément à l'arrêté du 24 janvier 2017, les taux horaires de main-d'œuvre, les frais de déplacement et les prix des forfaits sont communiqués au client avant toute intervention, et un devis détaillé lui est remis avant l'exécution des travaux. ${devisFeeMention(c)} Le devis est valable pour la durée qui y est indiquée. Toute prestation supplémentaire, constatée sur place et non prévue au devis, n'est réalisée qu'après accord du client. Le client peut conserver les pièces, éléments ou appareils remplacés ; à défaut, ils sont repris par l'entreprise.`,
    },
    {
      title: 'Prix et majorations',
      body: `Les prix sont indiqués en euros, hors taxes et toutes taxes comprises, au taux de TVA en vigueur. Ils comprennent les prestations, la main-d'œuvre, le déplacement et les pièces détaillés au devis. Les forfaits incluent une heure de main-d'œuvre ; au-delà, toute heure entamée est due. Les interventions réalisées du lundi au vendredi entre 19 h et 6 h, ainsi que les samedis, dimanches et jours fériés, sont majorées de 100 % : la majoration s'applique à la main-d'œuvre, aux forfaits, au déplacement et aux pièces, et figure sur le devis accepté avant l'intervention. Les pièces et fournitures sont facturées au tarif en vigueur le jour de l'intervention.`,
    },
    {
      title: 'Intervention et ouverture de porte',
      body: `Le client certifie être l'occupant légitime des lieux (propriétaire ou locataire) ou être dûment mandaté par lui ; le technicien peut demander une pièce d'identité et un justificatif de domicile, et refuser d'intervenir à défaut. L'ouverture d'une porte peut nécessiter la dépose ou la destruction du cylindre ou de la serrure, ce que le client accepte ; elle ne garantit pas le bon état de la serrure, de la porte ni du bâti. Les travaux sont réalisés selon les règles de l'art, avec les moyens adaptés à l'urgence. À titre de preuve, notamment en cas de sinistre ou de litige, des photos des lieux et des installations peuvent être prises avant, pendant et après l'intervention ; elles ne sont pas diffusées.`,
    },
    {
      title: 'Droit de rétractation',
      body: `Travaux urgents : le droit de rétractation ne s'applique pas aux travaux d'entretien ou de réparation à réaliser en urgence au domicile du client et expressément sollicités par lui, dans la limite des pièces et travaux strictement nécessaires pour répondre à l'urgence (art. L221-28 8° du Code de la consommation). Autres prestations conclues au domicile d'un client particulier : celui-ci dispose de 14 jours à compter de la signature du devis pour se rétracter (art. L221-18), au moyen du formulaire figurant ci-après ou de toute déclaration dénuée d'ambiguïté. En signant le devis, il demande expressément l'exécution immédiate de l'intervention : s'il se rétracte après son début, il doit un montant proportionné à ce qui a été réalisé (art. L221-25) ; une fois la prestation entièrement exécutée, il ne peut plus se rétracter (art. L221-28 1°). Une prestation réalisée et payée ne peut donc plus être annulée.`,
    },
    {
      title: 'Paiement',
      body: `Le prix est payable comptant, en totalité, le jour de l'intervention, dès la fin des travaux, sur présentation de la facture. Moyens de paiement acceptés : carte bancaire, virement, espèces dans la limite légale de 1 000 euros (art. L112-6 du Code monétaire et financier) et chèque jusqu'à 100 euros. Aucun escompte n'est accordé en cas de paiement anticipé. Les pièces et matériels fournis restent la propriété de ${name} jusqu'au paiement intégral du prix (clause de réserve de propriété, art. 2367 du Code civil).`,
    },
    {
      title: 'Retard ou défaut de paiement',
      body: `Pour le client particulier, toute somme non payée à son échéance porte intérêts au taux légal après mise en demeure. Pour le client professionnel, tout retard entraîne de plein droit, dès le lendemain de l'échéance, des pénalités au taux de trois fois le taux d'intérêt légal et une indemnité forfaitaire pour frais de recouvrement de 40 euros (art. L441-10 et D441-5 du Code de commerce), sans préjudice des frais supplémentaires justifiés. ${Name} peut engager toute procédure de recouvrement, y compris l'injonction de payer.`,
    },
    {
      title: 'Annulation et déplacement',
      body: `Toute intervention annulée après le départ du technicien, ou rendue impossible du fait du client (absence, accès impossible, informations erronées), donne lieu à la facturation des frais de déplacement annoncés lors de la demande. Si le client refuse le devis sur place, seuls le déplacement et, le cas échéant, le devis payant sont facturés, dans les conditions annoncées avant l'intervention.`,
    },
    {
      title: 'Garanties',
      body: `Les prestations sont garanties 6 mois, pièces et main-d'œuvre, à compter de l'intervention, à l'exception des débouchages et dégorgements de canalisation, garantis 7 jours. Les pièces bénéficient en outre de la garantie de leur fabricant. Ces garanties ne couvrent pas l'usure normale, une mauvaise utilisation, un défaut d'entretien, les dégradations, effractions ou actes de vandalisme postérieurs à l'intervention, ni les pièces fournies par le client ; elles cessent en cas d'intervention d'un tiers sur les travaux réalisés. Elles s'ajoutent, sans les remplacer, à la garantie légale de conformité (art. L217-3 et suivants du Code de la consommation) et à la garantie des vices cachés (art. 1641 et suivants du Code civil). Toute demande au titre de la garantie est à adresser par écrit ; le service après-vente la prend en charge sous 96 heures.`,
    },
    {
      title: 'Responsabilité et assurance',
      body: `${insurance ? `${Name} est assurée pour sa responsabilité civile professionnelle : ${euros(insurance)}. ` : ''}${Name} ne saurait être tenue responsable des dommages résultant de l'état antérieur ou de la vétusté des installations, de vices préexistants, d'informations inexactes fournies par le client, ou d'une utilisation non conforme des équipements après l'intervention. Le client signale avant le début des travaux toute particularité connue (porte blindée, alarme, canalisation fragile, amiante…).`,
    },
    {
      title: 'Réclamations et médiation',
      body: `Toute réclamation est à adresser par écrit à ${name}${contact ? ` (${contact})` : ''}. Les parties recherchent d'abord une solution amiable. Après une réclamation écrite restée sans réponse satisfaisante, le client particulier peut recourir gratuitement à un médiateur de la consommation (art. L612-1 du Code de la consommation)${mediator ? ` : ${mediator}` : ''}.`,
    },
    {
      title: 'Droit applicable et litiges',
      body: `Les présentes conditions sont soumises au droit français. À défaut d'accord amiable, le litige est porté devant la juridiction compétente selon les règles de droit commun ; avec un client professionnel, le tribunal du ressort du siège de ${name} est seul compétent.`,
    },
    {
      title: 'Données personnelles',
      body: `Les données du client (identité, coordonnées, adresse d'intervention, photos) servent uniquement à l'exécution de l'intervention, à la facturation, au suivi des garanties et au respect des obligations légales ; elles sont conservées pendant les durées légales (10 ans pour les pièces comptables). Le client peut y accéder, les faire rectifier ou en demander l'effacement, dans les limites légales, en écrivant à ${name}.`,
    },
    {
      title: 'Formulaire de rétractation',
      body: `À remplir et renvoyer uniquement pour vous rétracter d'une prestation non urgente conclue à votre domicile (art. L221-18). À l'attention de ${name}${contact ? `, ${contact}` : ''} : je vous notifie par la présente ma rétractation du contrat portant sur la prestation de services ci-dessous. Devis n° et date de signature : ……… Nom du client : ……… Adresse : ……… Date et signature : ………`,
    },
  ]
}
