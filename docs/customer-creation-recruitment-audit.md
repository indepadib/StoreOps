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

Premier contrôle local de `node backend/scripts/audit-customer-creation.mjs` : BLOCKED,
`D365_ACCESS_NOT_CONFIGURED`, mode live désactivé et quatre variables absentes :
`D365_BASE_URL`, `D365_TENANT_ID`, `D365_CLIENT_ID`, `D365_CLIENT_SECRET`.

Ce premier contrôle est désormais complété par une lecture réelle autorisée le
9 novembre 2026 à 16:27 UTC, via la configuration existante du site Netlify.
OAuth et `/Metadata/DataEntities` fonctionnent avec l'accès réseau autorisé.
Aucune valeur client ou clé n'est publiée dans cet audit.

Résultats réels : `CustomersV3` (310 champs) et `Customers` (254 champs) sont
lisibles, avec `CustomerAccount` et `PartyNumber`, sans champ de création observé.
Les quatre requêtes explicites `$select=CustomerAccount,CreatedDateTime` ou
`$select=CustomerAccount,CreatedOn` sur ces deux collections échouent en HTTP 400 :
`Could not find a property named ...` sur les types `CustomerV3` et `Customer`.
Il s'agit donc d'une absence démontrée de ces propriétés sur ces entités, pas
d'une preuve d'absence de date dans la table physique.

`AsyncCustomers` est lisible (54 champs), avec `StoreRecId`, `CustAccount` et
`OnlineCustCreated`, sans champ de date de création observé. Ce n'est pas une
source de création de compte certifiée. `AsyncCustomerV2` est vide dans le probe.
`CustCustomerDetailV2Entity` et `CustCustomerDetailEntity` échouent à la lecture.
La découverte est bornée aux 100 premiers candidats clients du connecteur :
elle n'exclut pas une autre entité personnalisée du tenant.

La table physique, son champ exact et sa publication restent à confirmer par
l'administrateur D365 : exposer la véritable création du compte, son identité
réseau, sa société et le magasin de création, avec historique et droits complets.
`CustomersV3` reste une fixture synthétique dans les tests ; aucune configuration
de production n'a été activée sur la seule base de son nom.

Le code du connecteur expose `/Metadata/DataEntities` pour la découverte et
`/data/{entité}` pour la lecture. Le script ajouté liste les candidats clients puis
uniquement les noms des champs observés ; il ne publie aucun identifiant client.
Ces chemins ont été testés contre D365. Le script cible désormais les collections
de comptes par défaut (`--all` pour élargir) et vérifie les deux champs par requête
explicite sans afficher les valeurs renvoyées.

## Durcissement de publication

Les réponses de recrutement tardives d'une ancienne période ou d'un ancien magasin
ne peuvent plus remplacer le périmètre courant. Le lecteur OData exige une
collection valide à chaque page ; une réponse mal formée ou une pagination courte
avec continuation non traitée bloque le chiffre, au lieu de certifier zéro ou
un total partiel. Ces cas sont exécutés dans `customer-creation-publication.mjs`.

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
