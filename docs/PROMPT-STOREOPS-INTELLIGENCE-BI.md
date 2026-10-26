# Mission exécutée : intelligence BI StoreOps / Analytics

Construire une lecture globale de l'activité et permettre le passage du réseau au magasin, à la catégorie puis à l'article. L'exemple HS-006590 sert de cas d'exploration ; ne pas limiter l'analyse à cet article ni supposer la date d'une hausse de prix non fournie.

## Détention

Lire les stocks disponibles de chaque magasin et de son entrepôt d'approvisionnement. Construire l'univers à partir de l'assortiment attendu et des références observées en stock, y compris les références sans ventes. Afficher les quantités par article dans leur unité de stock ; calculer les taux sur des comptes de références attendues, jamais sur une addition de kg et de pièces. Permettre département, rayon, famille, sous-famille et UB. Garder les non-classés visibles. Un stock inconnu ou une lecture tronquée ne vaut pas zéro. Une même référence dans un entrepôt partagé ne représente pas deux stocks distincts. Horodater la photographie actuelle ; ne pas lui attribuer une date historique de ventes.

## Paniers et prix

Comparer deux fenêtres explicites, sans chevauchement, avec durée comparable signalée. Utiliser les tickets de vente dont les lignes ET les parents sont valides, avec clés société/magasin/caisse/transaction. Calculer CA, tickets, panier moyen, pénétration article, prix TTC réalisé par unité, volume, panier contenant l'article et panier hors article. Repérer globalement les hausses de prix associées à une baisse de demande. Permettre l'exploration d'un article, de son évolution quotidienne et de sa contribution par magasin.

Sur les tickets identifiés, suivre les acheteurs antérieurs : rachat de l'article, retour sans cet article, absence d'observation. Les autres achats de ceux revenus sans article sont des pistes de substitution, pas des substitutions démontrées. Exposer la couverture d'identification et les faibles échantillons. Les affinités de panier incluent support et lift. Ne pas publier d'identifiants clients dans ce rapport agrégé.

## Fiabilité

Ne jamais conclure que le prix a causé un départ client avec une simple comparaison avant/après. Vérifier promotions, ruptures, saisonnalité, mix, unités et périmètre. Un client non revu dans une fenêtre n'est pas définitivement perdu ; son ancien CA n'est pas un CA perdu certain. Pour une étude causale, des témoins, des historiques de promotions et de disponibilité sont nécessaires.

Réparer les changements de dates en cours de chargement : snapshot du périmètre, annulation des lectures obsolètes, refus des réponses tardives, nouvelle lecture de la sélection courante. Ajouter Hier avec deux bornes identiques. Pour le FLEG sans UB, utiliser une dimension financière uniquement si elle se rattache à un rayon et département uniques ; conserver le statut partiel et ne pas inventer de famille.

## Vérifications et livraison

Tests avec hausse de prix ×2, baisse de volume, panier mécanique vs achats associés, cohorte revenue dans un autre magasin, unités incompatibles, identifiants de tickets réutilisés entre caisses, assortiment inconnu, entrepôt illisible, références FLEG sans ventes et hiérarchies ambiguës. Contrôler les droits par magasin, les dates invalides, les pages de stock et les réponses obsolètes. Publier un résultat vérifiable et annoncer clairement toute partie non validée en production.

## Organisation et source commune

Intégrer ces fonctions dans les volets existants d’Analytics. Référentiel articles et détention ont leur entrée dans la même navigation ; les analyses globales prix/volumes/paniers sont dans Ventes et Catégories & Produits. Article 360 s’explore depuis les analyses. Les filtres Analytics sont communs ; le référentiel reste indépendant de la période de ventes.

Le référentiel doit réunir tous les articles libérés de la société, y compris sans vente ni stock, avec codes-barres, unités, fournisseur, hiérarchie commerciale et statut de classement. Distinguer dernier achat facturé HT (montant net de ligne / quantité, unité, devise, date et référence de facture), prix de vente de fiche hors conditions promotionnelles magasin, coût de référence et prix réalisé en caisse. Ne jamais fabriquer une date de modification ou remplacer un dernier achat absent par un coût actuel.

Les exports utilisent l’ensemble lu, au-delà des limites d’affichage, avec les mêmes filtres que la vue. Les sources et dates de lecture sont exportées. Une liste tronquée ne peut pas être annoncée complète ; les prix inconnus sont explicités. Préparer les paniers par journée et les stocks par pages courtes avant de consolider. Les magasins sans connexion ne doivent pas casser les magasins raccordés.
