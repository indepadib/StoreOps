# Franprix StoreOps V1.2

Prototype interactif multi-magasins — Franprix Maroc.

## Réseau de démonstration
- Val Fleuri
- Trèfle
- Zeraoui
- Sindibad
- Carita

## Rôles autorisés à piloter les contrôles qualité
- Responsable magasin : uniquement son magasin
- Directeur d'exploitation : tous les magasins

Les autres profils n'ont aucun droit de création, modification, validation ou clôture sur les réceptions et contrôles qualité.

## Nouveautés V1.2 — Qualité & réception
- Réception obligatoirement rattachée à un PO / code interne valide
- Quantité commandée, livrée, acceptée et refusée par article
- Contrôle qualité par ligne de réception
- Contrôle température conditionnel selon le profil produit
- Contrôle emballage / intégrité
- Contrôle aspect / fraîcheur
- DLC et lot saisis manuellement à la réception lorsque requis
- Création optionnelle automatique du suivi DLC StoreOps pour la quantité acceptée
- Photo obligatoire en cas de non-conformité
- Décision Accepté / Partiel / Refusé
- Incident automatique lors d'une non-conformité
- Réception système bloquée tant que toutes les lignes n'ont pas été contrôlées
- Registre Qualité magasin consolidé
- Contrôles qualité ponctuels hors réception
- KPI : contrôles, conformes, non-conformes, quantité refusée
- Vue Directeur d'exploitation enrichie avec les non-conformités qualité par magasin

## Données simulées
La V1.2 reste un prototype front autonome avec persistance navigateur. Les données Dynamics 365 sont simulées. En production, le catalogue, les PO, prix, stock, promotions, shifts et statuts transactionnels seront récupérés via la couche d'intégration Dynamics.
