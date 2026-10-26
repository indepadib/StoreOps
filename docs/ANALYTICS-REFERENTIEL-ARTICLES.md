# Référentiel commun et organisation Analytics

Le référentiel est un volet du même Analytics, accessible dans la navigation **Référentiel articles**. La détention possède son volet. Les analyses globales de prix, volumes et paniers sont intégrées à **Ventes** et **Catégories & Produits**, avec les dates et magasins communs. Article 360 est accessible depuis ces analyses. L’ancienne adresse intelligence renvoie vers Ventes.

## Sources et définition des prix

- Liste exhaustive : articles libérés Dynamics de la société configurée ; ne dépend ni de ventes ni de stock positif.
- Identité, unités, fournisseur, mode d’approvisionnement et prix de fiche : même service catalogue partagé avec les analyses existantes. Codes-barres lus dans la source Dynamics configurée.
- Hiérarchie commerciale : affectations de catégories Dynamics. Un rattachement financier unique peut résoudre département/rayon seulement ; aucune famille ou UB n’est inventée. Le statut partiel ou manquant est conservé.
- Dernier achat : dernière ligne positive de facture comptabilisée `VendInvoiceTransBiEntities`, par date de facture puis date de création. Prix HT de ligne = `LineAmount / Qty`, dans `PurchUnit` et `CurrencyCode`. Référence de facture, date, source et méthode exportées. Périmètre société, pas prix propre à un magasin. Avoirs exclus. Hors frais et remises globales de facture. Une ligne plus récente sans prix ou unité exploitable ne doit pas être présentée comme un prix certain.
- Vente de la fiche : `ReleasedProductsV2.SalesPrice`, par unité de vente. Ce prix ne garantit pas le prix effectif ou promotionnel d’un canal. La date de modification de ce champ n’étant pas exposée par la lecture actuelle, elle reste indisponible.
- Coût de référence : `ReleasedProductsV2.UnitCost`, avec conversion explicite de l’unité de stock vers celle de vente. Distinct du dernier prix d’achat.
- Prix réalisé des analyses de panier : ventes TTC éligibles / quantité, promotions comprises. Distinct des deux prix précédents.

## Export et qualité

Le premier lot permet d’inspecter le format. « Charger / reprendre » lit toute la liste avec une progression et deux lots simultanés au maximum. Les lots partagent la même empreinte de liste ; un changement de liste suspend la lecture. L’export local et l’export de la barre Analytics utilisent les données complètes, au-delà des 300 lignes affichées. Recherche et classement déterminent la sélection exportée. Chaque ligne conserve sa date de lecture et ses sources. Les lectures ne constituent pas une photographie transactionnelle simultanée de toutes les tables Dynamics.

Une liste de références tronquée bloque l’export complet. Une source de prix indisponible ou tronquée donne un statut explicite et un prix indisponible, jamais un zéro artificiel. Les valeurs CSV sont échappées contre les formules. Les lots sont mis en cache quinze minutes ; le périmètre de liste est mis en cache une journée. Les informations affichées portent leur date de lecture.

## Chargements bornés

Les paniers sont préparés par journée et magasin, puis comparés à partir de ces lectures internes. Les jetons clients restent côté serveur et ne figurent jamais dans les réponses ou exports. Les magasins actifs sans connexion ventes sont signalés et exclus du périmètre connecté ; une sélection explicite non raccordée produit un message dédié. Les droits par magasin s’appliquent avant toute lecture.

La détention prépare les stocks magasin et entrepôt par pages de mille lignes. Les taux ne sont publiés que sur un assortiment attendu connu avec des quantités complètes. Stock inconnu reste inconnu ; une référence sans ventes reste dans la liste. Le stock est actuel, indépendant des dates de ventes. Les débuts et fins de lecture des sources sont conservés.

## Vérification

Tests : `customer-bi-ui`, `customer-product-intelligence`, `article-reference`, contrats de sélecteurs, erreurs de chargement et changement de période. Vérifier aussi le navigateur avec le même Analytics et une session authentifiée ; un test public HTTP ne valide pas les parcours privés.
