// Textes réglementaires affichés en intégralité sur une page dédiée
// (référencée depuis les devis/factures) plutôt qu'injectés dans chaque
// PDF — beaucoup trop longs pour ça. Reproduction du code de la
// consommation (droit de rétractation) et de l'arrêté du 24 janvier 2017
// spécifique aux prestations de dépannage/réparation/entretien du bâtiment.
export interface LegalArticle {
  heading: string
  body: string
}

export interface LegalDocument {
  title: string
  subtitle?: string
  articles: LegalArticle[]
}

export const CODE_CONSOMMATION: LegalDocument = {
  title: 'Code de la consommation',
  subtitle: 'Information précontractuelle, exercice du droit de rétractation et conséquences de la rétractation',
  articles: [
    {
      heading: 'Article L111-1',
      body: `Avant que le consommateur ne soit lié par un contrat de vente de biens ou de fourniture de services, le professionnel communique au consommateur, de manière lisible et compréhensible, les informations suivantes :
1° Les caractéristiques essentielles du bien ou du service, compte tenu du support de communication utilisé et du bien ou service concerné ;
2° Le prix du bien ou du service, en application des articles L112-1 à L112-4 ;
3° En l'absence d'exécution immédiate du contrat, la date ou le délai auquel le professionnel s'engage à livrer le bien ou à exécuter le service ;
4° Les informations relatives à son identité, à ses coordonnées postales, téléphoniques et électroniques, et à ses activités, pour autant qu'elles ne résultent pas du contexte, ainsi que, s'il y a lieu, celles relatives aux garanties légales, aux fonctionnalités du contenu numérique et, le cas échéant, à son interopérabilité, à l'existence et aux modalités de mise en œuvre des garanties et autres conditions contractuelles.
La liste et le contenu précis des informations sont fixés par décret en Conseil d'État.`,
    },
    {
      heading: 'Article L121-18',
      body: `Le consommateur dispose d'un délai de quatorze jours pour exercer son droit de rétractation d'un contrat conclu à distance, à la suite d'un démarchage téléphonique ou hors établissement, sans avoir à motiver sa décision ni à supporter d'autres coûts que ceux prévus aux articles L221-23 à L221-25.
1° De la conclusion du contrat, pour les contrats de prestation de services et ceux mentionnés à l'article L221-4 ;
2° De la réception du bien par le consommateur ou un tiers, autre que le transporteur, désigné par lui, pour les contrats de vente de biens. Pour les contrats conclus hors établissement, le consommateur peut exercer son droit de rétractation à compter de la conclusion du contrat.`,
    },
    {
      heading: 'Article L221-20',
      body: `Lorsque les informations relatives au droit de rétractation n'ont pas été fournies au consommateur dans les conditions prévues au 2° du I de l'article L221-5, le délai de rétractation est prolongé de douze mois à compter de l'expiration du délai de rétractation initial déterminé conformément à l'article. Toutefois, lorsque le professionnel a fourni au consommateur les informations requises dans un délai de douze mois à compter de la conclusion du contrat, le délai de rétractation expire au terme d'une période de quatorze jours à compter du jour où le consommateur a reçu ces informations.`,
    },
    {
      heading: 'Article L221-21',
      body: `Le consommateur exerce son droit de rétractation en informant le professionnel de sa décision de se rétracter avant l'expiration du délai prévu à l'article L221-18, en lui adressant, avant cette expiration, le formulaire de rétractation mentionné au 2° de l'article L221-5 ou toute autre déclaration, dénuée d'ambiguïté, exprimant sa volonté de se rétracter.
Le professionnel peut également permettre au consommateur de remplir et de transmettre en ligne, sur son site internet, le formulaire ou la déclaration prévus au présent article. Dans cette hypothèse, le professionnel communique, sans délai, au consommateur un accusé de réception de la rétractation sur un support durable.`,
    },
    {
      heading: 'Article L221-22',
      body: `La charge de la preuve de l'exercice du droit de rétractation dans les conditions prévues à l'article L221-21 pèse sur le consommateur.`,
    },
    {
      heading: 'Article L221-24',
      body: `Lorsque le droit de rétractation est exercé, le professionnel est tenu de rembourser le consommateur de la totalité des sommes versées, y compris les frais de livraison, sans retard injustifié et au plus tard dans les quatorze jours à compter de la date à laquelle il est informé de la décision du consommateur de se rétracter.
Pour les contrats de vente de biens, à moins qu'il ne propose de récupérer lui-même les biens, le professionnel peut différer le remboursement jusqu'à récupération des biens ou jusqu'à ce que le consommateur ait fourni une preuve de l'expédition de ces biens, la date retenue étant celle du premier de ces faits. Le professionnel effectue ce remboursement en utilisant le même moyen de paiement que celui utilisé par le consommateur pour la transaction initiale, sauf accord exprès du consommateur pour qu'il utilise un autre moyen de paiement et dans la mesure où le remboursement n'occasionne pas de frais pour le consommateur. Le professionnel n'est pas tenu de rembourser les frais supplémentaires si le consommateur a expressément choisi un mode de livraison plus coûteux que le mode de livraison standard proposé par le professionnel.`,
    },
    {
      heading: 'Article L221-25',
      body: `Si le consommateur souhaite que l'exécution d'une prestation de services ou d'un contrat mentionné au premier alinéa de l'article L221-4 commence avant la fin du délai de rétractation mentionné à l'article L221-18, le professionnel recueille sa demande expresse par tout moyen pour les contrats conclus à distance et sur papier ou sur support durable pour les contrats conclus hors établissement.
Le consommateur qui a exercé son droit de rétractation d'un contrat de prestation de services ou d'un contrat mentionné au premier alinéa de l'article L221-4 dont l'exécution a commencé, à sa demande expresse, avant la fin du délai de rétractation verse au professionnel un montant correspondant au service fourni jusqu'à la communication de sa décision de se rétracter ; ce montant est proportionné au prix total de la prestation convenu dans le contrat. Si le prix total est excessif, le montant approprié est calculé sur la base de la valeur marchande de ce qui a été fourni.
Aucune somme n'est due par le consommateur ayant exercé son droit de rétractation si sa demande expresse n'a pas été recueillie en application du premier alinéa du présent article ou si le professionnel n'a pas respecté l'obligation d'information prévue au 4° du I de l'article L221-5.`,
    },
    {
      heading: 'Article L221-27',
      body: `L'exercice du droit de rétractation met fin à l'obligation des parties soit d'exécuter le contrat à distance ou hors établissement, soit de le conclure lorsque le consommateur a fait une offre. L'exercice du droit de rétractation d'un contrat principal à distance ou hors établissement met automatiquement fin à tout contrat accessoire, sans frais pour le consommateur autres que ceux prévus aux articles L221-23 à L221-25.`,
    },
    {
      heading: 'Article L221-28',
      body: `Le droit de rétractation ne peut être exercé pour les contrats :
1° De fourniture de services pleinement exécutés avant la fin du délai de rétractation et dont l'exécution a commencé après accord préalable exprès du consommateur et renoncement exprès à son droit de rétractation ;
2° De fourniture de biens ou de services dont le prix dépend de fluctuations sur le marché financier échappant au contrôle du professionnel et susceptibles de se produire pendant le délai de rétractation ;
3° De fourniture de biens confectionnés selon les spécifications du consommateur ou nettement personnalisés ;
4° De fourniture de biens susceptibles de se détériorer ou de se périmer rapidement ;
5° De fourniture de biens qui ont été descellés par le consommateur après la livraison et qui ne peuvent être renvoyés pour des raisons d'hygiène ou de protection de la santé ;
6° De fourniture de biens qui, après avoir été livrés et de par leur nature, sont mélangés de manière indissociable avec d'autres articles ;
7° De fourniture de boissons alcoolisées dont la livraison est différée au-delà de trente jours et dont la valeur convenue à la conclusion du contrat dépend de fluctuations sur le marché échappant au contrôle du professionnel ;
8° De travaux d'entretien ou de réparation à réaliser en urgence au domicile du consommateur et expressément sollicités par lui, dans la limite des pièces de rechange et travaux strictement nécessaires pour répondre à l'urgence ;
9° De fourniture d'enregistrements audio ou vidéo ou de logiciels informatiques lorsqu'ils ont été descellés par le consommateur après la livraison ;
10° De fourniture d'un journal, d'un périodique ou d'un magazine, sauf pour les contrats d'abonnement à ces publications ;
11° Conclus lors d'une enchère publique ;
12° De prestations de services d'hébergement, autres que d'hébergement résidentiel, de services de transport de biens, de location de voitures, de restauration ou d'activités de loisirs qui doivent être fournis à une date ou à une période déterminée ;
13° De fourniture d'un contenu numérique non fourni sur un support matériel dont l'exécution a commencé après accord préalable exprès du consommateur et renoncement exprès à son droit de rétractation.`,
    },
  ],
}

export const ARRETE_DEPANNAGE_2017: LegalDocument = {
  title: "Arrêté du 24 janvier 2017",
  subtitle:
    "Relatif à la publicité des prix des prestations de dépannage, de réparation et d'entretien dans le secteur du bâtiment et de l'équipement de la maison",
  articles: [
    {
      heading: 'Objet et champ d\'application',
      body: `Publics concernés : tout professionnel intervenant, à quelque titre que ce soit, dans le cadre des prestations de dépannage, de réparation et d'entretien dans le secteur du bâtiment et de l'équipement de la maison auprès des particuliers.
Objet : organisation de l'information du consommateur qui recourt ou renonce à recourir à des prestations de dépannage, de réparation ou d'entretien dans le secteur du bâtiment et de l'équipement de la maison.
Entrée en vigueur : le texte entre en vigueur le 1er avril 2017 et remplace à compter de cette date l'arrêté du 2 mars 1990 relatif à la publicité des prix des prestations de dépannage, de réparation et d'entretien dans le secteur du bâtiment et de l'équipement de la maison.
Notice explicative : pris en application de l'article L. 112-1 du code de la consommation, le présent arrêté précise les informations de prix devant être portées à la connaissance des consommateurs préalablement à la vente desdites prestations (dépannage, réparation et entretien) à domicile par les professionnels intervenant dans les secteurs du bâtiment et de l'équipement de la maison qui sont fournies à domicile par les particuliers, à l'exception des prestations soumises à une réglementation spécifique.
Par rapport à la réglementation antérieure, le texte introduit notamment trois dispositions nouvelles :
— il prévoit la remise au client par le professionnel, d'informations préalables intervenant dans les secteurs concernés lors de la conclusion du contrat, issues de la fusion des deux documents antérieurement dénommés « devis » et « ordre de réparation », transmises sur support durable ;
— il oblige explicitement le professionnel à tenir à disposition des consommateurs préalablement à la vente desdites prestations en secteurs et hors établissement commercial en un espace de communication en ligne le professionnel.`,
    },
    {
      heading: 'Article 1',
      body: `I. — Les dispositions du présent arrêté s'appliquent à tout professionnel qui réalise :
— des prestations de dépannage, de réparation et d'entretien de la maison, énumérées en annexe ;
— des opérations de remplacement ou d'adjonction de pièces, d'éléments ou d'appareils, consécutives à la mise en œuvre des prestations susvisées.
II. — Ne sont pas soumises aux dispositions du présent arrêté :
— les prestations couvertes par des paiements forfaitaires effectués lors de la conclusion ou du renouvellement de contrats incluant à titre accessoire un service de dépannage, d'entretien, de contrats de garantie ou de services après-vente ;
— les prestations de raccordement à un réseau public par un concessionnaire de service public ou sous la responsabilité de cet opérateur.`,
    },
    {
      heading: 'Article 2',
      body: `En application des articles L. 112-1 et L. 112-3 du code de la consommation, le professionnel communique préalablement à la conclusion d'un contrat de prestation de service ou de vente au consommateur, par voie d'affichage, les informations suivantes :
— le ou les taux horaires de main-d'œuvre toutes taxes comprises (TTC) ;
— les modalités de décompte du temps estimé ;
— le cas échéant, les prix TTC des différentes prestations forfaitaires proposées, notamment les prix au mètre linéaire ou au mètre carré ;
— le cas échéant, les frais de déplacement ;
— le caractère payant ou gratuit du devis et, le cas échéant, le coût d'établissement du devis ;
— toute autre condition de rémunération.`,
    },
    {
      heading: 'Article 3',
      body: `Lorsque le professionnel reçoit la clientèle dans ses locaux, les informations visées à l'article 2 font l'objet d'un affichage à l'intérieur de ces locaux à l'endroit où sont fixés les tarifs, la clientèle. Lorsque le local dispose d'une vitrine publique, ou d'une vitrine, ces mêmes informations sont également communiquées de façon lisible et visible depuis l'extérieur.
Ces informations doivent être aisément accessibles pour tout espace de communication en ligne du professionnel.`,
    },
    {
      heading: 'Article 4',
      body: `I. — Préalablement à l'exécution de toute prestation visée à l'article 1er, conclue en établissement commercial, le professionnel remet au client un devis détaillé, qui comporte, outre les mentions des articles L111-1 et L111-2 du code de la consommation, les mentions suivantes :
— la date de rédaction ;
— le nom et l'adresse de l'entreprise ;
— le nom du client ;
— le lieu d'exécution de l'opération ;
— la nature exacte des réparations à effectuer ;
— le décompte détaillé, en quantité et en prix, de chaque prestation et produit nécessaire à l'opération prévue : dénomination, prix unitaire et désignation de l'unité à laquelle il s'applique (notamment l'heure de main-d'œuvre, le mètre linéaire ou le mètre carré) et la quantité prévue ;
— le cas échéant, les frais de déplacement ;
— la somme globale à payer hors taxes et toutes taxes comprises, en précisant le taux de TVA ;
— la durée de validité de l'offre ;
— l'indication du caractère payant ou gratuit du devis.
II. — Lorsque le contrat est conclu hors établissement au sens de l'article L221-1, le devis détaillé revêt la forme du contrat déterminée aux articles L221-5 et L221-9 du code de la consommation. Pour l'application de l'article L111-1 (2°) relatif à l'information sur les prix, il comporte :
— le décompte détaillé, en quantité et en prix, de chaque prestation, en particulier le taux horaire de main d'œuvre et le temps estimé ou, le cas échéant, le montant forfaitaire de chaque prestation ;
— la dénomination des produits et matériels nécessaires à l'opération prévue et leur prix unitaire ainsi que, le cas échéant, la désignation de l'unité à laquelle il s'applique et la quantité prévue ;
— le cas échéant, les frais de déplacement.
III. — Dans le devis visé au I précité ou dans le contrat conclu hors établissement commercial visé au II précité, le consommateur doit être informé qu'il peut conserver les pièces, les éléments ou appareils remplacés. Cette information s'effectue selon un modèle-type figurant en annexe du présent arrêté.`,
    },
    {
      heading: 'Article 5',
      body: `Toute prestation exécutée doit faire l'objet dès qu'elle est exécutée et, en tout état de cause avant le paiement du prix, de la délivrance d'une note dans les conditions prévues à l'arrêté du 3 octobre 1983 modifié. Si le consommateur demande expressément, une note doit lui être remise pour les prestations effectuées quel que soit le montant des prestations réalisées. Ce document est gratuit quel qu'en soit le montant.`,
    },
    {
      heading: 'Article 6',
      body: `Les dispositions du présent arrêté s'appliquent sans préjudice des dispositions des articles L. 221-18 et suivants du code de la consommation.`,
    },
    {
      heading: 'Article 7',
      body: `L'arrêté du 2 mars 1990 relatif à la publicité des prix des prestations de dépannage, de réparation et d'entretien dans le secteur du bâtiment et de l'équipement de la maison est abrogé.`,
    },
    {
      heading: 'Article 8',
      body: `Le présent arrêté entre en vigueur le 1er avril 2017.`,
    },
    {
      heading: 'Article 9',
      body: `Le présent arrêté et ses annexes seront publiés au Journal officiel de la République française.`,
    },
  ],
}

export const LEGAL_DOCUMENTS: LegalDocument[] = [CODE_CONSOMMATION, ARRETE_DEPANNAGE_2017]

// Grille tarifaire publique des forfaits — l'affichage de ces tarifs est une
// obligation de l'arrêté du 24 janvier 2017 ci-dessus (article 2 : "le
// professionnel communique [...] par voie d'affichage [...]"), pas une
// simple information commerciale. Montants HT, le PDF/devis applique
// ensuite le taux de TVA réel (10% travaux d'amélioration dans un logement
// de plus de 2 ans, 20% sinon).
export interface TariffRow {
  label: string
  ht: number
  tva10: number
  tva20: number
}

export interface TariffSection {
  category: string
  rows: TariffRow[]
}

export const TARIFF_GRID: TariffSection[] = [
  {
    category: 'Tarification générale',
    rows: [
      { label: 'Déplacement', ht: 95, tva10: 104.5, tva20: 114 },
      { label: 'Déplacement en urgence', ht: 140, tva10: 154, tva20: 168 },
      { label: "Main d'œuvre", ht: 90, tva10: 99, tva20: 108 },
      { label: 'Devis payant (valable 1 mois)', ht: 60, tva10: 66, tva20: 72 },
      { label: "Forfait mise en sécurité pour tous types d'intervention", ht: 400, tva10: 440, tva20: 480 },
    ],
  },
  {
    category: 'Serrurerie',
    rows: [
      { label: 'Ouverture de porte si remplacement de serrure', ht: 390, tva10: 429, tva20: 468 },
      { label: 'Ouverture de porte sans remplacement de serrure', ht: 590, tva10: 649, tva20: 708 },
      { label: 'Blindage de porte', ht: 790, tva10: 869, tva20: 948 },
      { label: 'Fermeture provisoire', ht: 380, tva10: 418, tva20: 456 },
      { label: 'Réglage / rabotage de porte', ht: 225, tva10: 247.5, tva20: 270 },
      { label: 'Entretien serrure - porte - poignée', ht: 140, tva10: 154, tva20: 168 },
      { label: 'Pivot de sécurité', ht: 770, tva10: 847, tva20: 924 },
      { label: "Main d'œuvre interphone", ht: 250, tva10: 275, tva20: 300 },
    ],
  },
  {
    category: 'Chauffage',
    rows: [
      { label: 'Remise en route ou recherche de panne chaudière', ht: 200, tva10: 220, tva20: 240 },
      { label: 'Réparation fuite de radiateur', ht: 300, tva10: 330, tva20: 360 },
      { label: 'Changement de résistance chauffe-eau', ht: 190, tva10: 209, tva20: 228 },
      { label: 'Installation chaudière gaz individuelle murale', ht: 680, tva10: 748, tva20: 816 },
    ],
  },
  {
    category: 'Plomberie / Assainissement',
    rows: [
      { label: 'Réparation de fuite (soudures, jointures, filasse)', ht: 300, tva10: 330, tva20: 360 },
      { label: 'Recherche de fuite', ht: 200, tva10: 220, tva20: 240 },
      { label: 'Passage caméra dans canalisation', ht: 350, tva10: 385, tva20: 420 },
      { label: 'Dégorgement haute pression / camion pompe', ht: 700, tva10: 770, tva20: 840 },
      { label: 'Curage 10 mètres linéaires', ht: 300, tva10: 330, tva20: 360 },
      { label: 'Dégorgement domestique à la canne', ht: 440, tva10: 484, tva20: 528 },
      { label: 'Dégorgement domestique à la pompe', ht: 390, tva10: 429, tva20: 468 },
      { label: 'Dégorgement furet manuel', ht: 390, tva10: 429, tva20: 468 },
      { label: 'Dégorgement furet électrique', ht: 580, tva10: 638, tva20: 696 },
      { label: 'Pompage eau fosse septique (par m³)', ht: 700, tva10: 770, tva20: 840 },
      { label: "Bouteille d'acide", ht: 140, tva10: 154, tva20: 168 },
    ],
  },
  {
    category: 'Électricité',
    rows: [
      { label: 'Recherche de panne / remise en route du courant', ht: 200, tva10: 220, tva20: 240 },
      { label: 'Disjoncteur 10A à 20A monophasé', ht: 125, tva10: 137.5, tva20: 150 },
      { label: 'Disjoncteur 32A monophasé', ht: 140, tva10: 154, tva20: 168 },
      { label: 'Interrupteur différentiel type A ou AC, monophasé', ht: 500, tva10: 550, tva20: 600 },
      { label: 'Disjoncteur triphasé (tout ampérage)', ht: 630, tva10: 693, tva20: 756 },
      { label: 'Disjoncteur triphasé différentiel (tout ampérage)', ht: 800, tva10: 880, tva20: 960 },
      { label: 'Barrette de pontage cuivre', ht: 50, tva10: 55, tva20: 60 },
      { label: 'Petites fournitures électriques (dominos, câbles)', ht: 50, tva10: 55, tva20: 60 },
    ],
  },
  {
    category: 'Porte de garage / Volet roulant',
    rows: [
      { label: 'Réparation de porte de garage', ht: 460, tva10: 506, tva20: 552 },
      { label: 'Réglages porte de garage', ht: 330, tva10: 363, tva20: 396 },
      { label: 'Dépose et installation porte de garage (2 techniciens)', ht: 750, tva10: 825, tva20: 900 },
      { label: 'Installation volet roulant', ht: 340, tva10: 374, tva20: 408 },
    ],
  },
  {
    category: 'Coffre-fort',
    rows: [
      { label: 'Entretien de coffre-fort', ht: 390, tva10: 429, tva20: 468 },
      { label: 'Remplacement de la combinaison à code', ht: 490, tva10: 539, tva20: 588 },
      { label: 'Ouverture fine sans abîmer le mécanisme', ht: 790, tva10: 869, tva20: 948 },
      { label: "Perçage haute précision d'un mécanisme", ht: 400, tva10: 440, tva20: 480 },
      { label: 'Enlèvement de coffre-fort', ht: 150, tva10: 165, tva20: 180 },
    ],
  },
]

export const TARIFF_GRID_NOTES = `Pour tout autre forfait ou prestation non représenté sur cette grille tarifaire, un devis personnalisé est remis avant intervention.
Tous les forfaits incluent 1h de main d'œuvre, ainsi que l'outillage professionnel nécessaire à la prestation pour 1 technicien, hors frais de déplacement. Cette heure de main d'œuvre incluse ne s'applique que sur les forfaits, à l'exclusion de toute autre prestation. Toute heure entamée est due.
Majoration de 100 % en semaine entre 19h et 6h, ainsi que les week-ends et jours fériés.
Tout débouchage de canalisation est garanti 7 jours. Intervention garantie 6 mois pièces et main d'œuvre, sauf dégorgement.
L'ouverture de porte ne garantit pas le bon état de la serrure, de la porte ni du bâti de la porte.
Les services après-vente sont assurés sous 96h. Réponse du service après-vente : 2 à 4 semaines par courrier.
Paiement par chèque accepté jusqu'à 100 euros.
En cas d'intervention d'une tierce personne ou d'une autre entreprise sur notre intervention, la garantie est immédiatement annulée.`
