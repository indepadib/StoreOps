# Retail Intelligence — Customer Decision Science V2
**Diagnostic, méthode et spécifications d'un moteur de compréhension client**

Date: 2026-11-08 · Périmètre initial Franprix Trèfle / Val Fleuri · Données D365 et fidélité.
**Statut:** cadrage de référence. Le moteur Journey V2 du même lot couvre déjà certains cas sur deux fenêtres ; le modèle longitudinal et les tests causaux ci-dessous sont la cible, pas des fonctionnalités déployées.

## Question de direction
« Pourquoi certains clients viennent moins, ne reviennent pas, dépensent moins ou changent leurs achats ? Qu'est-ce que nous pouvons prouver ? Quelle intervention commerciale est rationnelle et rentable ? »

Une hausse du jus d'orange ou du poulet n'est **qu'une hypothèse parmi d'autres**. Un même client peut diminuer les quantités, acheter un format moins cher, changer de marque, profiter d'une promotion ailleurs, rencontrer une rupture ou ne plus avoir le même besoin. Sans preuve d'achat chez la concurrence, il est incorrect de conclure à un transfert vers un concurrent.

## 1. Les 10 règles du laboratoire analytique
1. Le parcours commence avec **un client stable**, des tickets distincts et leurs lignes datées.
2. Les recrutements de carte fidélité et les premiers tickets identifiés sont deux événements différents.
3. Une « première visite » exige l'historique depuis l'ouverture ; les cohortes trop récentes sont censurées à droite.
4. Un « client perdu » n'est pas un client absent 30 jours : utiliser son intervalle habituel et l'observation multi-magasins.
5. La moyenne des prix payés n'est ni le prix catalogue ni un changement de tarif : distinguer prix brut, remises, prix net TTC, UOM, poids.
6. Le CA d'un article ne mesure pas sa capacité à déclencher une visite : l'importance en panier, portée client et visibilité prix comptent.
7. Un client qui revient sans un article n'est **pas** un client perdu ; et l'article n'a pas forcément été remplacé.
8. Une rupture de stock actuelle ne certifie pas une rupture passée ; l'absence de ventes ne prouve pas le manque de stock.
9. Les revenus historiques des clients non revus ne doivent pas être intitulés « revenus perdus ».
10. L'agent doit afficher calcul, origine, couverture, comparaison, données manquantes et **niveau de preuve**, jamais inventer une cause.

## 2. Les 30 analyses à rendre disponibles

| # | Analyse et jointures | Mesure centrale | Ce que la direction décide |
|---|---|---|---|
| A01 | Adhésions D365 × magasin × jour × premières transactions | Adhésions / premier achat / clients ré-identifiés | Recrutement vrai vs simple identification |
| A02 | Cohorte d'ouverture × première transaction × répétition | Réachat J+7/30/60/90, censure | Trouver quand on rate le deuxième achat |
| A03 | Première semaine de visite × magasin × recrutement | Cohortes de première venue | Comparer qualité du recrutement dans les 2 magasins |
| A04 | Dernière visite × intervalle médian individuel × dates | Ratio recency / cycle habituel | Distinguer retard normal de risque de départ |
| A05 | Client × fréquentation avant/après × période normalisée | Évolution des visites sur mêmes clients | Distinguer moins de clients et moins de visites |
| A06 | Client × CA × tickets × panier × marges validées | CA et marge par client actif | Prioriser impact économique et pas volume brut |
| A07 | Client × fréquence × date × jours magasin | Déplacement du jour/heure de visite | Adapter planning, disponibilité, animations |
| B01 | Client × panier/ligne × SKU avant/après | Articles abandonnés, conservés, ajoutés | Comprendre comment change le panier |
| B02 | Client × produit habituel × jours/achats d'article | Non-réachat de produit parmi clients revenus | Repérer les abandons de produits |
| B03 | Client × article A abandonné × article B acheté × famille/usage | Substitution candidate fiable | Ajuster offre et alternatives |
| B04 | Client × SKU × quantité × unité × format | Trading down : format, marque, quantité | Identifier arbitrages de budget |
| B05 | Panier × univers × associations × sensibilité client | Attachement de catégories, panier halo | Préserver articles qui tirent tout un panier |
| B06 | Client × prix connu des SKU × panier constant | Coût d'un panier comparable, base constante | Mesurer inflation vécue par la clientèle |
| C01 | SKU × magasin × jour × date tarif de base | Prix officiel avant/après vérifié | Confirmer qu'un prix a réellement changé |
| C02 | SKU × ventes × quantité × unité × promotions | Prix réellement payé et volume | Séparer hausse tarifaire, remises, mix |
| C03 | SKU × clients touchés × récence × visites | Portée d'une hausse par type de client | Identifier articles à fort risque relationnel |
| C04 | SKU × fréquence × pénétration × part clients sensibles | Key Value Items (KVI) | Choisir où défendre la perception prix |
| C05 | SKU traité × contrôle similaire × date d'événement | Évolution nette en différence de différences | Tester effet associatif avec meilleures bases |
| C06 | SKU × baisse quantité × référence substitutive × prix relatif | Élasticité et cross-élasticité exploratoires | Fixer tarifs / tester substitutions |
| C07 | Client × article sensible × panier sans cet article | Baisse du panier complet vs seule ligne | Identifier produits dont prix affecte autres achats |
| D01 | Client × ticket × promotion × prix normal | Part des achats remisés et tendance | Contrôler dépendance promo |
| D02 | Client × promotion terminée × retour ultérieur | Retour post-promo à 7/30 jours | Distinguer trafic d'aubaine et fidélité |
| D03 | Promotion × unités incrémentales × marges validées | Ventes/marge additionnelles estimées | Éviter promos destructrices de marge |
| D04 | Promo SKU × catégorie × références non promues | Cannibalisation, halo, panier total | Mesurer contribution totale de l'offre |
| E01 | SKU × stock horodaté × assortiment × vente attendue | Jours de rupture prouvée | Corriger un défaut d'approvisionnement |
| E02 | Client × produit favori × rupture datée × visite suivante | Changement de visite après rupture | Quantifier clients exposés à une rupture |
| E03 | Nouvel assortiment × clients / catégories | Perte de choix et réactions | Comprendre l'effet d'un assortiment insuffisant |
| E04 | Magasin × horaires × incidents × personnel × NPS/réclamations | Évolution clientèle avec incidents datés | Traiter qualité d'exécution et service |
| E05 | Réseau × magasin × campagne × événements calendaires | Variation ajustée jours comparables | Séparer facteurs réseau et magasin |
| F01 | Segment à risque × traitement CRM × groupe témoin | Gain incrémental de réachat et marge | Déployer seulement les actions efficaces |

### Lectures conditionnelles
- **Données déjà exploitables** : tickets D365, lignes produits, prix TTC réalisés, remises présentes sur lignes, dates, magasins, identifiants clients lorsqu'ils existent, événements d'adhésion (sous couverture source).
- **Données non certifiées à raccorder** : véritables dates d'ouverture, historique complet des prix catalogue par SKU/magasin/date, stock quotidien historisé avec réserve/rayon, hiérarchie et unités exhaustives, plans promotionnels et dates, campagnes délivrées, retours clients/NPS, concurrence, marge HT validée.
- **Non observable sans source dédiée** : achats chez les concurrents, raisons psychologiques de départ, satisfaction réelle, présence physique d'un client anonyme. Proposer sondage / CRM opt-in, et ne pas substituer une inférence.

## 3. Exactement comment répondre à « Le prix du jus ou du poulet explique-t-il une partie des non-retours ? »
1. Cartographier tous les SKU pertinents, variantes, tailles, codes-barres et unités homogènes ; vérifier le prix catalogue officiel de chaque jour.
2. Détecter les **événements réels** de hausse pour les articles et le magasin ; distinguer promo terminée et prix public changé.
3. Reconstituer 8 à 12 semaines minimum avant/après pour chaque événement quand l'historique existe ; marquer semaines de Ramadan, vacances, jours fériés, ouvertures, horaires.
4. Identifier les anciens acheteurs qui ont acheté l'article avant la hausse. Construire des groupes **avant exposition**, pas sur une action de l'après.
5. Suivre séparément (i) rachat de l'article, (ii) achats d'autres SKU de même besoin, (iii) visites du magasin, (iv) visites autres magasins réseau, (v) coût du panier comparable, (vi) CA/marge par client.
6. Contrôler niveau de fréquence préalable, magasin, panier préalable, remise préalable, saison, catégorie, stock et prix concurrent disponible.
7. Préparer des témoins comparables : magasins / SKU sans changement mais tendances préexistantes proches, et éventuellement groupes clients appariés avant événement. **Attention :** absence d'exposition n'est pas randomisée ; ne pas confondre un écart descriptif avec un effet causal.
8. Vérifier les tendances **avant** hausse, l'absence d'autre choc simultané, la stabilité des définitions et la couverture des tickets identifiés.
9. Publier : variation du prix officiel, variation du prix réalisé, quantités, pénétration panier, réachat, retour magasin, changement de panier, effectifs exposés, périodes, intervalle d'incertitude, confondants restants.
10. Pour isoler la causalité, tester un retour prix / offre ciblée sur groupes ou magasins sélectionnés avec assignation adaptée, suivi du panier complet et de la marge, et garde-fous business.

### Exemple de lecture — **illustratif, non observé**
- Référence S : tarif officiel +12 %, prix réalisé +9 %, unités/ticket -15 %, clients acheteurs historiques revus 36 % contre 47 % chez groupe apparié ; baisse du panier hors S de -6 % ; rupture 2 jours à vérifier.
- Conclusion autorisée : « signal défavorable cohérent avec une contribution prix possible ; impossible d'attribuer 11 points d'écart au prix sans isoler rupture, promotions et tendances antérieures ».
- Action : audit tarif / disponibilité ; pilotage tarif ou promo limité + groupe témoin ; vérifier rentabilité totale, pas seulement CA de S.

## 4. Mécanique CRM : du churn brut à un client en retard
- RFM n'est qu'une première segmentation. Les cycles d'achat diffèrent : un client « tous les 3 jours » absent 15 jours est plus préoccupant qu'un client « tous les 30 jours » absent 15 jours.
- Pour les vraies cohortes de primo-acheteurs, construire la probabilité d'un **deuxième achat** par J+7, J+14, J+30, J+60, J+90, avec *right-censoring*. Éviter d'inclure dans le dénominateur J+90 des clients recrutés il y a 8 jours.
- Utiliser des modèles simples d'abord : intervalle médian par client × recency, analyse de survie, RFM+tenure et taux d'identification par magasin. Les modèles ML n'ont de valeur qu'avec étiquettes et historique fiables.
- Campagnes : onboarding à partir de première inscription/achat, rappel favori disponible, substitution pertinente, offre ciblée sur clients réellement à risque ; consentement et contrôle de fréquence.
- Mesurer par holdout : réachat incrémental, tickets incrémentaux, marge HT validée, coût d'avantage, et effet d'aubaine.

## 5. Modèle de données cible (non matérialisé actuellement)
Granularités requises :
- **ticket** : store, caisse/terminal, transaction ID, date/heure locale, customer_key, vente TTC/HT certifiées, remises, total lignes, source système ;
- **ligne** : transaction + line ID, SKU, quantité, unité, montant TTC, taxes, remise, promo/règle, prix brut/net, annulation/retour, référence versionnée ;
- **client** : customer_key pseudonymisé stable et contrôlé, première adhésion certifiée, première visite observée, magasins, consentement, événements CRM ;
- **tarif** : SKU × magasin/groupe prix × période de validité, source officielle, quantité tarifaire, UOM, prix normal et promo ;
- **stock** : SKU × magasin/rayon/réserve × snapshot journalier, disponible, assortiment, rupture détectée, commande, réception ;
- **promotion** : identifiant, mécanique, calendrier, éligibilité, magasins et articles ;
- **commerce** : calendrier, heures d'ouverture, ruptures de service, campagnes, réclamations, trafic physique externe si capteur disponible.

**Architecture recommandée** : D365 → ingestion incrémentale par magasin/date → faits persistants versionnés → contrôles contre Retail & Commerce → agrégats journaliers → analyses cohortes et événements → agent de questionnement sur métadonnées sécurisées. Ne pas recalculer 31 jours par utilisateur ni dépendre uniquement des caches à expiration.

## 6. Contrôle qualité et critères d'acceptation
- Cohérence CA/tickets avec Retail & Commerce à périmètre explicite, sans mixer HT/TTC, retours et annulations.
- Aucune ligne sans identité transaction complète ne doit entrer silencieusement dans les cohorte clients.
- Historique sans trous et jours certifiés par magasin avant de conclure au non-retour.
- taux d'identification affiché ; distinguer biais des clients encartés vs clients anonymes.
- correspondance UOM complète par SKU ; jamais additionner unités/g/kg ni présenter un faux changement de prix.
- traçabilité de la date officielle de tarif et de la fenêtre de validité de promotion.
- garanties CNDP / rôles d'accès magasin / confidentialité et anonymisation des exemples.
- jamais de « lost sales » estimées par simple extrapolation du CA historique.
- chaque insight = fait mesuré + calcul + population + fenêtre + statut de preuve + alternatives plausibles + action + condition de confirmation.
- tests fonctionnels de questions composées et multilingues FR/EN/darija : refus d'un résultat générique qui ne répond pas à la question.

## 7. Contrat produit pour l'agent
Pipeline obligatoire :
**Question → compréhension de l'intention et du périmètre → plan multi-analyses → qualité et disponibilité des sources → requêtes déterministes → comparaison témoin éventuelle → synthèse sourcée → actions classées → question de suivi.**

Exemple :
« Explique pourquoi la fréquentation des habitués a baissé à Val Fleuri et quels paniers ont changé depuis la hausse du jus, tout en tenant compte des promotions et des ruptures. »

Plan analytique :
1. cohorte habitués Val Fleuri, rythme de visite avant/après ;
2. liste des hausses tarifaires vérifiées et produits KVI touchés ;
3. article S : clients exposés avant hausse, retours, panier et substitution ;
4. variation du panier hors SKU sensible ;
5. promotions/rabais sur ces clients et articles ;
6. stock horodaté ; si absent, marquer **hypothèse non vérifiée** ;
7. comparaison magasins/témoins ; contrôle tendances préalables ;
8. sortie : chiffres, niveaux d'incertitude, 3 priorités, tests correctifs.

Le système doit répondre « analyse impossible car source X manquante » seulement pour **la composante X**, tout en publiant les sous-analyses réalisables. Un agent ne doit jamais répondre « impact du prix prouvé » sur des ventes moyennes non ajustées.

## 8. Bibliographie professionnelle
- McKinsey, *Pricing and promotions: The analytics opportunity* : https://www.mckinsey.com/capabilities/growth-marketing-and-sales/our-insights/pricing-and-promotions-the-analytics-opportunity
- McKinsey, *How retailers can improve price perception—profitably* : https://www.mckinsey.com/industries/retail/our-insights/how-retailers-can-improve-price-perception-profitably
- McKinsey, *State of Grocery North America 2026* : https://www.mckinsey.com/industries/retail/our-insights/the-state-of-grocery-north-america
- Journal of Retailing (2025), *Multicategory purchase behavior: basket choice, shopping frequency, and promotional analysis* : https://www.sciencedirect.com/science/article/pii/S0022435925000612
- Felgate et al. (2012), *Using Supermarket Loyalty Card Data to Analyse the Impact of Promotions* : https://doi.org/10.2501/IJMR-54-2-221-240
- El Haddou-Yousfi & Lakhrif (2021), étude marocaine, *General retail stock-outs: To which extent is consumer loyalty behavior affected?* : https://doi.org/10.48376/IMIST.PRSM/remarem-v13i1.26619
- Fitzsimons (2000), *Consumer Response to Stockouts* : https://doi.org/10.1086/314323
- *Observational Price Variation in Scanner Data Does Not Reproduce Experimental Price Elasticities* (working paper) : https://papers.ssrn.com/sol3/Delivery.cfm?abstractid=4899765
- *Survival Analysis — Time to First Repeat Purchase* (worked retail demonstration) : https://per-paulsen.github.io/retail-customer-analysis/06-survival.html
