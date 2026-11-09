# Export mensuel — couverture panier et unités

## Défauts corrigés

La consolidation réseau supprimait les magasins sans paniers, puis traitait les
paniers restants comme une source complète. Le CA pouvait couvrir deux magasins,
alors que la présence panier, les associations ou les paniers moyens couvraient
un seul magasin. Les colonnes manquantes pouvaient ensuite être affichées à zéro.

Le repli sur la somme brute des quantités publiait aussi 1 kg + 1 000 g = 1 001
sans unité cohérente. Une seule colonne d'unité décrivait deux périodes même
quand l'unité changeait entre elles.

## Comportement

- Chaque magasin et chaque période sont contrôlés séparément. Les paniers doivent
  être une collection exploitable sans lignes à identité rejetée. Leur nombre
  doit correspondre aux tickets du lecteur ventes et leur CA aux ventes de la
  même période (écart absolu maximal de 0,02 DH pour les arrondis).
- Le réseau exige tous les magasins sélectionnés. Une source absente ou non
  rapprochée bloque uniquement les indicateurs panier concernés : null, jamais
  un sous-total du réseau annoncé complet. Les autres magasins et la comparaison
  restent consultables indépendamment. Le CA disponible est conservé.
- Le fichier est PARTIAL si les ventes ou les paniers de l'une des périodes ne
  sont pas complets. L'onglet qualité liste les motifs et la couverture. READY
  indique la complétude interne et ce rapprochement, pas une certification externe
  contre le relevé Retail & Commerce.
- Les quantités agrégées sont numériques uniquement sur une unité homogène.
  Chaque période a sa colonne d'unité. Pas de conversion g/kg supposée, pas de
  variation de quantité ou d'effet prix/volume entre unités différentes.
- Les anciens résultats de préparation et la reprise navigateur sont versionnés
  pour ne pas resservir un export calculé avec l'ancienne logique.

## Validation et limites

`analytics-export-evidence-quality.mjs` exécute le service puis la préparation
réelle des onglets à partir des lignes compactes de l'API. Cas : deux magasins,
un seul magasin disponible, décalage tickets, décalage CA, identité rejetée,
montant invalide, comparaison indépendante, g/kg, unités différentes entre
périodes, période vide valide et périmètre vide interdit.

Les contrôles existants de contrat d'export et de format XLSX restent actifs.
Aucun chiffre réel de CA n'est certifié par ces données synthétiques. Aucun
recalcul de recrutement, changement de marge ou déploiement production dans
ce correctif. Le rapprochement au relevé Retail & Commerce reste dans #322.
