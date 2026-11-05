# Audit Analytics — 2 novembre 2026

## Périmètre et niveau de preuve

Revue du code, des calculs, des parcours et de l’affichage des 12 vues accessibles : Référentiel, Détention, Vue exécutive, Ventes, Réseau, Catégories & Produits, Fournisseurs, Clients & CRM, Stock, Fidélité, Caissiers et Promotions. L’agent constitue un treizième chantier transversal. Chaque vue a été ouverte dans le navigateur connecté. Un chargement en cours n’est pas assimilé à une source validée. Cette revue ne certifie pas toutes les données historiques de Dynamics.

Le but n’est pas une réponse mémorisée pour un article : identifier le périmètre, préparer les preuves pertinentes, calculer les croisements, distinguer les faits des hypothèses et proposer la prochaine vérification utile. « Tous les cas possibles » ne peut pas être une garantie ; les demandes non couvertes doivent être reconnues et expliquées plutôt que remplacées par un résumé général.

## Constats et traitement, vue par vue

| Vue | Constat vérifié | Première correction | Travail restant prioritaire |
|---|---|---|---|
| Agent | Les départements, l’import et les questions globales pouvaient être pris pour un article. Plusieurs codes pouvaient déclencher une enquête sur le premier seulement. | Routage corrigé ; diagnostic de sélection pour département, fournisseur, origine ou plusieurs références ; cohortes et paniers dédoublonnés ; 36 questions de vues testées sans fournisseur IA. | Élargir les formulations et les intentions à partir de questions réelles ; relier les questions de livraison et les diagnostics opérationnels. Aucun fallback générique silencieux. |
| Référentiel articles | Source commune et export présents. Quelques vrais noms restent indisponibles ; un nom de recherche ne doit pas être promu en nom produit. | Les réponses de l’agent conservent le code si le référentiel indique un nom absent. Questions spécifiques à cette vue. | Publier une couverture des noms, catégories, unités et achats ; traiter les références manquantes ; distinguer prix fiche, prix applicable et dernier achat facturé. |
| Détention | Historique de réception, vues PGC/APLS et image actuelle présents. Le chargement détaillé peut être long ; entrepôt partagé à dédoublonner. | Questions directes PGC/APLS et manques entrepôt/magasin. Le diagnostic d’une sélection montre séparément les deux sens de manque et les dates des images. | Réduire les lectures répétées ; mémoriser les images comparables avant d’afficher une évolution historique ; poursuivre la priorité des références actionnables. |
| Vue exécutive | Synthèse sur une page et rythme quotidien présents. Journée en cours et couvertures partielles doivent rester visibles. | Une demande « pourquoi le CA baisse » déclenche le diagnostic multi-source, pas une seule décomposition comptable. | Mieux hiérarchiser trois décisions et leurs preuves ; homogénéiser les comparaisons et la lisibilité de l’image de présentation. |
| Ventes | Parcours prix → paniers → retour client présent. La marge pouvait encore être présentée en montant principal dans un volet. | Taux de marge principal, montant en note ; questions de diagnostic, classement et comparaison accessibles directement. | Séries avant/après changements multiples, effets de mix et comparaison quotidienne ; marge historique selon coûts réellement disponibles. |
| Réseau | Décomposition tickets/panier et comparaison magasins présentes. Une synthèse réseau ne doit pas remplacer une question filtrée. | Les diagnostics filtrés restent dans leur catégorie/fournisseur/origine ; résultats de sélection détaillés par magasin. | Comparaisons à jours et horaires comparables ; actions spécifiques avec contrôle du résultat, sans transformer les tickets en entrées physiques. |
| Catégories & Produits | Le nombre de références des rayons préparés était perdu dans une transformation d’affichage. Une enquête de catégorie se limitait aux contributions de CA. | Nombre de références conservé ; diagnostic PGC/APLS avec pénétration, panier, remises, mêmes anciens acheteurs et disponibilité actuelle. | Navigation département → rayon → famille → article plus directe ; homogénéiser les écarts, unités et pourcentages de contribution. |
| Fournisseurs | Le titre principal pouvait revenir au titre réseau par défaut. Le taux de service porte sur des lignes contrôlées, pas toutes les livraisons. | Titre spécifique ; diagnostic des ventes d’un fournisseur ou de l’import avec périmètre maintenu. | Relier commandes, réceptions, promesses de date, détention historique et coût d’achat ; OTIF non calculé sans dates prouvées. |
| Clients & CRM | Noms et profils présents. Le non-retour n’est pas un départ définitif ; les clients de plusieurs articles se recoupent. | Cohorte fixe d’une sélection, retour sans cette sélection, fréquence et panier des mêmes clients ; aucune addition des cohortes article. | Définir les cadences attendues et suivre les retours sur plusieurs fenêtres ; qualification et contrôle humain avant toute action CRM. |
| Stock / inventaires | L’écran lit Dynamics en priorité mais l’agent lisait encore StoreOps. Un libellé suggérait un stock à la date sélectionnée alors que l’image est actuelle. | Agent Dynamics par défaut, préparation automatique par magasin/type de journal ; StoreOps sur demande explicite. Libellé de période corrigé ; stocks et journaux datés séparément. | Motifs, unités et statuts non exposés à qualifier. Un ajustement négatif ne devient pas automatiquement une perte ; pas de valorisation financière inventée. |
| Fidélité | Identification, récurrence et recrutement sont des notions différentes. Les parcours anonymes ne sont pas reconstituables. | Questions de retour des identifiés, poids du CA identifié et identification en caisse adaptées à la vue. | Comparer les mêmes populations et les cadences ; séparer exécution de l’identification, nouveaux recrutements prouvés et activité client. |
| Caissiers | Noms lorsque résolus, identifiants et seuils de volume présents. Le mix clientèle peut expliquer une partie des écarts. | Questions rapides par identification, tickets et CA ; maintien du magasin et de la période. | Comparaison à volume et créneau comparables, couverture des noms et recrutement attribuable ; éviter un jugement définitif sur un faible échantillon. |
| Promotions | « Tickets avec promotion » pouvait répondre avec les tickets totaux. CA remisé et CA d’articles en offre ne sont pas interchangeables. | Mesure distincte des tickets avec remise périodique, comparaison précédente et questions spécifiques. Les diagnostics de sélection incluent les ventes remisées de la sélection. | Attribution à chaque offre, exposition, cannibalisation et coûts ; mesure incrémentale/ROI seulement avec contrefactuel et coûts prouvés. Couverture des offres par catégorie encore à qualifier. |

## Règles de calcul du nouveau diagnostic de sélection

- La sélection porte sur toutes les références qualifiées correspondant au filtre, pas seulement le top affiché.
- Un panier contenant deux articles de la sélection compte une fois. Un ancien acheteur de plusieurs références compte une fois.
- Les achats complets de la même population avant/après sont distingués des ventes de la sélection et de ses achats associés. Ces montants ne s’additionnent pas.
- Les visites et le panier des mêmes clients revenus sont décomposés séparément.
- Aucun prix moyen ou volume global n’est calculé sur des articles hétérogènes ou des unités mélangées.
- Les ventes de la sélection sur tickets sont rapprochées des ventes préparées ; un écart rend le diagnostic partiel.
- Une preuve absente, un référentiel partiel ou une image incomplète reste explicitement non mesuré. Stock actuel et rupture historique restent séparés.
- Les tableaux agrégés sont exportables ; aucun jeton client interne n’est transmis dans la réponse.

## Validation et maîtrise du coût

Tests locaux et CI : routage de questions de toutes les vues, cinq familles de noms d’articles arbitraires, catégories/fournisseur/import/listes de codes, paniers communs, clients communs, unités mélangées, couverture absente, périmètre non autorisé, tickets de promotion et préparation Dynamics. Les parcours existants de marge, dates, détention, inventaires, Article 360 et classement restent vérifiés.

Les nouvelles branches calculent leurs réponses à partir des preuves et réutilisent les caches. Aucun appel payant au fournisseur IA n’est nécessaire pour ces scénarios. Les tests n’écrivent pas dans Dynamics. Les droits d’accès et protections restent inchangés.

## Ordre de poursuite

1. Fiabilité et pertinence : erreurs de routage, source, date et double comptage — première vague ci-dessus.
2. Promotions et marge : couverture par offre, conditions, coûts, écarts et contrôle des comparaisons.
3. Détention et stock : rapidité, priorités magasin/entrepôt, réceptions et images historiques.
4. Clients et fidélité : populations comparables, cadence, retour et composition du panier.
5. Réseau, catégories et fournisseurs : investigations croisées et actions mesurables.
6. Restitution : synthèse direction, navigation, filtres persistants et exports cohérents.

Chaque correction doit disposer d’un exemple de question, d’un résultat attendu, d’un contrôle du calcul et d’une vérification de l’écran. Une nouvelle carte ou une réponse plus longue ne suffit pas.


## Mise à jour du 5 novembre 2026

Les douze vues ont maintenant un guide court repliable : quoi regarder et quoi faire ensuite. Le panneau CRM et Fidélité met en avant le retour observé et décompose les dépenses des mêmes clients revenus entre visites et panier. Il réutilise les preuves préparées ou propose un seul bouton de calcul. Une progression indique une piste à confirmer, pas une note absolue ; une journée ouverte reste provisoire. Le même calcul alimente la réponse de l’agent sur le retour des clients.

Le CRM rapproche aussi la variation du CA identifié : variation des mêmes clients revenus + ventes des nouveaux observés − CA antérieur des non-revus. Les codes d’offre lisibles sur les tickets remises permettent de suivre les tickets et clients associés par offre, avec un taux de couverture. Les offres peuvent se chevaucher ; ni un code, ni un non-retour ne prouve l’effet causal d’une promotion ou d’une opération. L’analyse par opération nécessite encore un calendrier fiable et une association vérifiée aux magasins, articles et tickets.
