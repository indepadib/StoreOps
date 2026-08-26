# Franprix StoreOps V1.3 — Full Stack prototype

Cette version sépare réellement le frontend et le backend.

## Architecture

- `frontend/` : SPA légère, thème Franprix, consommant exclusivement l'API REST.
- `backend/` : API Node.js sans dépendances externes + SQLite natif Node 22 pour la démo.
- `backend/services/permissions.mjs` : contrôle d'accès serveur.
- `backend/services/workflow.mjs` : règles ouverture / fermeture et audit.
- `backend/services/dynamics.mjs` : adaptateur Dynamics simulé à remplacer par OData / Data Events.
- `backend/storeops.db` : créé automatiquement au premier démarrage.

## Lancer

```bash
./start.sh
```

Puis ouvrir http://localhost:8787

## Utilisateurs de démo

- Responsable Val Fleuri
- Responsable Trèfle
- Responsable Zeraoui
- Responsable Sindibad
- Responsable Carita
- Directeur Exploitation
- Employé Val Fleuri

Les permissions ne sont plus uniquement visuelles : elles sont vérifiées par l'API.

## Fonctions V1.3

- multi-magasins ;
- rôles Responsable / Directeur / Employé ;
- cockpit magasin ;
- ouverture et fermeture persistées en SQL ;
- tâches et audit ;
- DLC manuelle ;
- réception article par article ;
- contrôle qualité avec règle livré = accepté + refusé ;
- création automatique de DLC depuis une réception ;
- historique qualité ;
- vue Direction multi-magasins ;
- adaptateur Dynamics isolé.

## Production cible

La V1.3 utilise SQLite uniquement pour être immédiatement exécutable sans installation. Pour production : PostgreSQL/Azure SQL, Microsoft Entra ID, Azure Blob Storage, API backend hébergée sur Azure App Service/Container Apps, et vrai connecteur Dynamics 365.
