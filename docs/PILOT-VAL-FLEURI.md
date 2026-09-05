# StoreOps — Pilote Val Fleuri

## Périmètre confirmé

- Magasin pilote : Val Fleuri (`val-fleuri` / `VF`).
- Responsable magasin : Ayoub Nachiti (`u-vf`).
- Horaires : ouverture 08:00, fermeture 23:00.
- Caisses : 2.
  - C01 / Caisse 1 : TPE intégré.
  - C02 / Caisse 2 : TPE manuel.
- Terminal opérationnel principal du Responsable : téléphone mobile.
- Toute identification article doit proposer les deux modes : scan caméra + saisie manuelle.

## Identités

Les emails réels ne sont pas stockés dans GitHub.

- `STOREOPS_VF_MANAGER_EMAIL` : compte applicatif / Entra du Responsable.
- `STOREOPS_VF_D365_EMAIL` : identité Dynamics associée pour les futurs mappings et diagnostics.

Ces valeurs doivent être configurées uniquement dans les variables sécurisées du backend local ou Azure.

## Parcours Responsable magasin cible

1. Aujourd’hui : une seule prochaine action principale.
2. Ouverture guidée : équipe, sécurité, technique, froid, surface, prix/promos, caisses.
3. Exploitation : réception, DLC, qualité, prix, inventaire, démarque, maintenance et incidents.
4. Passation : sujets transmis, accusés et résolus.
5. Fermeture guidée : commerce, frais/froid, caisses, stock/réceptions, technique, sécurité.

Le Responsable ne doit pas avoir besoin d’un PC pour exécuter ce parcours.

## Froid — à confirmer avant go-live

StoreOps conserve temporairement le référentiel standard :

- Chambre froide positive : 0 à 4 °C.
- Meubles frais / PLS : 0 à 4 °C.
- Surgelés : -30 à -18 °C.

Avant passage en production, confirmer les zones et appareils réellement présents à Val Fleuri et adapter les libellés/codes appareils si nécessaire.

## Dynamics

Déjà exploitable / avancé : lectures article, EAN, prix, promotions et stock selon les mappings existants.

À mapper avant activation des écritures réelles :

- réception PO → Dynamics ;
- ajustement inventaire → Dynamics ;
- démarque / perte → Dynamics ;
- préparation et clôture caisses Commerce/Dynamics live.

Ces writes ne doivent pas retarder le pilote UX et opérationnel : StoreOps peut démarrer avec lectures D365 live et validations StoreOps réelles.

## Critères go-live pilote

- Backend accessible depuis téléphone en HTTPS.
- Authentification Entra du Responsable testée.
- Val Fleuri limité au bon périmètre magasin.
- 08:00 / 23:00 vérifiés dans l’application.
- 2 caisses visibles avec le bon type de TPE.
- Scan + saisie manuelle testés sur iPhone.
- Caméra autorisée sur le domaine StoreOps.
- Contrôle prix, réception, DLC, inventaire, qualité et démarque réalisables entièrement sur mobile.
- Photos/preuves sauvegardées côté backend.
- Ouverture et fermeture bloquées tant que les gates obligatoires ne sont pas conformes.
- Direction capable de voir les écarts, incidents et retards du magasin.
