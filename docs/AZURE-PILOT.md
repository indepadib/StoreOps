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

## App Settings à prévoir

```text
NODE_ENV=production
PORT=8787
STOREOPS_DB=/home/data/storeops.db
STOREOPS_MEDIA_DIR=/home/data/media
CORS_ORIGINS=https://franprix-storeops.netlify.app
AUTH_MODE=entra
ENTRA_TENANT_ID=<secret/config>
ENTRA_ALLOWED_TENANT_ID=<secret/config>
ENTRA_API_CLIENT_ID=<config>
STOREOPS_VF_MANAGER_EMAIL=<secret/config>
STOREOPS_VF_D365_EMAIL=<secret/config>
D365_MODE=live
D365_BASE_URL=<config>
D365_TENANT_ID=<secret/config>
D365_CLIENT_ID=<secret/config>
D365_CLIENT_SECRET=<secret>
D365_DATA_AREA_ID=5001
D365_DEFAULT_PRICE_GROUP=Franprix
D365_STORE_PRICE_GROUPS=val-fleuri=Franprix
```

Compléter les variables d’entités D365 déjà documentées dans `.env.example` avec les mappings validés.

## Accès Azure minimum à obtenir

Il suffit qu’une personne de l’équipe infra/cloud confirme :

1. le tenant / abonnement Azure à utiliser ;
2. le Resource Group cible ou l’autorisation d’en créer un ;
3. l’autorisation de créer ou configurer un App Service Linux ;
4. l’accès aux App Settings / secrets de l’application ;
5. si possible, accès aux logs applicatifs.

Pour démarrer, l’utilisateur StoreOps n’a pas besoin d’être Owner de l’abonnement. Un rôle permettant de déployer/configurer la Web App dans le Resource Group cible suffit généralement ; l’équipe infra peut conserver les droits plus élevés.

## Validation après déploiement

- `GET /api/health` répond en HTTPS.
- Le frontend Netlify utilise l’URL publique Azure comme `STOREOPS_API_BASE`.
- Authentification Entra testée avec le Responsable Val Fleuri.
- Le Responsable ne voit que Val Fleuri.
- Les preuves photo survivent à un redémarrage du conteneur.
- La base pilote survit à un redémarrage.
- D365 health est LIVE depuis le backend Azure.
- Aucun secret n’apparaît dans le frontend, GitHub ou les logs.

## Si l’accès Azure n’est pas disponible immédiatement

Ne pas bloquer le pilote fonctionnel : continuer le Showcase et les tests mobiles, puis faire réaliser le déploiement par l’équipe Azure/infra avec ce document. La seule information réellement nécessaire pour passer à l’hébergement est le nom de la personne ou équipe qui administre l’abonnement Azure One Retail/H&S.
