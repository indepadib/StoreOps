# Priorités de décision dans la vue exécutive

Le bloc « Que décider maintenant ? » transforme les preuves déjà chargées en fiches d’action : constat, contrôle concret, responsable proposé, date de revue proposée et mesure du résultat. Les trois premières fiches sont visibles ; les autres restent accessibles. Le plan peut être exporté en texte avec ses fenêtres et son périmètre. Il ne crée ni affectation ni statut d’exécution partagé.

L’ordre est explicite : comparaison à fiabiliser, anomalies et réapprovisionnement documentés, puis reculs de CA par montant décroissant. Les reculs article et magasin se recoupent et ne sont jamais additionnés en potentiel de gain. L’action article prépare une enquête prix / paniers / retour client dans l’assistant, sur les fenêtres courantes sans reprendre une ancienne date d’événement.

Les recommandations financières exigent deux fenêtres clôturées, disjointes, de même durée, une couverture complète des magasins et des contrôles OK. Ce filtre ne certifie pas une causalité ni la comparabilité du calendrier commercial ; les jours de semaine font partie du diagnostic. Le stock est une image distincte, datée, filtrée sur les magasins sélectionnés. Une détention inconnue ou un stock inconnu ne devient pas un zéro. Aucun appel IA supplémentaire et aucune écriture Dynamics ne sont nécessaires pour le classement.

Validation : `node backend/tests/analytics-decision-priorities.mjs`, contrat des sélecteurs et contrôles de syntaxe. Les tests couvrent les données manquantes, fenêtres ouvertes ou chevauchantes, couverture de comparaison, classement par montant, décomposition visites / panier, périmètre stock et export.
