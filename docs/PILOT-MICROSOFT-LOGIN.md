# Pilote Val Fleuri — connexion Microsoft minimale

Objectif : permettre à Ayoub et Mourad d'utiliser leur compte Microsoft professionnel dans StoreOps avant le durcissement final de l'hébergement Azure.

## App Registration pilote

StoreOps peut fonctionner avec une seule App Registration Microsoft Entra pour le pilote, à condition que le secret existant reste strictement côté backend et ne soit jamais utilisé par le navigateur.

Le Tenant ID et le Client ID sont fournis au runtime via variables d'environnement ; ils ne sont pas versionnés dans GitHub. Le scope StoreOps est fixe : `StoreOps.Access`.

Si l'App Registration existe déjà avec un redirect **Web** et un client secret, ne supprimez rien. Ajoutez simplement la plateforme **Single-page application** pour StoreOps. Le secret existant peut rester utilisé côté backend/D365 si nécessaire.

## Réglages Microsoft Entra requis

1. Microsoft Entra admin center → **App registrations** → ouvrir l'application StoreOps.
2. Dans **Authentication** → **Add a platform** → **Single-page application**.
3. Ajouter comme Redirect URI : `https://franprix-storeops.netlify.app/`.
4. Conserver les éventuels redirects Web existants ; ils ne gênent pas le flux SPA.
5. Dans **Expose an API**, définir l'Application ID URI sous la forme `api://<CLIENT_ID>`.
6. Ajouter un delegated scope nommé `StoreOps.Access` et l'activer.

Aucun client secret n'est nécessaire dans le navigateur. Le frontend utilise Authorization Code + PKCE. Ne jamais copier le secret client dans Netlify ni dans le code frontend.

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
ENTRA_TENANT_ID=<Directory tenant ID ou domaine tenant>
ENTRA_ALLOWED_TENANT_ID=<Directory tenant ID GUID>
ENTRA_CLIENT_ID=<Application client ID>
STOREOPS_VF_MANAGER_EMAIL=<email One Retail Responsable>
STOREOPS_VF_D365_EMAIL=<email Microsoft Responsable>
STOREOPS_OPS_DIRECTOR_NAME=Mourad
STOREOPS_OPS_DIRECTOR_EMAIL=<email One Retail Directeur>
STOREOPS_OPS_DIRECTOR_D365_EMAIL=<email Microsoft Directeur>
```

`ENTRA_REQUIRED_SCOPE` peut être omis : StoreOps utilise `StoreOps.Access` par défaut.

## Variables Netlify

```text
STOREOPS_API_BASE=<URL publique du backend StoreOps>
STOREOPS_ENTRA_TENANT_ID=<Directory tenant ID GUID>
STOREOPS_ENTRA_CLIENT_ID=<Application client ID>
STOREOPS_ENTRA_API_SCOPE=api://<CLIENT_ID>/StoreOps.Access
```

## Résultat attendu

- Responsable Val Fleuri clique **Continuer avec Microsoft** → Microsoft → StoreOps → Val Fleuri → parcours Responsable magasin.
- Directeur Exploitation clique **Continuer avec Microsoft** → Microsoft → StoreOps → vue réseau Direction.
- Un compte Microsoft valide mais non provisionné dans StoreOps reçoit un refus d'accès.
- Les rôles ne sont jamais choisis par l'utilisateur : ils sont imposés côté backend.
- Au premier login réussi, StoreOps mémorise l'`oid` Entra afin que les connexions suivantes ne dépendent plus d'une comparaison d'email.

## Ce qui reste pour le vrai login en production

Le frontend Netlify peut être préparé dès maintenant. Le login réel StoreOps nécessite aussi une URL publique du backend (`STOREOPS_API_BASE`) afin que le jeton Microsoft soit validé côté serveur et que les rôles soient imposés de manière sécurisée.

L'hébergement Azure du backend, les secrets Dynamics, la supervision et le durcissement réseau peuvent être finalisés ensuite sans changer le parcours de connexion de l'utilisateur.
