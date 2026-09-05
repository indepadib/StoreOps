# StoreOps — Déploiement Azure du pilote

## Architecture pilote recommandée

Pour Val Fleuri, privilégier un déploiement simple et contrôlable :

- Frontend : Netlify StoreOps existant.
- Backend : Azure App Service Linux / Web App for Containers, 1 instance pour le pilote.
- Image : `backend/Dockerfile` du repository.
- Stockage pilote : stockage persistant de l’App Service monté sous `/home`.
- Base SQLite pilote : `STOREOPS_DB=/home/data/storeops.db`.
- Médias / preuves : `STOREOPS_MEDIA_DIR=/home/data/media`.
- HTTPS obligatoire.
- CORS : uniquement le domaine Netlify StoreOps autorisé.
- Secrets Dynamics / Entra : App Settings Azure, jamais dans GitHub.

Cette architecture est volontairement simple pour le pilote mono-instance. Avant un déploiement multi-instance/réseau complet, migrer la persistance vers une base managée adaptée (Azure SQL/PostgreSQL selon décision d’architecture) et un stockage objet pour les preuves.

## Authentification Microsoft Entra

StoreOps V1.36 utilise un flux SPA Authorization Code + PKCE, compatible téléphone et sans secret dans le navigateur.

Prévoir idéalement deux App Registrations :

1. **StoreOps API**
   - expose un scope délégué `StoreOps.Access` ;
   - son Application (client) ID alimente `ENTRA_API_CLIENT_ID` ;
   - le backend exige ce scope via `ENTRA_REQUIRED_SCOPE=StoreOps.Access`.
2. **StoreOps Mobile Web**
   - plateforme `Single-page application` ;
   - Redirect URI : `https://franprix-storeops.netlify.app/` ;
   - autorisée à demander le scope `api://<API_CLIENT_ID>/StoreOps.Access` ;
   - son Application (client) ID est configuré dans Netlify, jamais comme secret.

Aucun client secret n’est nécessaire pour le SPA. Le backend garde ses propres secrets D365 dans Azure App Settings.

## App Settings backend Azure

```text
NODE_ENV=production
PORT=8787
STOREOPS_DB=/home/data/storeops.db
STOREOPS_MEDIA_DIR=/home/data/media
CORS_ORIGINS=https://franprix-storeops.netlify.app
AUTH_MODE=entra
ENTRA_TENANT_ID=<config>
ENTRA_ALLOWED_TENANT_ID=<config>
ENTRA_API_CLIENT_ID=<StoreOps API client id>
ENTRA_REQUIRED_SCOPE=StoreOps.Access
STOREOPS_VF_MANAGER_EMAIL=<secure config>
STOREOPS_VF_D365_EMAIL=<secure config>
D365_MODE=live
D365_BASE_URL=<config>
D365_TENANT_ID=<config>
D365_CLIENT_ID=<config>
D365_CLIENT_SECRET=<secret>
D365_DATA_AREA_ID=5001
D365_DEFAULT_PRICE_GROUP=Franprix
D365_STORE_PRICE_GROUPS=val-fleuri=Franprix
```

Compléter les variables d’entités D365 déjà documentées dans `.env.example` avec les mappings validés.

## Variables frontend Netlify

```text
STOREOPS_API_BASE=https://<storeops-backend>.azurewebsites.net
STOREOPS_ENTRA_TENANT_ID=<tenant id>
STOREOPS_ENTRA_SPA_CLIENT_ID=<StoreOps Mobile Web client id>
STOREOPS_ENTRA_API_SCOPE=api://<StoreOps API client id>/StoreOps.Access
```

Ces quatre valeurs sont publiques par nature ; aucun secret ni mot de passe n’est injecté dans le frontend.

## Accès Azure minimum à obtenir

Il suffit qu’une personne de l’équipe infra/cloud confirme :

1. le tenant / abonnement Azure à utiliser ;
2. le Resource Group cible ou l’autorisation d’en créer un ;
3. l’autorisation de créer ou configurer un App Service Linux ;
4. l’autorisation de créer/configurer les deux App Registrations Entra ou le support d’un administrateur Entra ;
5. l’accès aux App Settings / secrets de l’application ;
6. si possible, accès aux logs applicatifs.

Pour démarrer, l’utilisateur StoreOps n’a pas besoin d’être Owner de l’abonnement. Un rôle permettant de déployer/configurer la Web App dans le Resource Group cible suffit généralement ; l’équipe infra peut conserver les droits plus élevés. La création/consentement des App Registrations peut être faite séparément par l’administrateur Entra si nécessaire.

## Validation après déploiement

- `GET /api/health` répond en HTTPS.
- Le frontend Netlify utilise l’URL publique Azure comme `STOREOPS_API_BASE`.
- Le bouton `Se connecter avec Microsoft` apparaît lorsque le backend annonce `AUTH_MODE=entra`.
- Retour Microsoft vers le domaine Netlify sans erreur de redirect URI.
- Le jeton reçu contient le scope `StoreOps.Access` et la bonne audience API.
- Authentification testée avec le Responsable Val Fleuri.
- Le Responsable ne voit que Val Fleuri.
- La session se renouvelle automatiquement pendant la journée magasin.
- Les preuves photo survivent à un redémarrage du conteneur.
- La base pilote survit à un redémarrage.
- D365 health est LIVE depuis le backend Azure.
- Aucun secret n’apparaît dans le frontend, GitHub ou les logs.

## Si l’accès Azure n’est pas disponible immédiatement

Ne pas bloquer le pilote fonctionnel : continuer le Showcase et les tests mobiles, puis faire réaliser le déploiement par l’équipe Azure/infra avec ce document. La seule information réellement nécessaire pour passer à l’hébergement est le nom de la personne ou équipe qui administre l’abonnement Azure et/ou les App Registrations Entra One Retail/H&S.
