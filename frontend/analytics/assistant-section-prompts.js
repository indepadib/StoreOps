export const sectionPrompts={
 reference:[['Articles vendus','Combien de références vendues ?'],['Marges à examiner','Quels sont les 10 articles avec la plus faible marge ?'],['Sans vente','Liste des articles sans vente']],
 detention:[['Détention PGC','Détention magasin PGC sur historique des réceptions'],['Détention APLS','Détention magasin APLS sur historique des réceptions'],['Disponible entrepôt','Quels articles sont en entrepôt et absents en magasin ?']],
 overview:[['Diagnostiquer le réseau','Quel est le problème du réseau ?'],['Comprendre le CA','Pourquoi le CA baisse ?'],['Prioriser les manques','Quelles actions de réapprovisionnement prioriser ?']],
 sales:[['Expliquer les ventes','Pourquoi les ventes baissent ?'],['Articles en recul','Quels sont les 10 articles en plus forte baisse de CA ?'],['Comparer les paniers','Comparer les tickets et le panier moyen']],
 network:[['Diagnostic magasins','Quel est le problème des magasins ?'],['Comparer les visites','Comparer les magasins par tickets'],['Comparer les paniers','Comparer les magasins par panier moyen']],
 categories:[['Enquêter sur PGC','Pourquoi les ventes PGC baissent ?'],['Enquêter sur APLS','Pourquoi les ventes APLS baissent ?'],['Rayons moteurs','Quels sont les 10 meilleurs rayons par CA ?']],
 suppliers:[['Ventes par fournisseur','Quels sont les 10 meilleurs fournisseurs par CA ?'],['Analyser l’import','Pourquoi les ventes import baissent ?'],['Disponibilité import','Détention entrepôt import']],
 crm:[['Retour des clients','Quels clients identifiés sont revenus ?'],['Clients distincts','Combien de clients identifiés ?'],['Identification','Quel est le taux d’identification des tickets ?']],
 inventory:[['Comptages Dynamics','Liste des inventaires Dynamics'],['Journaux de démarque','Quels journaux de démarque Dynamics sont accessibles ?'],['Complément StoreOps','Liste des inventaires StoreOps']],
 loyalty:[['Retour des identifiés','Quel est le retour des clients identifiés ?'],['Poids des identifiés','Quel est le poids du CA identifié ?'],['Exécution en caisse','Top 10 caissiers par identification']],
 cashiers:[['Identification en caisse','Top 10 caissiers par identification'],['Volume de tickets','Top 10 caissiers par tickets'],['CA par caissier','Top 10 caissiers par CA']],
 promotions:[['Évolution des remises','Quelle évolution des ventes avec remise ?'],['Tickets concernés','Combien de tickets avec promotion ?'],['Croiser les signaux','Pourquoi les ventes baissent malgré les promotions ?']]
};
export function promptsForSection(section){return sectionPrompts[section]||sectionPrompts.overview;}

export const sectionGuide={
 reference:['Vérifier l’article','Commencer par le code, le nom et l’unité. Vérifier si le prix vient de la fiche, d’un accord ou d’un achat facturé.','Exporter la sélection lorsque le classement et les unités correspondent à l’usage.'],
 detention:['Repérer les manques actionnables','Comparer la détention magasin à ses réceptions, puis regarder les articles absents en magasin mais présents en entrepôt.','Vérifier réserve, unité et stock physique avant de proposer un transfert.'],
 overview:['Choisir une priorité','Lire l’écart de CA, les tickets et le panier, puis vérifier le magasin ou la catégorie qui contribue le plus.','Une journée en cours reste provisoire. Partager la synthèse avec les dates et la couverture.'],
 sales:['Expliquer la variation','Comparer CA, tickets et panier sur des durées comparables. Pour un article, séparer prix payé, quantités, remises et disponibilité.','Examiner les principaux écarts et le taux de marge avec sa couverture de coût.'],
 network:['Comparer les magasins','Comparer le rythme et les écarts propres à chaque magasin, avec la même base de jours.','Chercher où le recul se concentre et où la progression mérite d’être reproduite.'],
 categories:['Identifier ce qui tire le résultat','Regarder le poids du rayon et son écart en DH, puis descendre vers les articles qui expliquent le mouvement.','Lancer un diagnostic de catégorie pour mesurer le retour et les paniers sans compter deux fois les clients.'],
 suppliers:['Distinguer vente et approvisionnement','Lire les ventes et la disponibilité des références, puis regarder les commandes ouvertes et le service sur lignes contrôlées.','Relancer une ligne documentée. Un stock nul ne prouve pas à lui seul un défaut fournisseur.'],
 crm:['Comprendre le retour et la valeur','Lire le retour des anciens clients et comparer les visites et le panier des mêmes clients revenus.','Traiter d’abord le moteur principal. Ne pas assimiler un non-revu à un client définitivement perdu.'],
 inventory:['Contrôler les écarts','Lire d’abord les journaux Dynamics de la période. Le stock courant est une image séparée.','Vérifier le motif, le comptage et le statut avant de parler de perte ou de valorisation.'],
 loyalty:['Séparer retour et identification','Comparer l’identification des tickets et le retour des anciens clients. Une première observation ne prouve pas un recrutement.','Vérifier si un mouvement du taux d’identification change la population analysée.'],
 cashiers:['Comparer à volume suffisant','Vérifier le nombre de tickets, le créneau et le magasin avant de comparer les taux.','Utiliser les écarts pour orienter l’accompagnement, avec des échantillons comparables.'],
 promotions:['Mesurer les résultats observés','Comparer tickets remisés, CA remisé et montant des remises. Une offre active ne suffit pas à qualifier toutes ses ventes.','Vérifier couverture, disponibilité et coûts avant de conclure à un effet incrémental.']
};
