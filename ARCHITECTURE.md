# StoreOps V1.3 — Architecture frontend / backend

## 1. Frontend

Le frontend ne possède plus la vérité métier. Il affiche les écrans et appelle l'API.

Responsabilités :
- navigation et UX ;
- saisie des contrôles ;
- scan EAN (à connecter à la caméra/PDA) ;
- affichage des parcours ;
- gestion optimiste minimale ;
- aucun droit métier sensible stocké côté client.

Pages présentes : Aujourd'hui, Ouverture, DLC, Réception, Qualité, Fermeture, Direction.

## 2. Backend

Le backend possède :
- périmètres utilisateurs ;
- contrôle d'accès ;
- règles de workflow ;
- persistance SQL ;
- audit ;
- contrôle qualité ;
- logique DLC ;
- validation des réceptions ;
- adaptateur Dynamics.

## 3. API principale

- `GET /api/session`
- `GET /api/stores`
- `GET /api/stores/:storeId/dashboard`
- `GET /api/stores/:storeId/tasks?group=opening|closing`
- `POST /api/stores/:storeId/process/:group/take`
- `POST /api/tasks/:taskId/complete`
- `POST /api/stores/:storeId/process/:group/validate`
- `GET|POST /api/stores/:storeId/dlc`
- `GET|POST /api/stores/:storeId/quality`
- `GET /api/stores/:storeId/receipts`
- `POST /api/receipts/:po/lines/:lineId/quality`
- `POST /api/receipts/:po/post`
- `GET /api/network`

## 4. Modèle de sécurité

- Responsable magasin : lecture/écriture uniquement sur son magasin.
- Directeur d'exploitation : lecture/écriture sur tous les magasins.
- Employé : accès magasin limité ; aucune écriture qualité/réception protégée.

Dans cette démo l'identité est fournie par `x-demo-user`. C'est volontairement une simulation et **pas** une authentification de production.

Production : Microsoft Entra ID / OIDC, claims signés, validation JWT côté API.

## 5. Données

V1.3 démo : SQLite natif Node 22, afin d'être immédiatement exécutable sans package externe.

Production :
- Azure SQL ou PostgreSQL managé ;
- migrations versionnées ;
- sauvegardes ;
- index par `store_id`, `business_date`, `ean`, `po_number` ;
- conservation d'audit selon politique groupe.

## 6. Photos / preuves

À ajouter ensuite :
- endpoint de pré-signature ;
- Azure Blob Storage ;
- table `evidence` ;
- type de preuve, auteur, date serveur, hash, tâche/contrôle lié ;
- mode `camera_only` pour certains contrôles.

## 7. Dynamics 365

Le frontend ne parle jamais à Dynamics.

`frontend -> StoreOps API -> DynamicsAdapter -> D365`

L'adaptateur actuel est simulé. Production :
- articles / EAN / prix / stock / PO : Data Entities OData ;
- changements prix / événements : événements Dynamics lorsque disponibles ;
- shifts / statements : lecture via les services adaptés à Commerce ;
- files/retry/outbox pour éviter la perte d'événements.

La DLC reste une donnée StoreOps saisie manuellement.

## 8. Déploiement cible

- Frontend : Netlify ou Azure Static Web Apps.
- Backend : Azure App Service / Container Apps.
- Auth : Microsoft Entra ID.
- DB : Azure SQL/PostgreSQL.
- Media : Azure Blob Storage.
- Observabilité : Application Insights.
- Secrets : Key Vault.
