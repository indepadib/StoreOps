# Identité article, pilotage UB et températures

Base de reprise : main `e27853a865b829dac58740987b010f2d400ee288`.

## Noms d’articles

Le dashboard, les ruptures, les stocks négatifs et les invendus partagent désormais la résolution des libellés : ProductName / ProductDescription / Description des produits libérés, identité déjà connue par scan, puis Description de la table des codes-barres utilisée par le scanner. SearchName seul ne prouve pas le nom d’un article. Le code article reste disponible comme référence.

Les limites silencieuses de 160 articles et le délai qui abandonnait l’enrichissement des invendus sont supprimés. Les lectures se font par lots de 30, avec réutilisation des caches. ProductSearchName reste un dernier secours signalé FALLBACK lorsque le scan et les descriptions ne donnent pas de résultat. Un nom absent reste signalé MISSING ; aucune donnée article n’est inventée. Le temps de réponse dépend encore du nombre d’articles et des réponses D365.

## Hiérarchie et classement

ProductCategoryAssignments apporte le code UB conservé en texte, y compris ses zéros initiaux. Ses préfixes donnent Département (3), Rayon (6), Famille (9), Sous-famille (12), Sous-sous-famille (15), UB (18), puis Article. Les libellés viennent des catégories de la même source et hiérarchie ; le rayon existant sert de libellé de secours.

Plusieurs UB différentes pour un article sont AMBIGUOUS, une absence est MISSING. Les ventes restent dans « Non classé ». Le tableau permet recherche, classement CA / quantités / écart D-7, ordre croissant ou décroissant et descente jusqu’à l’article. Le CA signé inclut les retours et tous les résultats, même ceux hors de la page affichée. D-7 respecte la disponibilité de la comparaison à même heure du moteur existant.

La synchronisation refuse les extractions tronquées et les périmètres ambigus ou incomplets ; catégories et affectations sont remplacées ensemble dans une transaction. Les lignes portant explicitement une autre société sont exclues. Les référentiels sans société sont traités comme globaux.

## Registre des températures

Le fichier fourni « Suivi de température FRANPRIX (1) (2)-1.xlsx » est une trame vide. Il définit les quatre passages 7 h, 12 h, 17 h et 22 h, l’heure et la température du contrôle correctif, l’action et la signature. Il ne contient pas d’historique ni d’inventaire d’équipements exploitable.

Le registre nécessite donc l’ajout des équipements réels par magasin. Leurs plages reprennent les profils froid réseau existants lors de la création. Les relevés gardent la date magasin, l’heure réelle, l’auteur connecté, la date d’enregistrement et la plage utilisée. Un relevé vide ne devient jamais 0 °C. Les créneaux futurs sont refusés et un recontrôle ajoute une ligne sans remplacer le premier relevé.

Une non-conformité exige un constat/action et ouvre un incident avec preuve requise. Un retour à une température conforme ne clôture pas automatiquement cet incident. Les seuils d’intervention présents dans la trame ne sont pas utilisés comme plages de conformité ni comme règles automatiques de destruction. Le contrôle préalable à l’ouverture reste distinct du suivi des quatre passages.

## Validation et limites

382 fichiers backend/frontend contrôlés syntaxiquement ; 17 tests ciblés passent. Le nouveau test vérifie plus de 160 identités, le secours code-barres et cache, les six préfixes avec zéro initial, les affectations ambiguës, les totaux signés, les droits par magasin, l’historique froid, les incidents et l’atomicité de synchronisation.

Les essais utilisent une base isolée et des réponses D365 simulées. L’affichage avec les libellés et affectations D365 réels et le parcours visuel sur les appareils magasin restent à valider. Aucun changement n’est déployé en production dans cette reprise.
