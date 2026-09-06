# StoreOps — règles de priorité Responsable magasin

La file **À valider** n'est pas triée par module. Elle est triée par impact opérationnel.

## P0 — Immédiat

À traiter avant le reste :

- blocage critique d'ouverture ;
- stock négatif ;
- rupture sur un article en promotion du jour ;
- écart prix / promo constaté ;
- température / qualité critique ;
- DLC périmée ou critique.

## P1 — Prioritaire

À traiter rapidement dans la journée :

- rupture standard ;
- recomptage stock obligatoire ;
- action prix / promotion à exécuter ;
- réception en retard ;
- anomalie opérationnelle forte non P0.

## P2 — Aujourd'hui

Validations opérationnelles normales qui doivent être tracées aujourd'hui mais ne justifient pas d'interrompre un P0/P1.

## P3 — À surveiller

Signal non urgent conservé dans le cockpit pour suivi.

## Principe

Une **alerte** reste distincte d'une **validation** :

- À valider = travail généré par le système (prix, promo, stock, réception, DLC, etc.).
- Alerte = problème / incident nécessitant action corrective, preuve éventuelle et clôture.

La criticité d'une alerte reste pilotée par le moteur incidents/SLA. La priorité P0-P3 ne remplace pas la criticité ; elle détermine seulement l'ordre de la file de travail Responsable.
