# StoreOps — Déploiement frontend + backend

## Architecture de déploiement

- Frontend statique : Netlify (`frontend/`).
- API : conteneur Node.js (`backend/Dockerfile`).
- Base prototype : SQLite sur volume persistant (`STOREOPS_DB=/data/storeops.db`).
- Cible production : base managée (Azure SQL/PostgreSQL) + Blob Storage pour les preuves.

## 1. Déployer l'API

Le conteneur expose le port défini par `PORT` (8787 par défaut).

Variables minimales prototype :

```env
NODE_ENV=production
PORT=8787
STOREOPS_DB=/data/storeops.db
AUTH_MODE=demo
D365_MODE=simulated
CORS_ORIGINS=https://franprix-storeops.netlify.app
```

Monter `/data` sur un volume persistant. Sans volume, les données SQLite seront perdues à chaque redéploiement.

### Dynamics réel

Ne passer à `D365_MODE=live` qu'après configuration Entra et mapping des Data Entities. Les secrets doivent rester dans le gestionnaire de secrets du fournisseur, jamais dans GitHub.

### Auth utilisateurs réelle

Passer à `AUTH_MODE=entra` après création de l'App Registration API StoreOps et mapping des utilisateurs.

## 2. Vérifier l'API

```bash
curl https://VOTRE-API/api/health
```

La réponse doit avoir `ok: true`.

## 3. Raccorder Netlify

Dans Netlify > Site configuration > Environment variables :

```env
STOREOPS_API_BASE=https://VOTRE-API
```

Le build `frontend/netlify-build.sh` génère ensuite `runtime-config.js` sans inscrire l'URL en dur dans le code.

## 4. Ne pas fusionner la V1.4.1 avant disponibilité de l'API

Le frontend V1.4.1 n'utilise plus `localStorage` comme base métier et attend l'API StoreOps. Déployer/tester l'API avant de basculer la production Netlify.

## 5. Cible production

Pour plusieurs magasins et utilisateurs simultanés, migrer SQLite vers une base managée avant généralisation réseau. Le modèle actuel sert de prototype full-stack et de contrat API.
