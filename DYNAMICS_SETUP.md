# StoreOps V1.4 — Raccordement Dynamics 365 Finance & Operations

## Règle de sécurité

Ne jamais utiliser le mot de passe personnel d'un collaborateur dans StoreOps, GitHub, Netlify ou un fichier `.env` versionné.

Le backend StoreOps doit utiliser une application Microsoft Entra dédiée et un compte de service Finance & Operations à privilèges minimaux.

## 1. Créer l'application Entra pour StoreOps → Dynamics

Dans Microsoft Entra admin center :

1. App registrations → New registration.
2. Nom conseillé : `Franprix StoreOps D365`.
3. Single tenant.
4. Relever :
   - Directory (tenant) ID ;
   - Application (client) ID.
5. Créer un secret pour le prototype, ou de préférence un certificat pour la production.
6. Ne jamais committer ce secret dans GitHub.

## 2. Enregistrer l'application dans Finance & Operations

Dans Dynamics 365 F&O :

`System administration > Setup > Microsoft Entra applications`

Créer une ligne avec :

- Client ID = Application ID de l'app Entra ;
- Name = Franprix StoreOps D365 ;
- User ID = compte de service StoreOps dédié.

Le compte de service doit recevoir uniquement les rôles nécessaires aux données utilisées par StoreOps.

## 3. Variables backend

Copier `.env.example` vers `.env` en local et renseigner :

```env
D365_MODE=live
D365_BASE_URL=https://VOTRE-ENV.operations.dynamics.com
D365_TENANT_ID=<tenant-guid>
D365_CLIENT_ID=<client-id>
D365_CLIENT_SECRET=<secret>
```

En production, stocker ces valeurs dans les secrets Azure / Key Vault, pas dans le repository.

## 4. Vérifier la connexion

Connecté en Directeur d'Exploitation :

- ouvrir `Système & Dynamics` ;
- contrôler le statut d'authentification ;
- utiliser la recherche Data Entities.

Le backend interroge le service Metadata de F&O pour découvrir les entités disponibles dans l'environnement.

## 5. Mapper les entités

Une fois les entités exactes identifiées :

```env
D365_BARCODE_ENTITY=<entité codes-barres>
D365_PRODUCT_ENTITY=<entité articles>
D365_BARCODE_FIELD=Barcode
D365_BARCODE_PRODUCT_FIELD=ItemNumber
D365_PRODUCT_NUMBER_FIELD=ProductNumber
D365_PRODUCT_NAME_FIELD=ProductName
```

Les noms sont configurables car ils peuvent dépendre de votre environnement et de vos personnalisations.

## 6. Écritures Dynamics

La V1.4 autorise les lectures configurées mais bloque volontairement le posting réel d'une réception tant que le mécanisme F&O n'a pas été explicitement mappé.

C'est intentionnel : StoreOps ne doit jamais "inventer" une réception comptable ou logistique.

Une fois le processus validé avec votre intégrateur Dynamics, implémenter le mapping dans :

`backend/services/dynamics.mjs -> postReceiptToDynamics()`

## 7. Authentification utilisateurs StoreOps

`AUTH_MODE=entra` active la validation JWT Entra côté API.

Il faut alors :

- une App Registration dédiée à l'API StoreOps ;
- `ENTRA_TENANT_ID` ;
- `ENTRA_API_CLIENT_ID` ;
- mapper chaque utilisateur Entra à un utilisateur StoreOps (`email` / `entra_oid`).

Les rôles StoreOps restent en base serveur :

- `store_manager` : son magasin uniquement ;
- `ops_director` : tous les magasins ;
- les autres profils : pas de droits de gestion qualité/réception.
