# StoreOps — règle terrain Responsable magasin

## Principe
Le téléphone est le terminal opérationnel principal du Responsable magasin. Le parcours StoreOps doit être entièrement réalisable depuis le téléphone, sans dépendre d'un PC.

## Identification article
Tout flux qui demande d'identifier un article doit proposer les deux modes en permanence :

1. **Scanner** le code-barres avec la caméra arrière du téléphone.
2. **Saisir manuellement** l'EAN / code article si le scan est impossible ou illisible.

La saisie manuelle ne doit jamais disparaître lorsque le scan est disponible, et le scan ne doit jamais être le seul moyen d'avancer.

## Flux couverts
- Prix & promotions
- Contrôle qualité terrain
- DLC / DDM
- Stock & inventaire
- Démarque & pertes
- Réception : scan/saisie pour retrouver immédiatement la ligne article du PO

## UX terrain
- une seule action principale à la fois ;
- boutons tactiles adaptés au téléphone ;
- caméra arrière privilégiée ;
- scan réussi = champ rempli automatiquement puis action de recherche/identification déclenchée lorsque c'est sans risque ;
- si la caméra ou la détection n'est pas disponible, focus immédiat sur la saisie manuelle ;
- aucune validation métier n'est réalisée automatiquement après un scan : le Responsable garde la confirmation finale.
