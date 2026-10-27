# Analytics : synthèse et preuves de décision

La vue exécutive regroupe six indicateurs et sept panneaux sur une page : ventes réseau, catégories, stock/détention, clients, promotions/marge, fournisseurs et actions. Export PNG 1920×1080 et impression paysage. Les stocks sont actuels ; ils ne reconstituent pas une disponibilité historique à la date des ventes. Les sources non chargées restent signalées.

## Pricing et référentiel

Pricing et Article 360 sont regroupés dans Ventes. Le contrôle tarifaire reçoit un article, un magasin et une date. Il expose séparément prix de fiche, date de fiche lorsqu’elle est disponible, accords tarifaires applicables, promotions et conditions de panier. Un accord ambigu, une conversion non prouvée ou une absence de preuve historique ne doit pas devenir un prix certain. Le calcul reste indicatif et ne remplace pas le moteur caisse complet, notamment pour les offres conditionnelles.

Le référentiel exporte le prix de fiche actuel et sa date de prix si exposée par Dynamics. Ce champ n’est pas le prix effectif de chaque magasin avec trade agreements et promotions. Le dernier achat vient de la dernière ligne positive de facture fournisseur : montant HT de ligne / quantité facturée en unité d’achat. Il est distinct du coût actuel de valorisation.

## Paniers, promotions et clients

Article 360 compare pénétration, prix TTC réalisé moyen, volumes, panier avec/hors article et retour des acheteurs identifiés. Un habitué a acheté l’article lors d’au moins deux visites et dans au moins la moitié de ses visites de référence. Les trois situations restent distinctes : rachat, retour sans article, aucune visite observée. Un délai inhabituel compare le délai de retour à 1,5 fois l’intervalle médian individuel ; il ne prouve pas une perte de client.

Les ventes avec remise périodique proviennent des lignes de ticket effectivement remisées. Une ligne sans remise du même article n’est pas attribuée à la promotion. Les remises totales restent séparées ; uplift causal, ROI et cannibalisation ne sont pas déduits d’une comparaison brute.

Les identités de ticket comprennent société, magasin, caisse, journée et transaction. Le détail utilisé pour les ventes peut préparer les preuves quotidiennes de panier et éviter une seconde lecture Dynamics. Les noms clients/caissiers sont résolus depuis les référentiels, avec statut inconnu si le rapprochement échoue.

## Détention et fournisseurs

La présence sur référentiel et la détention sur assortiment attendu ont des dénominateurs différents. Un taux attendu exige un assortiment complet et des quantités connues. Aucune référence manquante dans une lecture incomplète ne devient automatiquement un stock nul. Les assortiments Dynamics par catégorie exigent une expansion et un rattachement magasin validés avant publication du taux.

Les actions distinguent stocks négatifs, attendus sans stock magasin mais disponibles à l’entrepôt, et attendus absents des deux dépôts. Elles proposent des contrôles ; elles ne déclenchent aucun transfert. Après lecture détaillée de Détention, le volet Fournisseurs regroupe les positions par fournisseur principal et magasin, avec couverture visible. Un stock nul n’établit pas la responsabilité du fournisseur.

La marge sur coût actuel est une estimation historique. Le statut, le motif et la couverture sont conservés ; les coûts inconnus ne sont pas remplacés par une valeur inventée.

## Assistant

Le serveur reconstruit les faits depuis les résultats Analytics en cache, sur les magasins autorisés et des fenêtres complètes non superposées de 31 jours maximum. Aucun total fourni par le navigateur ne sert de preuve. Les noms et comptes individuels ne sont pas transmis au modèle.

Le SDK Anthropic utilise les identifiants injectés à l’exécution par Netlify AI Gateway. Le modèle par défaut est claude-haiku-4-5, configurable par ANALYTICS_AI_MODEL. Délai 12 secondes, sans nouvelle tentative automatique. Sans fournisseur disponible, l’interface identifie explicitement la réponse calculée. La présence d’une configuration ne prouve pas le succès d’une requête IA. Les réponses citent les sources ; elles restent à contrôler avant décision.

Le POST assistant suit le chemin de lecture du pont Netlify et n’acquiert pas le verrou transactionnel des opérations magasin. Le POST d’enregistrement d’un relevé concurrent reste une écriture autorisée et persistée.

## Concurrence : Casablanca

Marjane et Carrefour sont les enseignes retenues. Les relevés sont enregistrés avec point de vente, date, prix, devise, unité, quantité et lien HTTPS de preuve. Un même code-barres doit être confirmé dans Dynamics avant qualification identique. Les produits équivalents restent hors indice identique. L’écart exige des unités comparables et des dates distantes de sept jours maximum ; il reste indicatif face au prix configuré de StoreOps. Aucun scraping ni prix concurrent fictif n’est présenté comme disponible.

## Vérifications

Tests reproductibles : analytics-action-intelligence.mjs, analytics-decision-tools.mjs, customer-product-intelligence.mjs, customer-bi-ui.mjs, analytics-period-race.mjs, analytics-loading-failure.mjs, analytics-performance-contract.mjs, pricing-hardening.mjs et sales-parent-parity.mjs. Les tests de preuves utilisent uniquement des données fictives et refusent les périodes incomplètes, magasins interdits, sources expirées et relevés invalides. Les contrôles visuels locaux (bureau/mobile, PNG et PDF une page) ne valident pas les données Dynamics de production.

## Devise et contrôle des réponses IA

Les faits transmis explicitent MAD/DH, CA TTC et marge HT. Le modèle choisit un plan d’analyse JSON ; StoreOps produit le texte affiché et tous les chiffres avec leurs unités. Une réponse utilisant une autre devise est rejetée avant affichage et remplacée par la lecture calculée des faits serveur, avec un libellé explicite. Ce contrôle ne constitue pas une certification de toutes les interprétations du modèle. Les tests couvrent une réponse IA valide et le rejet effectif d’une réponse simulée en monnaie incompatible.

Les faits distinguent transactions et clients uniques et fournissent la marge HT calculée seulement quand la source serveur la rend disponible. La couverture du coût est définie comme la part des ventes disposant d’un coût exploitable ; le statut de validation StoreOps ne constitue pas une certification comptable. Les marqueurs Markdown de titres et de gras sont normalisés pour la lecture en texte simple.

## Chiffres calculés, priorités choisies par IA

Le modèle ne rédige plus les phrases chiffrées. Il peut uniquement choisir des rubriques autorisées, jusqu’à trois articles présents dans les preuves et jusqu’à trois contrôles issus d’une liste définie. Le serveur valide ce plan, rejette tout champ libre ou code inconnu, puis construit la réponse depuis les faits autorisés. Les montants, ratios, unités, distinctions clients/tickets et qualifications de marge sont calculés et libellés par StoreOps.

Une panne fournisseur ou un plan invalide conserve le repli calculé. L’interface distingue « priorités IA, chiffres calculés par StoreOps » d’une réponse calculée seule. Cela ne transforme pas les pistes proposées en causes prouvées, et ne comble pas une source absente. Les tests refusent les chiffres ajoutés dans un champ libre, les articles inconnus, les actions inventées et la confusion entre clients uniques et tickets identifiés.

## Assortiment commun et assistant structuré
Tous les articles du référentiel commun (ReleasedProductsV2, société active) sont attendus dans chaque magasin, conformément à la règle métier confirmée. Un code de stock absent du référentiel reste visible mais hors dénominateur attendu. Le taux magasin et le taux entrepôt utilisent ce même dénominateur ; une lecture incomplète ne devient pas une absence. Les stocks sont une image actuelle. Cache detention-universe-v3.
L’assistant utilise un appel structuré select_analysis ; le serveur valide rubriques, articles et contrôles puis calcule tous les chiffres. Décomposition CA exacte tickets/panier, écarts magasin et contributions articles. Diagnostics de repli limités à des codes publics, aucun détail fournisseur sensible. Réponses de repli mises en cache 30 secondes, réponses valides 120 secondes. Cache assistant-v4.

## Enquête article / changement de prix
Le chatbot route les questions d’impact vers une enquête dédiée sur les paniers Dynamics, sans se limiter aux 30 articles du résumé. Code explicite, contexte article vérifié ou recherche lexicale ; une ambiguïté doit être résolue, jamais devinée. La date de changement définit deux fenêtres égales de journées terminées, raccourcies explicitement si le recul est insuffisant. Les journées manquantes sont préparées par deux lectures concurrentes avec progression et annulation, puis l’enquête est calculée une seule fois.
Mesures : prix TTC réalisé et remises, quantités à unité identique, pénétration, décomposition prix-volume, panier hors article, CA des achats associés, cohorte fixe d’acheteurs, rachat/retour sans article/migration/non-retour, achats avant/après par groupe, habitués et cadence, autres achats, détail magasins et chronologie. Les clients non acheteurs avant donnent un repère de retour non apparié, pas un témoin causal. Les montants de cohortes ne s’additionnent pas aux contributions article.
Les tokens clients ne sont utilisés qu’en mémoire pour les jointures et ne sont jamais renvoyés. L’enquête est calculée dans StoreOps sans transmission au fournisseur IA (providerDataSent=false). Le stock actuel et les coûts actuels ne sont pas substitués à des preuves historiques de rupture ou de marge. Rapport agrégé exportable, contexte et périodes visibles. Test : backend/tests/article-impact-analysis.mjs.
