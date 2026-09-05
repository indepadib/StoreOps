# Val Fleuri — Go-Live StoreOps

## Objectif
Lancer Val Fleuri rapidement avec le Responsable magasin sur téléphone, puis affiner progressivement les intégrations secondaires.

## Ce qui doit être opérationnel au lancement
- Responsable magasin : Ayoub Nachiti.
- Horaires : 08:00–23:00.
- 2 caisses : C01 TPE intégré, C02 TPE manuel.
- Fond de caisse : 1 000 DH par caisse.
- Parcours mobile Responsable : Aujourd’hui → Journée → Contrôles → Alertes → Plus.
- Scan caméra + saisie manuelle pour les opérations article.
- Ouverture / fermeture guidées et auditables.
- Contrôles froid, caisses, prix/promo, réception, DLC, stock, qualité, maintenance, incidents, démarque.
- Preuves obligatoires sur les incidents critiques.
- Traçabilité de complétude du Responsable distincte du Store Health.

## Planning équipe
Le planning détaillé est volontairement différé. Il ne doit pas empêcher le pilote.
Pendant le pilote, le module Équipe est géré dans StoreOps avec une saisie terrain simplifiée ; l’intégration planning D365/HR sera ajoutée après lancement.

## Intégrations
### Prêtes / utilisables
- Frontend mobile PWA.
- Backend StoreOps.
- Auth Microsoft Entra préparée.
- Lecture Dynamics déjà disponible pour article/EAN, stock, prix et promotions lorsque le backend est en mode live.

### À activer après hébergement
- URL publique backend Azure.
- App Registration Entra API + SPA.
- Variables d’environnement sécurisées.
- CORS Netlify → Azure.

### À affiner après lancement
- Planning équipe D365/HR.
- Écritures D365 : réception, inventaire, démarque/pertes.
- Topologie froide détaillée du magasin.
- Extension aux autres magasins.

## Critères Go / No-Go
GO si :
1. le backend public répond en HTTPS ;
2. Ayoub peut se connecter depuis son téléphone ;
3. il ne voit que Val Fleuri ;
4. le parcours ouverture peut être exécuté intégralement sur mobile ;
5. C01/C02 attendent chacune 1 000 DH ;
6. les photos/preuves persistent ;
7. les lectures Dynamics article/stock/prix fonctionnent ;
8. aucune opération critique n’est validée silencieusement hors ligne.

NO-GO uniquement si un de ces huit points est faux.
