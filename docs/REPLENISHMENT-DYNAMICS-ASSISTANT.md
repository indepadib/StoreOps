# StoreOps V1.59 — Réapprovisionnement & Dynamics Assistant

## Objectif

StoreOps ne doit pas seulement détecter une anomalie. Il doit recommander l’action opérationnelle la plus sûre, réduire la ressaisie et préparer les mouvements pour Dynamics 365.

## Logique réapprovisionnement

Ordre de décision :

1. stock négatif → inventaire ciblé avant toute commande ;
2. stock nul / faible → vérifier les entrants déjà prévus ;
3. si un entrant couvre le besoin → ne pas commander en doublon ;
4. si le dépôt central a du stock → Transfer Order recommandé ;
5. sinon → Purchase Order fournisseur recommandé ;
6. le Responsable valide toujours la recommandation. V1.59 ne crée jamais automatiquement un PO fournisseur.

### Couverture

En Showcase, la couverture est calculée avec :

`couverture_jours = stock_disponible / ventes_moyennes_jour`

Seuil de risque : **2,5 jours**.

Cible standard : **5 jours**. Cible article en promotion : **7 jours**.

Les ventes moyennes, stock dépôt et entrants sont simulés dans le Showcase. En LIVE, aucune recommandation PO/TO ne doit être émise tant que ces sources n’ont pas été mappées dans Dynamics.

## Parcours stock négatif

`Alerte stock négatif → Stock & inventaire → Compter maintenant → création d’un inventaire ciblé → scan/EAN préchargé → comptage aveugle → écart final → mouvement prêt pour Dynamics`

Le stock système reste masqué pendant le premier comptage conformément à la politique d’inventaire StoreOps.

## Lot réapprovisionnement

Les boutons `Préparer TO` et `Préparer PO` ajoutent la recommandation à un lot local StoreOps. Le lot peut être exporté en CSV avec les champs :

- ACTION
- DESTINATION_STORE
- DESTINATION_WAREHOUSE
- SOURCE_WAREHOUSE
- ITEM_NUMBER
- EAN
- QUANTITY
- REQUESTED_DATE
- RATIONALE
- CREATED_AT

Ce CSV est un **format pilote StoreOps**. Le schéma exact de Data Management F&O doit être validé avant import direct.

## Export inventaire / démarque

StoreOps rassemble les mouvements prêts à poster :

- sessions d’inventaire `READY_TO_POST` avec écart final non nul ;
- démarques `READY_TO_POST` ou `APPROVED`.

Le CSV pilote contient :

- LEGAL_ENTITY
- WAREHOUSE
- TRANSACTION_TYPE
- ITEM_NUMBER
- EAN
- QUANTITY
- UNIT
- REASON_CODE
- REFERENCE
- SOURCE_TYPE
- SOURCE_ID
- DATE
- NOTE

Une quantité de démarque est exportée en négatif. Un écart d’inventaire conserve son signe.

## Cible après validation F&O

Phase 1 : `StoreOps → fichier pilote → import Dynamics`

Phase 2 : `StoreOps → prévisualisation → confirmer → API/Data Entity Dynamics`

Phase 3 : les opérations magasin courantes sont postées sans ressaisie, avec journal d’audit et contrôle des permissions.

Aucune écriture automatique ne doit être activée avant validation du journal F&O, des dimensions de stock, des reason codes et du modèle d’import réel One Retail.
