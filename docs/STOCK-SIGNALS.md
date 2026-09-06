# StoreOps — Ruptures & stocks négatifs

## Objectif

Faire remonter automatiquement dans **À valider** les anomalies de stock qui demandent une action magasin, sans demander au Responsable de parcourir Dynamics ou un écran d’inventaire.

## Source Dynamics

Le flux utilise la Data Entity déjà prévue pour le stock magasin :

- Entity : `WarehousesOnHandV2`
- SKU : `ItemNumber`
- Warehouse : `InventoryWarehouseId`
- Stock physique : `OnHandQuantity`
- Stock disponible : `AvailableOnHandQuantity`
- Val Fleuri : `FRP0001`
- Trèfle : `FRP0002`

Les valeurs sont agrégées par SKU sur toutes les lignes retournées pour le warehouse afin d’éviter de transformer une dimension stock isolée à zéro en fausse rupture magasin.

Endpoint StoreOps :

`GET /api/stores/:storeId/stock-signals`

Le Responsable ne peut lire que son magasin ; la Direction peut lire les magasins de son périmètre.

## Règles de signal

- `AvailableOnHandQuantity < 0` → **STOCK NÉGATIF**, priorité `P0 / Immédiat`.
- `AvailableOnHandQuantity = 0` → **RUPTURE**, priorité `P1 / Prioritaire`.
- Rupture sur un article identifié comme promotionnel dans la file commerciale du jour → priorité remontée à `P0`.

Le stock négatif n’est pas automatiquement traité comme un blocage d’ouverture : il est critique opérationnellement, mais StoreOps évite de fermer artificiellement le magasin pour une anomalie comptable isolée.

## Priorisation Responsable

Ordre de travail :

1. **P0 — Immédiat** : sécurité/ouverture critique, stock négatif, rupture promo, écart prix/promo avéré, température critique, DLC critique.
2. **P1 — Prioritaire** : ruptures normales, recomptages, prix/promos à exécuter, réceptions en retard, anomalies fortes.
3. **P2 — Aujourd’hui** : validations opérationnelles restantes.
4. **P3 — À surveiller** : signaux non urgents.

L’écran **À valider** est trié par priorité et non plus par module.

## Sécurité / performance

- Le backend lit uniquement le warehouse du magasin demandé.
- `dataAreaId` est appliqué si configuré.
- Les lignes sont paginées puis agrégées par SKU.
- Un plafond configurable limite le nombre de ruptures remontées à l’interface.
- Aucune écriture Dynamics n’est déclenchée par ce flux.

## Variables optionnelles

Les valeurs par défaut correspondent au mapping actuel, mais peuvent être surchargées sans modifier le code :

`D365_STOCK_ENTITY`, `D365_STOCK_PRODUCT_FIELD`, `D365_STOCK_WAREHOUSE_FIELD`, `D365_STOCK_AVAILABLE_FIELD`, `D365_STOCK_PHYSICAL_FIELD`, `D365_STORE_WAREHOUSES`, `D365_STOCK_MAX_OUT_OF_STOCK`.
