# Val Fleuri — Go-Live StoreOps

## Objectif
Lancer Val Fleuri rapidement avec le Responsable magasin sur téléphone, puis affiner progressivement les intégrations secondaires.

## Profil pilote
- Responsable magasin : Ayoub Nachiti.
- Horaires : 08:00–23:00.
- 2 caisses : C01 TPE intégré, C02 TPE manuel.
- Fond de caisse : 1 000 DH par caisse.

## Principe d’intégration au lancement
Le mode Dynamics LIVE ne doit pas rendre le pilote dépendant de flux non encore mappés.

- Article / EAN : Dynamics LIVE.
- Stock : Dynamics LIVE.
- Prix / promotions : Dynamics LIVE.
- Équipe : StoreOps pilote jusqu’au mapping D365/HR.
- Préparation caisses : StoreOps pilote jusqu’au mapping shifts/Commerce.
- Ouverture / fermeture : StoreOps.
- Froid / qualité / incidents / preuves / maintenance : StoreOps.
- Writes réception / inventaire / démarque : activés plus tard, un par un, après validation des mappings D365.

## Parcours Responsable
Tout doit être exécutable sur téléphone : Aujourd’hui → Journée → Contrôles → Alertes → Plus.
Les opérations article proposent toujours Scanner + Saisie manuelle.

## Critères GO
1. Backend public HTTPS.
2. Connexion Microsoft fonctionnelle sur téléphone.
3. Ayoub ne voit que Val Fleuri.
4. Ouverture complète réalisable sur mobile.
5. C01 et C02 attendent chacune 1 000 DH.
6. Photos et preuves persistantes.
7. Lectures Dynamics article/stock/prix fonctionnelles.
8. Aucun POST métier mis en file d’attente hors ligne.

Le planning détaillé et les intégrations secondaires sont volontairement hors chemin critique du lancement.
