# Audit ergonomique page par page

Revue des 13 rubriques Analytics, des 29 pages déclarées dans StoreOps et du cockpit Entrepôt. Chaque ligne indique le premier résultat attendu, le point de friction à vérifier et le changement proposé. Revue du produit et de son code. Les tests avec des utilisateurs authentifiés, les droits par profil et la performance réelle restent à mesurer. Les corrections livrées ici concernent la navigation Analytics.

## StoreOps Analytics

| Page | Question de départ | Point relevé et suite de la revue |
| --- | --- | --- |
| Vue exécutive | Où faut-il agir ? | La synthèse et ses exports coexistent avec le sélecteur de niveau. Mettre en premier les écarts à expliquer avec un accès au magasin concerné. |
| Ventes | Pourquoi le CA a changé ? | Diagnostic, analyses panier et prix cohabitent. Garder CA, tickets et panier au premier niveau, puis ouvrir contributions et preuve dans le même périmètre. Rapprocher le CA magasin/jour. |
| Réseau | Quel magasin décroche ? | Comparaison et studio d’analyse partagent l’écran. Permettre de choisir un magasin dans la comparaison et de retrouver les mêmes dates dans son diagnostic. |
| Produits & catégories | Quel rayon ou article explique l’écart ? | La hiérarchie se lit à plusieurs niveaux et la fiche article est séparée. Rendre le chemin département → article explicite et vérifier les unités et marges. |
| Fournisseurs | Quel fournisseur est en défaut ? | Le taux de service et sa couverture sont au bas de la page. Donner un accès direct, puis rapprocher quantités reçues et commandées par fournisseur et fenêtre. |
| Clients & CRM | Quels clients ne reviennent plus ? | Étude avant/après et nombreux blocs CRM dans la même rubrique. Commencer par choisir la cohorte et les deux périodes. Expliquer « non revu » à côté du chiffre. |
| Fidélité | Combien de comptes nouveaux et combien de tickets identifiés ? | La création de compte est confondue avec l’enrôlement de carte dans le code publié. Qualifier ou suspendre le KPI dans les vues, exports et réponses, puis rapprocher les comptes distincts. |
| Caissiers | Où aider l’équipe à mieux identifier les clients ? | Fenêtre et recherche par caissier sont propres à l’écran. Afficher à côté de chaque taux le nombre de tickets et la période effective. |
| Promotions | Cette offre mérite-t-elle d’être reconduite ? | Plusieurs niveaux et tableaux distinguent les offres et les articles. Faire choisir l’offre d’abord, puis afficher la comparaison et sa couverture. |
| Stock | Que faut-il corriger en premier ? | Les états du stock, la couverture et les mouvements nécessitent une lecture différente. Afficher la date de l’image et donner une liste d’actions pour rupture, écart, invendu et faible rotation. |
| Détention | Quels articles déjà reçus manquent ? | Historique magasin, historique entrepôt, relative PGC et référentiel global ont des bases différentes. Mettre l’historique magasin en premier et placer le dénominateur à côté de chaque taux. |
| Réapprovisionnement | Que commander ou transférer ? | PO et TO ont maintenant un parcours dédié. Garder sélection, génération et résultat visibles dans cet ordre. Rendre les motifs par article et la fraîcheur des sources lisibles avant export. |
| Référentiel articles | À quoi correspond ce code ? | Le référentiel utilise une image actuelle, indépendamment de la période des ventes. Commencer par EAN ou code interne, puis montrer unité, fournisseur et hiérarchie. |

## StoreOps opérationnel

| Page | Premier résultat attendu | Point relevé et suite de la revue |
| --- | --- | --- |
| Aujourd’hui | Voir la prochaine action du magasin | Plusieurs raccourcis et signaux partagent l’accueil. Commencer par les blocages du jour et leur responsable. |
| Scanner | Reconnaître un article | Les suites possibles dépendent de la recherche. Afficher d’abord le produit et proposer des actions avec des verbes. |
| Équipe manager | Savoir qui est présent | Cette vue et la prise de poste traitent du personnel. Distinguer le suivi du jour et l’action de pointer, puis les relier. |
| Performance manager | Comprendre la journée | Le tableau répond à une question locale. Mettre magasin, date et comparaison au-dessus du premier chiffre. |
| Parcours manager | Trouver une étape opérationnelle | Des entrées existent aussi dans Aujourd’hui et les contrôles. Employer les mêmes intitulés pour les mêmes tâches. |
| Contrôles manager | Ouvrir le contrôle à faire | Regrouper les contrôles à traiter et montrer leur état avant les contrôles terminés. |
| Plus | Retrouver une tâche peu fréquente | Éviter les intitulés génériques. Ranger les tâches par objectif concret et garder l’accès à la page principale. |
| Ouverture | Savoir ce qui empêche d’ouvrir | Passation, équipe, froid et caisses peuvent bloquer. Rendre la prochaine action et le retour à l’ouverture visibles. |
| Passation | Reprendre les sujets non résolus | Distinguer clairement ce qui bloque, ce qui est transmis et ce qui est déjà réglé. |
| Équipe et prise de poste | Confirmer la présence | Placer les personnes à pointer en premier et montrer le résultat sur la validation d’ouverture. |
| Chaîne du froid | Relever et traiter un écart | Afficher les zones à contrôler, les unités et le seuil au moment de saisir. |
| Préparation caisses | Confirmer qu’une caisse est prête | Distinguer la préparation du matin et la clôture du soir jusque dans les libellés. |
| Commerce | Retrouver un prix ou une opération commerciale | La fiche article, les promotions et les étiquettes répondent à des tâches différentes. Garder un accès direct à chacune. |
| Étiquettes casse et frais | Imprimer depuis un code article | Le parcours dédié doit rester court. Recetter le prix de base, le pourcentage, le motif, le nombre et l’aperçu 50 × 30 mm. |
| Réceptions | Contrôler et confirmer la livraison | Distinguer commande attendue, réception saisie et confirmation système. Montrer la prochaine action pour les écarts. |
| Inventaire | Reprendre ou démarrer un comptage | Plusieurs modes mènent au même écran. Mettre la reprise du comptage en cours avant la création. |
| Écoulement | Identifier les articles à traiter | Donner le délai, le stock et la raison de priorité par article avant de proposer une action. |
| CoolSave | Retrouver le traitement en cours | Expliquer l’objet de la page avec un verbe métier et montrer les dossiers à traiter en premier. |
| Disponibilité par canal | Corriger un produit absent d’un canal | Commencer par le canal et distinguer disponibilité connue, indisponible et inconnue. |
| Pertes et démarque | Enregistrer la sortie de stock | Rendre séparées la déclaration, la validation et la consultation. Donner le statut après chaque étape. |
| Qualité | Traiter un écart qualité | Accès selon rôle. La liste doit faire ressortir le prochain contrôle, la preuve demandée et l’état de validation. |
| Maintenance | Déclarer et suivre une panne | Afficher l’équipement, l’impact sur le magasin et le statut avant les détails. |
| Incidents | Signaler ou résoudre un incident | Le traitement et les preuves existent. Prioriser les incidents ouverts et indiquer l’action attendue sur chacun. |
| Caisses et clôture | Finaliser les comptages de caisse | Expliquer les écarts et recomptages et montrer le lien avec la fermeture. |
| Fermeture | Savoir ce qui bloque la fermeture | Passation, caisses et pertes peuvent bloquer. Mettre leurs accès dans l’ordre de résolution. |
| Réseau opérationnel | Sélectionner le magasin à aider | Accès Direction. Garder le magasin visible lorsque la vue ouvre son écran opérationnel. |
| Développement | Reprendre le dossier à faire avancer | Accès dédié. Montrer les dossiers actifs, leur étape et la décision attendue. |
| Administration | Modifier le bon paramètre | Accès Direction. Séparer utilisateurs, magasins et intégrations et rendre le périmètre visible avant validation. |
| Système | Comprendre l’état d’une source | Accès Direction. Donner état, dernière preuve, impact et action par intégration. |
| Entrepôt | Arbitrer les besoins des magasins | Les besoins, achats, directs et transferts sont sur un même écran. Distinguer les flux dès l’entrée et lier chaque besoin à sa preuve. |

## Recette à conduire

Sur mobile et ordinateur, partir d’une tâche formulée dans les mots du métier. Observer le premier clic, le temps jusqu’au tableau ou à l’action, le retour vers la page précédente et les erreurs de périmètre. Inclure une source en attente, un résultat vide et un accès refusé. Vérifier que chaque statut indique la prochaine action possible.
