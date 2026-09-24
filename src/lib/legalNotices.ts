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
      body: `Si le consommateur souhaite que l'exécution d'une prestation de services ou d'un contrat mentionné au premier alinéa de l'article L221-4 commence avant la fin du délai de rétractation prévu à l'article L221-18, le professionnel recueille sa demande expresse par tout moyen pour les contrats conclus à distance et sur support durable pour les contrats conclus hors établissement.
Lorsque le consommateur exerce son droit de rétractation d'un contrat de prestation de services ou d'un contrat mentionné au premier alinéa de l'article L221-4 dont l'exécution a été demandée, avant la fin du délai de rétractation, le professionnel verse au professionnel un montant correspondant au service fourni jusqu'à la communication de sa décision de se rétracter ; ce montant est proportionné au prix total de la prestation convenu dans le contrat. Si le prix total est excessif, le montant approprié est calculé sur la base de la valeur marchande de ce qui a été fourni.
Le professionnel n'est pas redevable des frais susmentionnés dans les cas où il n'a pas respecté l'obligation d'information prévue au 4° du I de l'article L221-5.`,
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
      body: `I. — Préalablement à l'exécution de toute prestation visée à l'article 1er, conclue en établissement commercial ou à distance, le professionnel remet au client un devis ou établissement commercial, le professionnel remet au client, un ordre de réparation, outre les mentions prévues par le code de la consommation, les mentions suivantes :
— la date de rédaction ;
— le nom et l'adresse de l'entreprise ;
— le nom du client ;
— le lieu d'exécution de l'opération ;
— la nature exacte des réparations à effectuer ;
— le décompte détaillé, en quantité et en prix, de chaque produit et matériel nécessaire à l'opération prévue (dénomination, prix unitaire et désignation de l'unité à laquelle il s'applique, notamment l'heure de main-d'œuvre, le mètre linéaire ou le mètre carré) et la durée de l'intervention ;
— le cas échéant, les frais de déplacement ;
— la somme globale à payer hors taxes et toutes taxes comprises, en précisant le taux de TVA ;
— la durée de validité de l'offre ;
— l'indication du caractère payant ou gratuit du devis.
II. — Lorsque le contrat est conclu hors établissement au sens de l'article L. 221-1, le devis détaillé remis au client, en sus des mentions des articles L. 221-5 et L. 221-9 du code de la consommation. Pour l'application de l'article L. 111-1 (2°) relatif à l'obligation d'information sur le prix, le devis détaillé remis au client vaut prix, et il comporte :
— le décompte détaillé, en quantité et en prix, de chaque produit et prestation, en précisant le taux horaire de main-d'œuvre et le temps estimé, ainsi que la dénomination des produits et matériels ainsi que leur prix unitaire ainsi que la désignation de l'unité à laquelle il s'applique et la quantité prévue ;
— le cas échéant, les frais de déplacement.
III. — Dans le devis visé au I précédent et dans le devis conclu hors établissement visé au II précédent, le consommateur doit être informé qu'il peut conserver les pièces, les éléments ou appareils remplacés. Cette information s'effectue selon un modèle-type figurant en annexe du présent arrêté.`,
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
