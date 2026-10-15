# StoreOps — Handoff chaîne de connexion

Ce document est destiné à l'équipe / au prestataire qui doit raccorder StoreOps à l'environnement Microsoft One Retail.

## 1. Deux chaînes distinctes

### A. Connexion utilisateur StoreOps

```
Navigateur utilisateur
  -> Microsoft Entra ID (Authorization Code + PKCE)
  -> jeton avec scope StoreOps.Access
  -> StoreOps API /api/*
  -> validation tenant + audience + scope
  -> résolution de l'utilisateur StoreOps
  -> rôle + périmètre magasin imposés côté serveur
```

Le navigateur ne reçoit jamais de client secret.

### B. Connexion StoreOps vers Dynamics 365 F&O

```
StoreOps backend
  -> Microsoft Entra ID (client credentials)
  -> token service-to-service
  -> Dynamics 365 Finance & Operations OData
  -> Data Entities
  -> mapping StoreOps
```

Le frontend ne contacte jamais Dynamics directement.

---

## 2. Ce qui doit être ajouté dans Microsoft Entra pour le login StoreOps

Dans **App registrations > application StoreOps > Authentication** :

1. Ajouter la plateforme **Single-page application**.
2. Ajouter le Redirect URI de production :
   - `https://storeops.ma/`
3. Conserver les autres Redirect URI déjà utilisés si nécessaires pour les environnements de test.

Dans **Expose an API** :

1. Application ID URI : `api://<CLIENT_ID>`
2. Ajouter le delegated scope :
   - nom : `StoreOps.Access`
   - état : Enabled

Le frontend utilise Authorization Code + PKCE.

**À ne jamais ajouter dans le frontend :**
- client secret ;
- mot de passe utilisateur ;
- secret Dynamics ;
- token de service.

---

## 3. Variables publiques à configurer côté site / Netlify

Ces valeurs peuvent être exposées au navigateur :

```text
STOREOPS_API_BASE=https://storeops.ma/api
STOREOPS_ENTRA_TENANT_ID=<Directory tenant ID GUID>
STOREOPS_ENTRA_CLIENT_ID=<Application client ID>
STOREOPS_ENTRA_API_SCOPE=api://<CLIENT_ID>/StoreOps.Access
```

Si l'API est servie en same-origin via `/api/*`, `STOREOPS_API_BASE` peut être configuré conformément au runtime de production existant.

---

## 4. Variables privées à configurer uniquement côté backend

```text
AUTH_MODE=entra
ENTRA_TENANT_ID=<Directory tenant ID ou domaine tenant>
ENTRA_ALLOWED_TENANT_ID=<Directory tenant ID GUID>
ENTRA_CLIENT_ID=<Application client ID>
ENTRA_REQUIRED_SCOPE=StoreOps.Access
```

Les rôles StoreOps restent provisionnés côté backend. Un utilisateur ne choisit jamais son propre rôle.

Exemples de périmètre :
- `store_manager` : magasin attribué uniquement ;
- `ops_director` : réseau ;
- `supply_chain` : cockpit approvisionnement / entrepôt ;
- autres rôles selon provisioning StoreOps.

---

## 5. Ce qui doit être créé pour Dynamics 365 Finance & Operations

Dans Microsoft Entra :

1. Créer ou utiliser l'App Registration backend prévue pour StoreOps.
2. Relever :
   - Directory (tenant) ID ;
   - Application (client) ID.
3. Créer le secret / certificat côté serveur uniquement.

Dans Dynamics 365 F&O :

`System administration > Setup > Microsoft Entra applications`

Ajouter :
- **Client ID** = Application client ID ;
- **Name** = `Franprix StoreOps D365` ;
- **User ID** = compte de service StoreOps dédié.

Le compte de service doit avoir uniquement les droits nécessaires.

---

## 6. Variables Dynamics privées côté backend

```text
D365_MODE=live
D365_BASE_URL=https://<ENV>.operations.dynamics.com
D365_TENANT_ID=<tenant-guid>
D365_CLIENT_ID=<client-guid>
D365_CLIENT_SECRET=<secret>
D365_OAUTH_VERSION=v2

D365_DATA_AREA_ID=5001
D365_DATA_AREA_FIELD=dataAreaId

D365_BARCODE_ENTITY=RetailInventItemBarcode
D365_BARCODE_FIELD=itemBarCode
D365_BARCODE_PRODUCT_FIELD=itemId
D365_BARCODE_DESCRIPTION_FIELD=description
D365_BARCODE_UNIT_FIELD=UnitID
```

`D365_BASE_URL` doit être l'origine de l'environnement, sans `/data`, sans `/api` et sans slash final.

Le secret ne doit jamais être envoyé par e-mail, mis dans GitHub ou copié dans le frontend.

---

## 7. Tests à exécuter après configuration

### Login utilisateur
- ouvrir `https://storeops.ma` ;
- cliquer **Continuer avec Microsoft** ;
- valider qu'un utilisateur provisionné arrive sur son bon périmètre ;
- valider qu'un compte Microsoft valide mais non provisionné est refusé ;
- valider qu'un responsable magasin ne peut pas accéder à un autre magasin ;
- valider qu'un directeur réseau voit la vue Réseau.

### Dynamics
Depuis StoreOps, lancer le diagnostic sécurisé :

`GET /api/dynamics/diagnostics?force=1`

Le test doit passer successivement :
1. CONFIG ;
2. TOKEN ;
3. METADATA ;
4. ENTITY PROBE.

Puis tester la recherche EAN sur `RetailInventItemBarcode`.

---

## 8. Informations attendues en retour de l'équipe Microsoft / prestataire

Merci de confirmer :

- [ ] Tenant ID
- [ ] Client ID StoreOps
- [ ] Redirect URI `https://storeops.ma/` ajouté
- [ ] Scope `StoreOps.Access` créé et activé
- [ ] App backend enregistrée dans Dynamics F&O
- [ ] Compte de service F&O affecté
- [ ] URL exacte de l'environnement F&O
- [ ] Variables serveur configurées
- [ ] Test login réussi
- [ ] Test Dynamics CONFIG / TOKEN / METADATA / ENTITY réussi

**Ne pas envoyer le client secret par e-mail.** Le secret doit être saisi directement dans le gestionnaire de secrets de l'hébergement backend.
