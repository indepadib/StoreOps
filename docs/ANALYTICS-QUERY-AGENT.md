# Agent Analytics : requêtes contrôlées et coût maîtrisé

L’agent interprète la mesure, le regroupement, les filtres, le tri, les limites, les dates et les relances avant de calculer une réponse. Il ne remplace jamais une question inconnue par une synthèse du réseau.

## Demandes traitées sans appel IA

- Top/flop articles, magasins, fournisseurs, départements, rayons, familles et caissiers, par CA, écart, marge ou quantité comparable.
- Listes, compte distinct, seuils numériques, articles sans vente ou en recul ; exports limités à 500 lignes.
- Filtres codes articles, nom entre guillemets, fournisseur, catégorie, import/local, unité, magasin autorisé.
- Comparaison des ventes, tickets et paniers ; variation expliquée arithmétiquement par le trafic et le panier ; contributions observées.
- Concentration du CA, Pareto et dépendance aux premières références.
- Identification client, cohortes, prix réalisés et associations lorsque les tickets détaillés de la période sont déjà préparés.
- Stock actuel, rupture observée, présence entrepôt, détention historique et relative ; registres locaux de démarque et inventaire.
- Relances « et à Trèfle ? », « seulement l’import », « les suivants » : conservation du plan précédent.

## Coûts et confidentialité

Les demandes reconnues sont calculées localement sans fournisseur IA. Les questions inconnues peuvent être traduites en plan par un appel Anthropic de 900 jetons maximum, 14 secondes, sans nouvelle tentative automatique. Le fournisseur reçoit uniquement la question et le plan précédent, jamais les tables, noms/comptes clients ni agrégats financiers. Attention : la question elle-même est transmise ; ne pas y coller de données confidentielles. Le plan est validé par une liste fermée d’opérations, sans SQL ni code. Cache des intentions : 24 heures ; résultats : 5 minutes selon empreinte des preuves. Aucun appel au fournisseur au build.

Les preuves préparées sont réutilisées. Aucune lecture détaillée Dynamics n’est déclenchée par cette nouvelle voie. Une période absente donne un bouton de chargement explicite ; une analyse de paniers absente invite à préparer la vue Ventes. Les anciennes enquêtes Article 360 gardent leur propre parcours.

## Limites visibles

Un ticket n’est pas un client. Non revu n’est pas perdu. Une comparaison avant/après ne démontre pas une causalité. Un coût actuel ne certifie pas la marge historique. Le prix réalisé n’est pas un tarif ou un trade agreement. Les tickets fournisseur ne sont pas additionnés entre articles. Les unités inconnues ou différentes bloquent un classement en quantité. Les données manquantes restent non mesurées.

Les croisements non disponibles entre filtres articles et agrégats magasins/horaires/clients sont signalés, jamais ignorés. Les registres locaux ne proposent que les filtres codes articles et magasin. Les dates naturelles ambiguës demandent des dates exactes. Fenêtre maximale : 31 jours. L’historique d’ouverture n’est pas certifié si les anciens journaux ne sont plus exposés. Le classement import utilise le fournisseur actuel Extenc International selon la convention métier.

## Vérification

`node backend/tests/analytics-query-agent.mjs` couvre les intentions, filtres, seuils, comparaisons, unités, cohortes, relances, dates, schémas rejetés, caches, absence de fuite de données vers le planificateur et préparation atomique du périmètre. Le test est inclus dans StoreOps CI.
