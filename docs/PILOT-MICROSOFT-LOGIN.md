# Pilote Val Fleuri — connexion Microsoft minimale

Objectif : permettre à Ayoub et Mourad d'utiliser leur compte Microsoft professionnel dans StoreOps avant le durcissement final de l'hébergement Azure.

## Une seule App Registration

Pour le pilote, une seule App Registration Microsoft Entra suffit pour le frontend StoreOps et l'API.

Nous connaissons déjà l'autorité du tenant : `dislogroup.onmicrosoft.com`. StoreOps peut utiliser ce domaine vérifié pour l'autorisation et la découverte OIDC.

Il reste à récupérer :

1. `Application (client) ID`
2. idéalement ensuite le `Directory (tenant) ID` GUID pour activer le contrôle strict du claim `tid` côté backend.

Le scope StoreOps est fixe : `StoreOps.Access`.

## Création dans Microsoft Entra

1. Microsoft Entra admin center → **App registrations** → **New registration**.
2. Nom : `Franprix StoreOps`.
3. Type de compte : **Accounts in this organizational directory only**.
4. Après création, copier le **Application (client) ID** et, si disponible, le **Directory (tenant) ID**.
5. Dans **Authentication** → **Add a platform** → **Single-page application**.
6. Ajouter comme Redirect URI : `https://franprix-storeops.netlify.app/`.
7. Dans **Expose an API**, conserver/créer l'Application ID URI `api://<CLIENT_ID>`.
8. Ajouter un delegated scope nommé `StoreOps.Access` et l'activer.

Aucun client secret n'est nécessaire dans le navigateur. Le frontend utilise Authorization Code + PKCE.

## Mapping des utilisateurs

Le compte Microsoft ne choisit jamais son rôle. StoreOps provisionne les utilisateurs côté backend et associe ensuite automatiquement l'`oid` Entra au premier login réussi.

- Responsable Val Fleuri : rôle `store_manager`, périmètre fixe `val-fleuri`.
- Directeur Exploitation : rôle `ops_director`, périmètre réseau.
- `email` StoreOps peut rester l'adresse de contact One Retail.
- `dynamics_email` est l'adresse Microsoft professionnelle utilisée pour retrouver l'utilisateur au premier login.

Les vraies adresses ne sont jamais versionnées dans GitHub.

## Variables backend

```text
AUTH_MODE=entra
ENTRA_TENANT_ID=dislogroup.onmicrosoft.com
ENTRA_ALLOWED_TENANT_ID=<GUID tenant quand disponible>
ENTRA_CLIENT_ID=<CLIENT_ID>
STOREOPS_VF_MANAGER_EMAIL=<email One Retail Responsable>
STOREOPS_VF_D365_EMAIL=<email Microsoft Responsable>
STOREOPS_OPS_DIRECTOR_NAME=Mourad
STOREOPS_OPS_DIRECTOR_EMAIL=<email One Retail Directeur>
STOREOPS_OPS_DIRECTOR_D365_EMAIL=<email Microsoft Directeur>
```

`ENTRA_ALLOWED_TENANT_ID` peut rester vide au tout début du pilote. Dès que le GUID du tenant est connu, il doit être renseigné pour verrouiller explicitement le claim `tid`.

`ENTRA_REQUIRED_SCOPE` peut être omis : StoreOps utilise `StoreOps.Access` par défaut.

## Variables Netlify

```text
STOREOPS_API_BASE=<URL publique du backend StoreOps>
STOREOPS_ENTRA_TENANT_ID=dislogroup.onmicrosoft.com
STOREOPS_ENTRA_CLIENT_ID=<CLIENT_ID>
```

Le frontend construit automatiquement le scope `api://<CLIENT_ID>/StoreOps.Access`.

## Résultat attendu

- Responsable Val Fleuri clique **Continuer avec Microsoft** → Microsoft → StoreOps → Val Fleuri → parcours Responsable magasin.
- Directeur Exploitation clique **Continuer avec Microsoft** → Microsoft → StoreOps → vue réseau Direction.
- Un compte Microsoft valide mais non provisionné dans StoreOps reçoit un refus d'accès.
- Les rôles ne sont jamais choisis par l'utilisateur : ils sont imposés côté backend.
- Au premier login réussi, StoreOps mémorise l'`oid` Entra afin que les connexions suivantes ne dépendent plus d'une comparaison d'email.

## Ce qui reste pour le vrai login en production

Le frontend Netlify peut être préparé dès maintenant. En revanche, le login réel StoreOps nécessite aussi une URL publique du backend (`STOREOPS_API_BASE`) afin que le jeton Microsoft soit validé côté serveur et que les rôles soient imposés de manière sécurisée.

L'hébergement Azure du backend, les secrets Dynamics, la supervision et le durcissement réseau peuvent être finalisés ensuite sans changer le parcours de connexion de l'utilisateur.
