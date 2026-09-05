# StoreOps V1.14 — Connexion Dynamics 365 Finance & Operations

## Objectif

Connecter le backend StoreOps à Dynamics 365 Finance & Operations en **service-to-service**, sans mot de passe personnel et sans secret exposé dans le frontend.

Le chemin de validation est :

`CONFIG → TOKEN MICROSOFT ENTRA → METADATA F&O → ODATA ENTITY → MAPPING STOREOPS`

Les écritures réelles restent volontairement bloquées jusqu'à validation explicite de chaque mapping métier.

## 0. Règle de sécurité

Ne jamais utiliser le mot de passe personnel d'un collaborateur dans StoreOps, GitHub, Netlify ou un fichier `.env` versionné.

Ne jamais copier `D365_CLIENT_SECRET` dans un ticket, une PR, un message ou le navigateur.

Le backend StoreOps utilise une application Microsoft Entra dédiée et un compte de service Finance & Operations à privilèges minimaux.

## 1. Créer l'application Microsoft Entra

Dans Microsoft Entra admin center :

1. `App registrations` → `New registration`.
2. Nom conseillé : `Franprix StoreOps D365`.
3. Supported account types : **Accounts in this organizational directory only (Single tenant)**.
4. Aucun Redirect URI n'est nécessaire pour le flux backend client credentials.
5. Après création, relever :
   - **Directory (tenant) ID** → `D365_TENANT_ID` ;
   - **Application (client) ID** → `D365_CLIENT_ID`.
6. Dans `Certificates & secrets`, créer un client secret pour le prototype ou, de préférence, un certificat pour la production.
7. Copier la **VALUE** du secret au moment de sa création et la stocker uniquement dans l'environnement sécurisé du backend. Ne pas la mettre dans GitHub.

## 2. Enregistrer l'application dans Finance & Operations

Dans Dynamics 365 F&O :

`System administration > Setup > Microsoft Entra applications`

Créer une ligne :

- **Client ID** = Application (client) ID de l'app Entra ;
- **Name** = `Franprix StoreOps D365` ;
- **User ID** = compte de service StoreOps dédié.

Le compte de service doit recevoir uniquement les rôles nécessaires aux lectures StoreOps. On commence en lecture avant d'autoriser des écritures.

## 3. Identifier l'URL exacte de l'environnement

Exemple :

`https://votre-environnement.operations.dynamics.com`

Utiliser l'origine de l'environnement, **sans `/data`, sans `/api`, et sans slash final**.

Cette valeur devient :

`D365_BASE_URL`.

## 4. Première connexion locale — aucun hébergement payant requis

Créer un `.env` local non versionné à partir de `.env.example` :

```env
AUTH_MODE=demo
D365_MODE=live
D365_BASE_URL=https://VOTRE-ENV.operations.dynamics.com
D365_TENANT_ID=<tenant-guid>
D365_CLIENT_ID=<client-guid>
D365_CLIENT_SECRET=<secret-local-uniquement>
D365_OAUTH_VERSION=v2
```

Lancer StoreOps localement :

```bash
./start.sh
```

Sous Windows :

```powershell
.\start-local.ps1
```

Se connecter avec le profil Directeur de démonstration et ouvrir **Système & Dynamics**.

## 5. Assistant de connexion V1.14

Endpoint sécurisé Directeur :

`GET /api/dynamics/diagnostics`

Il vérifie successivement :

1. **CONFIG** — URL, tenant, client ID et présence du secret ;
2. **TOKEN** — acquisition d'un token Microsoft Entra par client credentials ;
3. **METADATA** — appel `Metadata/DataEntities` ;
4. **ENTITY PROBE** — lecture `$top=1` d'une Data Entity choisie.

Forcer un nouveau token lors d'un test :

`GET /api/dynamics/diagnostics?force=1`

Le diagnostic ne renvoie **jamais** le client secret ni le token d'accès.

## 6. Découvrir les Data Entities réelles

Dans **Système & Dynamics**, rechercher par exemple :

- `barcode`
- `released product`
- `inventory`
- `purchase order`
- `price`
- `discount`
- `shift`
- `statement`

Ou utiliser :

`GET /api/dynamics/entities?q=barcode`

Pour une collection OData trouvée, utiliser le bouton **Tester** ou :

`GET /api/dynamics/probe?entity=<PublicCollectionName>&top=1`

Le probe est limité en lecture et à quelques lignes.

## 7. Premier mapping : Article / EAN

Le mapping code-barres Franprix a été validé sur l'environnement One Retail réel avec la Data Entity :

- collection OData : `RetailInventItemBarcode`
- société / `dataAreaId` : `5001`
- EAN : `itemBarCode`
- SKU : `itemId`
- libellé : `description`
- unité : `UnitID`

Configuration locale validée :

```env
D365_DATA_AREA_ID=5001
D365_DATA_AREA_FIELD=dataAreaId
D365_BARCODE_ENTITY=RetailInventItemBarcode
D365_BARCODE_FIELD=itemBarCode
D365_BARCODE_PRODUCT_FIELD=itemId
D365_BARCODE_DESCRIPTION_FIELD=description
D365_BARCODE_UNIT_FIELD=UnitID
```

`StoreOps` ajoute le filtre société et `cross-company=true` lors de la recherche EAN afin d'éviter de prendre une ligne d'une autre entité juridique.

L'entité article complémentaire `D365_PRODUCT_ENTITY` reste à identifier. Tant qu'elle est vide, l'entité Retail code-barres fournit déjà EAN, SKU, libellé et unité.

Redémarrer le backend après modification des variables, puis valider `getProductByEan()` avec un EAN réel connu dans Franprix.

## 8. Ordre de raccordement conseillé

1. Article / EAN — lecture ;
2. Stock disponible — lecture ;
3. Purchase Orders / lignes PO — lecture ;
4. Prix et promotions — lecture ;
5. shifts / statements / caisses — lecture ;
6. réception — écriture après validation du processus F&O ;
7. ajustements inventaire / démarque — écriture après validation du journal et des dimensions stock.

## 9. Écritures Dynamics

StoreOps bloque actuellement les écritures live non mappées avec des erreurs explicites, par exemple :

- `D365_RECEIPT_WRITE_NOT_MAPPED`
- `D365_INVENTORY_WRITE_NOT_MAPPED`
- `D365_LOSS_WRITE_NOT_MAPPED`

C'est intentionnel. Une réception ou un ajustement comptable ne doit jamais être inventé à partir d'une hypothèse technique.

## 10. Hébergement après le test local

Le Showcase Netlify peut continuer à fonctionner sans backend.

Pour la vraie connexion Dynamics, le secret doit rester côté serveur. La cible recommandée reste un backend Azure (App Service / Container Apps) avec secrets sécurisés, puis une base managée à la place du SQLite de démonstration.

On peut donc valider **toute l'authentification Dynamics en local d'abord**, puis choisir l'hébergement une fois le flux article/EAN confirmé.

## 11. Authentification des utilisateurs StoreOps

La connexion StoreOps → Dynamics et la connexion utilisateur → StoreOps sont deux sujets différents.

`AUTH_MODE=entra` activera ensuite l'authentification utilisateur Entra côté StoreOps. Le service Dynamics continuera d'utiliser sa propre App Registration backend.
