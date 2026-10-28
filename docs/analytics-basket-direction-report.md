# Rapport direction des paniers

Dans Ventes, préparer un rapport sur un ou deux codes exacts et les périodes communes Analytics. Les fenêtres doivent être clôturées, disjointes et de même durée. Une date de début de fenêtre ne certifie pas un changement de tarif. La trajectoire quotidienne du prix TTC réalisé reste visible pour chaque article.

Le calcul lit les preuves de tickets déjà préparées. Les journées manquantes sont explicitement préparées par le mécanisme existant, avec deux lectures simultanées maximum et sans publication partielle. Aucun appel fournisseur IA et aucune écriture Dynamics. La sélection de magasins passe par les permissions existantes du point d’entrée assistant.

Le rapport comprend la comparaison des paniers avec et sans chaque article, les segments exclusifs de présence des articles, les achats associés et leur lift descriptif, les cohortes fixes d’acheteurs, l’évolution de leur dépense et panier, les trajectoires et le détail par magasin. Les profils articles et associations se recouvrent ; leurs valeurs ne sont pas des effets causaux à additionner.

La liste des tickets est filtrable et paginée. Les exports fournissent les tickets filtrés, toutes les lignes des paniers contenant au moins un article ciblé, les acheteurs antérieurs de chaque article et toutes les associations. Le rapport HTML est autonome et imprimable. Les détails en ligne limités à trente clients sont explicitement signalés ; le CSV clients est complet. Le contenu détaillé des tickets ne contenant aucun article ciblé est hors de l’export lignes, mais leurs montants restent dans la liste et les comparatifs.

Les clients sont représentés par des pseudonymes internes au rapport ; ni noms, ni comptes, ni jetons clients internes ne sont retournés. Les tickets portent la date, le magasin, la caisse et la référence transaction pour rapprochement dans la caisse. Aucune donnée de carte ou de paiement. Identités incomplètes, doublons, incohérences de périmètre et résultats dépassant les limites de taille bloquent le rapport sans le tronquer silencieusement.

Validation : `node backend/tests/basket-direction-report.mjs`, outils de décision, enquête article, contrat des sélecteurs et syntaxe. Les tests contrôlent les sommes des segments, la conservation avec/sans, les associations, les mêmes clients avant/après, les inconnus, le rejet du hors périmètre, les préparations manquantes et l’export CSV protégé des formules, avec conservation des montants numériques négatifs.
