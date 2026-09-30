# StoreOps × Glovo — Guide de branchement

> Version d'intégration : 30/09/2026  
> Périmètre : disponibilité catalogue Glovo uniquement.  
> Principe : Dynamics reste la source stock ; StoreOps transforme le stock en un statut Disponible / Indisponible et n'envoie jamais la quantité réelle.

## 1. Architecture cible

Flux principal recommandé :

Dynamics 365 F&O (stock magasin)
→ StoreOps (catalogue Glovo autorisé + buffer + règles d'assortiment)
→ Glovo Partner API / Catalog
→ application Glovo

Le payload envoyé par StoreOps est volontairement minimal :

    {
      "products": [
        { "sku": "HS-001191", "active": true },
        { "sku": "HS-001192", "active": false }
      ]
    }

StoreOps n'envoie ni AvailableOnHandQuantity, ni stock physique, ni coût, ni marge.

Le catalogue actuellement chargé dans StoreOps provient de « Assortiment glovo (1).xlsx », Jets 1 à 4, soit 1 035 SKU uniques. La version du seed est 2026-09-30.

## 2. Ce que Glovo doit fournir

Demander à l'Account Manager / équipe intégration Glovo :

1. Accès Partner Portal avec le plugin Shops Integrations.
2. Chain ID production.
3. Vendor Identifier de chaque magasin à connecter.
4. Client ID et Client Secret pour l'API Catalog.
5. Le cURL de génération de token fourni par Partner Portal, afin de récupérer l'URL exacte du token et le mode d'authentification.
6. Un environnement Sandbox, avec ses propres Client ID / Secret.
7. Les Vendor Identifiers Sandbox : ils peuvent être différents des identifiants production.
8. Confirmation que l'intégration Catalog / POS est activée pour la chaîne.
9. Optionnel : configuration d'un webhook Catalog pour recevoir le statut détaillé des jobs asynchrones.

Documentation Glovo vérifiée le 30/09/2026 :
- Partner API overview : https://qcommerce.developer.glovoapp.com/en/documentation/api-partner-api-overview
- Catalog API : https://qcommerce.developer.glovoapp.com/en/documentation/catalog-api-use-cases
- Sandbox : https://qcommerce.developer.glovoapp.com/en/documentation/sandbox-sandbox-testing

Points Glovo à retenir :
- PUT /catalog accepte notamment sku et active.
- La mise à jour est asynchrone et retourne un job_id / job_status.
- Les access tokens Partner API ont une durée de vie limitée ; Glovo indique actuellement 2 heures.
- Glovo recommande le bulk pour les mises à jour multiples.
- Glovo indique de ne pas dépasser 60 requêtes par minute.
- Une mise à jour de catalogue peut prendre jusqu'à 15 minutes avant d'être visible côté application.
- Les credentials Sandbox sont distincts de la production.

## 3. Variables Netlify / serveur

Toutes ces valeurs doivent être stockées comme variables d'environnement ou secrets Netlify. Ne jamais les committer.

### Configuration fonctionnelle

    GLOVO_PUSH_ENABLED=0
    GLOVO_API_BASE_URL=https://glovo.partner.deliveryhero.io
    GLOVO_CHAIN_ID=<chain-id>
    GLOVO_VENDOR_IDS_JSON={"val-fleuri":"<vendor-vf>","trefle":"<vendor-tr>"}
    GLOVO_AVAILABILITY_BUFFER=0
    GLOVO_REQUEST_TIMEOUT_MS=15000
    STOREOPS_GLOVO_AVAILABILITY_CACHE_MS=60000

Le mapping GLOVO_VENDOR_IDS_JSON utilise les store_id StoreOps, pas le nom affiché du magasin.

Exemples StoreOps actuels :
- val-fleuri
- trefle
- zeraoui
- sindibad
- carita

N'ajouter un magasin au JSON que lorsque son Vendor Identifier Glovo est confirmé.

### Authentification recommandée : Client Credentials

    GLOVO_CLIENT_ID=<secret>
    GLOVO_CLIENT_SECRET=<secret>
    GLOVO_TOKEN_URL=<url exacte fournie dans le cURL Partner Portal>
    GLOVO_TOKEN_AUTH_STYLE=basic
    GLOVO_TOKEN_SCOPE=

GLOVO_TOKEN_AUTH_STYLE accepte :
- basic : client_id/client_secret dans Authorization Basic ;
- body : client_id/client_secret dans le formulaire.

Utiliser le mode correspondant au cURL fourni par Glovo.

StoreOps met en cache l'access token et anticipe son expiration. Aucun token n'est exposé au frontend.

### Fallback manuel / test

    GLOVO_CATALOG_BEARER_TOKEN=<token>

Ce mode fonctionne pour un test rapide, mais n'est pas recommandé comme mode production car le token expire.

### Endpoint StoreOps optionnel en lecture seule

    GLOVO_READ_API_KEY=<secret indépendant>
    GLOVO_PARTNER_STORE_IDS=val-fleuri,trefle

Endpoint :

    GET /api/partners/glovo/stores/{storeId}/availability
    Authorization: Bearer <GLOVO_READ_API_KEY>

Réponse :

    {
      "apiVersion": "1",
      "storeId": "val-fleuri",
      "privacyMode": "AVAILABILITY_ONLY",
      "items": [
        { "sku": "HS-001191", "active": true }
      ]
    }

Ce endpoint n'est pas nécessaire au flux Partner API/Catalog officiel. Il existe uniquement si Glovo ou un middleware externe préfère venir lire StoreOps.

## 4. Pré-requis Dynamics

Avant tout push Glovo :

1. D365_STOCK_READ_MODE doit être validé en LIVE.
2. Le warehouse du magasin doit être mappé correctement.
3. Le snapshot ne doit pas être tronqué.
4. Les ProductNumber Dynamics doivent correspondre aux SKU du catalogue Glovo.
5. La page StoreOps Glovo doit afficher un nombre de SKU correspondants cohérent.

StoreOps bloque automatiquement le push si aucun des 1 035 SKU Glovo ne correspond au snapshot stock. Cette protection évite une désactivation massive causée par un mauvais mapping.

Règle actuelle :

    active = article présent dans le stock magasin
             ET article autorisé
             ET AvailableOnHandQuantity > GLOVO_AVAILABILITY_BUFFER

Si l'assortiment magasin StoreOps est READY, il est également appliqué comme filtre.

## 5. Endpoints StoreOps internes

Ces endpoints exigent une session StoreOps autorisée.

### Voir le snapshot calculé

    GET /api/stores/{storeId}/channels/glovo

Retourne :
- résumé disponible / indisponible ;
- version catalogue ;
- couverture de matching ;
- statut stock ;
- configuration d'intégration sans secret ;
- liste article avec statut active.

### Tester Glovo sans écriture

    POST /api/stores/{storeId}/channels/glovo/verify

Ce test effectue un GET Catalog Glovo avec Chain ID + Vendor ID + authentification.

Il ne modifie aucun article.

Résultat attendu :

    {
      "status": "READY",
      "httpStatus": 200,
      "catalogReachable": true,
      "vendorId": "...",
      "authMode": "CLIENT_CREDENTIALS"
    }

### Envoyer les disponibilités

    POST /api/stores/{storeId}/channels/glovo/sync

Conditions obligatoires :
- snapshot stock READY ;
- Chain ID présent ;
- Vendor ID présent ;
- authentification valide ;
- GLOVO_PUSH_ENABLED=1 ;
- au moins un SKU catalogue mappé au stock.

Le serveur envoie un PUT vers :

    /v2/chains/{chain_id}/vendors/{vendor_id}/catalog

Réponse StoreOps :

    {
      "status": "QUEUED",
      "sentProducts": 1035,
      "jobId": "...",
      "jobStatus": "QUEUED",
      "privacyMode": "AVAILABILITY_ONLY"
    }

Un statut QUEUED signifie que Glovo a accepté le job ; il ne signifie pas encore que les 1 035 lignes ont toutes été appliquées.

## 6. Procédure de branchement Sandbox

### Étape A — préparer le stock

- ouvrir StoreOps > Glovo ;
- vérifier Stock Dynamics = READY ;
- vérifier la couverture « Correspondance catalogue » ;
- contrôler manuellement quelques SKU connus ;
- vérifier qu'un article stock > buffer apparaît Disponible ;
- vérifier qu'un article stock <= buffer apparaît Indisponible.

### Étape B — configurer Sandbox

Renseigner les Chain/Vendor/Credentials Sandbox fournis par Glovo.

Conserver :

    GLOVO_PUSH_ENABLED=0

Cliquer « Tester la connexion ».

Attendu :
- HTTP 200 ;
- Catalog reachable ;
- Vendor correct ;
- aucune modification Glovo.

### Étape C — autoriser le premier push Sandbox

Passer :

    GLOVO_PUSH_ENABLED=1

Puis cliquer « Synchroniser la disponibilité ».

Conserver :
- job_id ;
- job_status ;
- heure ;
- magasin ;
- nombre de SKU envoyés.

Contrôler le job dans Partner Portal et vérifier plusieurs articles côté Sandbox.

### Étape D — cas de test minimum

Tester au minimum :
1. article disponible ;
2. article à stock zéro ;
3. article exactement égal au buffer ;
4. SKU absent du stock ;
5. SKU non autorisé par assortiment si l'assortiment est READY ;
6. mauvais Vendor ID → le verify doit échouer ;
7. token invalide → le verify doit échouer ;
8. GLOVO_PUSH_ENABLED=0 → le sync doit être refusé ;
9. snapshot D365 partiel → aucun push ;
10. mapping catalogue vide → aucun push.

## 7. Passage production

Ne pas réutiliser les credentials Sandbox.

Ordre conseillé :

1. GLOVO_PUSH_ENABLED=0.
2. Charger Chain ID production.
3. Charger Vendor IDs production.
4. Charger Client ID / Secret production.
5. Charger l'URL token production.
6. Tester Val Fleuri avec /verify.
7. Tester chaque magasin séparément.
8. Comparer 10 à 20 SKU entre Dynamics, StoreOps et Glovo.
9. Activer GLOVO_PUSH_ENABLED=1.
10. Faire un premier bulk.
11. Contrôler le job dans Partner Portal.
12. Contrôler l'application Glovo après propagation.
13. Répéter magasin par magasin.

## 8. Rollback immédiat

Pour arrêter tout envoi StoreOps vers Glovo :

    GLOVO_PUSH_ENABLED=0

Le endpoint /verify reste utilisable, mais /sync refusera tout envoi.

Ne pas supprimer les Vendor IDs ni les credentials pour un simple rollback ; garder la capacité de diagnostic.

Si une mauvaise disponibilité a déjà été envoyée :
- corriger la source stock/mapping ;
- vérifier le snapshot StoreOps ;
- réactiver temporairement le push ;
- renvoyer le catalogue corrigé ;
- contrôler le job Glovo.

## 9. Exploitation quotidienne

La page Glovo StoreOps expose :
- disponibles ;
- indisponibles ;
- taille du catalogue ;
- matching catalogue ↔ stock ;
- Vendor ID ;
- mode d'authentification ;
- test de connexion ;
- push verrouillable ;
- recherche SKU / EAN / nom ;
- filtres Disponible / Indisponible.

Le push actuel est un bulk complet et volontairement explicite. Pour une automatisation haute fréquence, la phase suivante devra mettre en place un scheduler et, idéalement, des deltas de disponibilité avec suivi du statut de job/webhook.

## 10. Responsabilités

One Retail / StoreOps :
- mapping magasin ↔ Vendor ID ;
- stock Dynamics fiable ;
- catalogue autorisé ;
- buffer ;
- sécurité des secrets ;
- validation avant activation du push.

Glovo :
- activation Partner API/Catalog ;
- Chain ID / Vendor IDs ;
- credentials ;
- sandbox ;
- traitement des jobs Catalog ;
- Partner Portal / logs ;
- support d'intégration.

## 11. Checklist GO / NO GO

GO uniquement si :
- [ ] D365 stock READY ;
- [ ] catalogue 1 035 SKU validé métier ;
- [ ] Vendor ID confirmé pour le magasin ;
- [ ] verify HTTP 200 ;
- [ ] sandbox concluant ;
- [ ] aucun secret dans Git ;
- [ ] quantité non présente dans payload ;
- [ ] mapping SKU cohérent ;
- [ ] rollback testé ;
- [ ] responsable exploitation / e-commerce informé ;
- [ ] GLOVO_PUSH_ENABLED activé uniquement au moment du GO.

Sinon : NO GO, le push reste verrouillé.
