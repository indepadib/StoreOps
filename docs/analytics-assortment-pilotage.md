# Assortiment : comparaison métier, preuves et exports

## Lecture livrée

Dans Détention, le comparateur est initialisé sur Val Fleuri → Trèfle, mais les
deux magasins peuvent être inversés ou remplacés par des magasins autorisés.
Les dates globales sont appliquées aux ventes ; les deux sélecteurs propres au
comparateur définissent son périmètre magasin. Les réceptions ne sont pas
limitées à la période de ventes.

« Vendus source, sans réception historique cible » signifie CA net positif dans
le magasin source et absence de la référence dans les achats/transferts reçus
accessibles du magasin cible. Ce n’est pas une certification depuis l’ouverture,
ni une preuve d’absence de vente cible. Cette dernière lecture est optionnelle
et reste N/D tant qu’elle n’a pas été demandée et entièrement lue.

Les lectures disponibles distinguent aussi les articles vendus dans les deux
magasins, reçus cible sans activité de vente sur la période, vendus cible sans
réception retrouvée, et les historiques incomplets. Un article présent dans les
transactions avec un net nul peut comporter ventes et retours : il ne devient
pas un invendu. Le CA source n’est jamais présenté comme potentiel CA cible.

Les codes HS-006590 et HS-007149 utilisent la continuité article existante : une
réception de l’ancien code exclut le nouveau d’un faux écart d’assortiment.
Les quantités restent séparées par unité ; les moyennes de CA sont des moyennes
par jour calendaire de la période, et non des moyennes de jours d’ouverture.

## Contraintes de preuve appliquées

| Source ou contrainte | Comportement |
| --- | --- |
| Ventes tronquées, période trouée ou mauvais magasin | Résultat bloqué ; aucun total partiel publié |
| Historique incomplet | Absence de réception non conclue ; preuve positive conservée |
| Page D365 courte avec continuation | Continuation lue ; jamais assimilée à la fin de collection |
| Réponse de réception invalide ou continuation répétée | Historique partiel, classification d’absence suspendue |
| Historique de l’ancienne pagination | Cache invalidé, préparation renforcée requise |
| Ventes cible non demandées | N/D, aucune substitution par zéro |
| Quantités g/kg/PC | Pas d’addition entre unités ou articles |
| Libellé/hiérarchie manquant | N/D, enrichissement catalogue explicite et filtre des absences |
| Fournisseur/origine | Fiche actuelle ; aucune attribution fictive d’achats historiques |
| Périmètre utilisateur | Contrôle serveur de chaque magasin ; export du même périmètre |
| Changement de date/magasin en cours | Annulation et rejet des réponses tardives |

La lecture de ventes est allégée et découpée en tranches de deux jours, avec au
plus deux requêtes simultanées. Les caches existants sont réutilisés. Le
comparateur ne dépend pas du chargement de tout le référentiel de stock. Cela
n’est pas une mesure de vitesse sur D365 réel.

## Tableau de travail et exports

Le filtre de lecture métier est suivi d’une recherche globale, de filtres sur
chaque colonne affichée (texte, N/A, opérateurs numériques), de tris, du choix
des colonnes et de regroupements département, rayon, famille, fournisseur ou
lecture métier. Les colonnes de hiérarchie incluent sous-famille et
sous-sous-famille. Les filtres portent sur toute la lecture, avant pagination.

Le CSV et l’Excel permettent de choisir lignes filtrées ou totalité de la
lecture métier, et colonnes visibles ou toutes les colonnes. Le tableau affiche
100 lignes par page ; cette limite ne s’applique pas aux exports. Les exports
contiennent magasins, période et qualification de l’historique. L’Excel ajoute
les paramètres/filtres et, si demandé à l’écran, la synthèse regroupée. Les
compteurs suivent les filtres du tableau. Les informations absentes restent
absentes, y compris dans les fichiers.

## Règles d’action et suites de pilotage

| Question métier | Lecture propriétaire / prérequis | Décision permise |
| --- | --- | --- |
| Référence source performante, non reçue cible ? | Ce comparateur, historique cible préparé | Étudier référencement et adéquation locale |
| Référence reçue cible, sans vente ? | Ventes cible complètes ; disponibilité à vérifier séparément | Diagnostiquer prix, présentation, disponibilité, demande |
| Ventes cible sans réception retrouvée ? | Rapprochement ventes/réceptions | Réconcilier les mouvements avant toute proposition |
| Référence à réapprovisionner ? | Page Réapprovisionnement : stock utilisable, demande, arrivages, délai, sécurité, cycle et colisage fiables | Proposition calculée et contrôlée, pas commande automatique |
| Manque ou excès au niveau famille ? | Catégories : hiérarchie complète et unités cohérentes | Arbitrer largeur/profondeur, pas additionner les détentions magasins |
| PO entrepôt ou TO magasin ? | Origine du flux, fournisseur/entrepôt, stocks et engagements prouvés | PO vers entrepôt, TO depuis entrepôt ; pas duplication du besoin |

Avant d’industrialiser les quantités d’introduction ou de réassort, documenter
explicitement : assortiment autorisé/détention historique, cycle de vie,
profondeur, saisonnalité/promotion, jours d’ouverture et de rupture, demande
locale, délai et calendrier de livraison, quantités réservées/en transit,
stock utilisable, colisage/MOQ, capacité rayon/entrepôt, durée de conservation et
budget. Une donnée manquante ne devient pas un paramètre certifié. Le comparatif
source/cible ne remplace pas ces contraintes et ne génère aucune commande.

## Validation et limites

Tests métier : autorisations, dates et périodes complètes, deux lectures
simultanées au maximum, continuité des codes, historique partiel, activité nette
nulle, filtres et agrégations avec valeurs inconnues. Tests de pagination des
réceptions pour lignes et en-têtes, réponses invalides et curseurs répétés.
Test DOM de montage, comparaison par défaut, pagination à 100, filtre numérique
sur tout le jeu, CSV de 201 lignes et Excel regroupé avec libellés enrichis.
La vérification visuelle dans le navigateur local n’a pas pu aboutir (connexion
locale inaccessible). Aucune liste chiffrée réelle Val Fleuri/Trèfle n’est
certifiée par ces jeux synthétiques : elle doit être calculée dans la session
autorisée à partir des sources réelles.
