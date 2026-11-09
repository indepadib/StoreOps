# Recrutement fidélité — audit du 9 novembre 2026

## Constat et décision

Le calcul précédent utilisait `RetailLoyaltyCardEntity` / `RetailLoyaltyCards`,
`LoyaltyEnrollmentDate` ou `LoyaltyEnrollmentDateLocal`, avec dédoublonnage par
carte et addition des magasins. Le range pouvait être READY avec seulement une
partie des magasins ou une lecture tronquée. Ce calcul ne démontre pas une création
de compte client. Les anciens caches d'adhésion et de base cumulée sont retirés de
ces parcours. Les taux restent indisponibles sans population éligible réconciliée.

Une création = un identifiant de compte client réseau distinct, à sa première date
réelle de création, dans le mois selon le fuseau métier vérifié. Une carte, une
adhésion, une première vente ou une date de migration ne remplace jamais cette date.

## Accès réellement disponible

Exécution de `node backend/scripts/audit-customer-creation.mjs` : BLOCKED,
`D365_ACCESS_NOT_CONFIGURED`, mode live désactivé et quatre variables absentes :
`D365_BASE_URL`, `D365_TENANT_ID`, `D365_CLIENT_ID`, `D365_CLIENT_SECRET`.

Aucune réponse D365 réelle ni métadonnée du tenant n'a donc été obtenue.
La table physique des comptes clients, la Data Entity qui l'expose et son champ
exact CreatedDateTime/CreatedOn ne sont PAS identifiés/certifiés dans cet audit.
`CustomersV3` dans les tests est une fixture, pas une découverte du tenant.

Le code du connecteur expose `/Metadata/DataEntities` pour la découverte et
`/data/{entité}` pour la lecture. Le script ajouté liste les candidats clients puis
uniquement les noms des champs observés ; il ne publie aucun identifiant client.
Ces chemins sont observés dans le code, pas testés contre D365 ici.

## Configuration après audit D365

Renseigner explicitement `D365_CUSTOMER_CREATION_ENTITY`,
`D365_CUSTOMER_CREATION_ID_FIELD`, `D365_CUSTOMER_CREATION_DATE_FIELD`
(CreatedDateTime ou CreatedOn exact), `D365_CUSTOMER_CREATION_TIMEZONE`.
Les champs magasin et personnel de création sont facultatifs :
`D365_CUSTOMER_CREATION_STORE_FIELD`, `D365_CUSTOMER_CREATION_STAFF_FIELD`.
Renseigner les identifiants StoreOps du réseau complet dans
`D365_CUSTOMER_CREATION_NETWORK_STORE_IDS` (séparés par virgules).

`D365_CUSTOMER_CREATION_VERIFIED=true` et `D365_CUSTOMER_CREATION_EVIDENCE`
ne doivent être renseignés qu'après preuve conservée de la table source,
de la sémantique du champ, de l'identité commune entre sociétés, de l'historique,
du fuseau et de la couverture des droits du compte de service. La présence d'un
champ dans une réponse ne constitue pas cette preuve. Aucun mapping par défaut.

## Calcul et couverture

La lecture parcourt l'historique de comptes avant le filtrage du mois afin qu'un
doublon plus récent ne transforme pas un compte ancien en recrutement.
La première date prévaut ; les attributions contradictoires à cette date sont
classées sans attribution. Aucun magasin ou caissier n'est inféré d'une vente.
Les comptes sans attribution sont comptés séparément pour le réseau complet
vérifié ; un sous-périmètre ambigu reste indisponible. Les valeurs nominatives
ne sont pas renvoyées au reporting.

Une lecture échouée, tronquée, sans identité ou date exploitable produit null,
jamais zéro ni un total partiel certifié. Une lecture complète vide produit zéro.
La première version est plafonnée à 100 000 lignes : au plafond le KPI est
indisponible. Pour une base supérieure, préparer une source historique ou un
index réconcilié préservant la première création avant activation en production.
La base historique cumulée et les réponses de recrutement de l'agent restent
suspendues tant que la réconciliation réelle n'est pas réalisée.

## Contrôles avant toute publication

Rapprocher les identifiants et dates avec un export complet des comptes D365,
notamment septembre/octobre, doublons multi-sociétés et multi-cartes, comptes
migrés, limites du mois et création sans achat. Vérifier le réseau :
total distinct = somme des attributions magasins exclusives + sans attribution.
Les créations sans personnel restent distinctes du classement caissiers.
Vérifier Analytics, CSV et agent sur le même périmètre ; ne réactiver aucun taux
sans définition et source de sa population éligible.

Pas de déploiement de ce correctif avant ces preuves. Les tests synthétiques
valident la logique, pas les chiffres d'octobre. Le total 2 267 et son dérivé
512/semaine ne sont pas des créations certifiées et doivent être retirés du COMEX.
