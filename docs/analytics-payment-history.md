# Paiements carte / TPE : journal historique observé

La page Paiements lit les lignes du journal D365 pour chaque magasin autorisé
sélectionné, depuis la première date accessible jusqu’à la date de fin choisie.
Par défaut, la fin correspond à hier, heure métier Africa/Casablanca. Les dates
de comparaison des ventes ne restreignent pas cette lecture historique.
Les archives retirées de D365 ne sont pas certifiées : « depuis le début » veut
dire depuis le premier journal accessible, pas depuis l’ouverture garantie.

## Périmètre et qualité

Le montant conserve le signe source. La page sépare montants positifs,
montants négatifs en valeur absolue et solde signé. Elle ne nomme pas ces flux
encaissements/remboursements sans validation de l’orientation des signes.
Les versements/remises et commissions bancaires ne sont pas rapprochés.

Les cartes bancaires sont reconnues à partir des libellés D365 (CB, TPE, Visa,
Mastercard, carte bancaire, crédit/débit), ou d’une marque bancaire explicite
dans le champ de type de carte. Aucun code de paiement numérique n’est supposé.
Les cartes fidélité, cartes cadeaux et Wallet sont exclues. La CB manuelle
reste distincte et son inclusion est sélectionnable. Le simple libellé « Card »
sans marque bancaire n’est pas une preuve suffisante ; ses lignes restent
non classées. Le montant affiché s’intitule sous-total des modes reconnus.

Les annulations sont exclues lorsque le statut source est exposé et reconnu.
Les statuts absents ou ambigus sont comptés et le résultat reste explicitement
un journal observé non certifié. Les devises ne sont jamais additionnées.
Une base de montant comptable MST sans base transactionnelle exploitable est
refusée, plutôt que présentée sous une devise POS non prouvée.

## Lecture complète et performance

Pagination OData par lien de continuation, identité de ligne SourceKey/RecId
ou identité composée date/terminal/transaction/ligne. Les répétitions exactes
sont dédupliquées ; une identité contradictoire bloque le résultat. Dates,
société, magasin, devise et montants sont contrôlés. Les réponses partielles
n’exposent aucun total, et un magasin en échec suspend le total réseau.

Les curseurs sont liés à l’utilisateur, au magasin, à la société, à la source
et à la date de fin. Seules les lectures complètes sont réutilisables dans le
cache de résultat. Une option permet de relire D365. La limite de 500 000 lignes
par magasin interrompt la lecture sans prétendre produire un historique complet.
Au-delà, une source durable agrégée est nécessaire.

Le regroupement mois / semaine ISO / jour, le regroupement magasin / réseau,
l’inclusion de CB manuelle et le filtre de début se calculent sans relire D365.
Le tableau charge 300 regroupements à la fois ; les exports CSV/Excel contiennent
toute la lecture regroupée. L’Excel inclut la couverture, les sources et les
réserves. Les compteurs de lignes ne sont pas des nombres de tickets distincts.

## Validation

Tests des signes, annulations, remboursements non absolutisés dans le net,
exclusion fidélité/cadeaux, type bancaire explicite, CB manuelle, semaines ISO
aux changements d’année, devises distinctes, identités, pagination, répétitions,
contrôle de périmètre et cache complet uniquement. Test DOM de la page, lecture
réseau complète, regroupement sans appel supplémentaire, options, export et
suppression de résultat hors périmètre. Aucune donnée synthétique de ces tests
ne constitue un total réel de paiements.
