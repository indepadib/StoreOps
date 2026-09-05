# Pilote Val Fleuri — connexion Microsoft minimale

Objectif : permettre à Ayoub et Mourad d'utiliser leur compte Microsoft professionnel dans StoreOps avant le durcissement final de l'hébergement Azure.

## Une seule App Registration

Pour le pilote, une seule App Registration Microsoft Entra suffit pour le frontend StoreOps et l'API.

À récupérer :

1. `Directory (tenant) ID`
2. `Application (client) ID`

Le scope StoreOps est fixe : `StoreOps.Access`.

## Création dans Microsoft Entra

1. Microsoft Entra admin center → **App registrations** → **New registration**.
2. Nom : `Franprix StoreOps`.
3. Type de compte : **Accounts in this organizational directory only**.
4. Après création, copier le **Tenant ID** et le **Application (client) ID**.
5. Dans **Authentication** → **Add a platform** → **Single-page application**.
6. Ajouter comme Redirect URI : `https://franprix-storeops.netlify.app/`.
7. Dans **Expose an API**, conserver/créer l'Application ID URI `api://<CLIENT_ID>`.
8. Ajouter un delegated scope nommé `StoreOps.Access` et l'activer.

Aucun client secret n'est nécessaire dans le navigateur. Le frontend utilise Authorization Code + PKCE.

## Variables backend

```text
AUTH_MODE=entra
ENTRA_TENANT_ID=<TENANT_ID>
ENTRA_CLIENT_ID=<CLIENT_ID>
STOREOPS_VF_MANAGER_EMAIL=<email One Retail Ayoub>
STOREOPS_OPS_DIRECTOR_NAME=Mourad
STOREOPS_OPS_DIRECTOR_EMAIL=<email One Retail Mourad>
```

`ENTRA_REQUIRED_SCOPE` peut être omis : StoreOps utilise `StoreOps.Access` par défaut.

## Variables Netlify

```text
STOREOPS_API_BASE=<URL publique du backend StoreOps>
STOREOPS_ENTRA_TENANT_ID=<TENANT_ID>
STOREOPS_ENTRA_CLIENT_ID=<CLIENT_ID>
```

Le frontend construit automatiquement le scope `api://<CLIENT_ID>/StoreOps.Access`.

## Résultat attendu

- Ayoub clique **Continuer avec Microsoft** → Microsoft → StoreOps → Val Fleuri → parcours Responsable magasin.
- Mourad clique **Continuer avec Microsoft** → Microsoft → StoreOps → vue Directeur Exploitation.
- Un compte Microsoft valide mais non provisionné dans StoreOps reçoit un refus d'accès.
- Les rôles ne sont jamais choisis par l'utilisateur : ils sont imposés côté backend.

## Ce qui peut venir ensuite

L'hébergement Azure du backend, les secrets Dynamics, la supervision et le durcissement réseau peuvent être finalisés ensuite sans changer le parcours de connexion de l'utilisateur.
