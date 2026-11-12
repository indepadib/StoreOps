# H&S Buying Group — audit contradictoire de maturité
Date : 12 novembre 2026 · Périmètre : Centrale d'achat StoreOps, backend et schéma hs_buying, extraction IA, RFA et parcours.
Méthode : analyse du code relié à GitHub, workflows CI/Netlify et benchmark public. **Ce travail n'est pas une certification indépendante, un pentest ni un audit UX photographique authentifié.**

## Synthèse COMEX
**Décision proposée : poursuivre un pilote contrôlé, pas encore généraliser comme système de référence financier.**
La plateforme permet dépôt PDF/DOCX, lecture IA et revue, approbation contractuelle, fichiers achats importés, simulation de RFA et rapprochement théorique. Cependant elle ne certifie pas l'assiette financière, les avoirs D365 et les virements. La priorité est de relier accord fournisseur → dépense éligible → créance RFA → réclamation → preuve → règlement comptabilisé.

## Scorecard de maturité — jugement qualitatif de revue de code, pas un score de conformité
| Axe | Constat actuel | Gate pour exploitation |
|---|---|---|
| Dossiers contrats | Historique, PDF privé, signatures de revue, workflow double approbation | 10 contrats réels testés, clauses/page vérifiées |
| IA contractuelle | Double lecture spécialisée et tâches serveur résistant aux 504 | OCR annexes et tableaux complexes, précision mesurée |
| RFA théorique | Moteur rétroactif et progressif, centimes BigInt | Assiette éligible prouvée par facture, exclusions validées |
| Imports achats | Lignes CSV versionnées, statut non certifié | Normalisation fournisseur/produit/UOM et anti-doublons multi-ERP |
| Recouvrement RFA | Nouveau registre de réclamations et justificatifs déclarés | Avoir D365 / comptabilité / banque indépendamment rapprochés |
| Multi-enseignes | Structure contrats Groupe/Local, accès D365 limité | Connecteurs ERP-agnostiques, scopes et règles intercompany |
| Accès | Direction et administrateurs | Rôles acheteur/Finance/Juridique + accès entité + dual control |
| Expérience | Navigation dense et ancienne identité verte | Blue design, raccourcis, tests mobile/desktop, vrai test utilisateur |
| Conformité | Consentement IA, stockage privé, historique | DPO/CNDP, résidence et contrat prestataire validés |

## Revue par 6 personas
1. **Directeur des achats Groupe** : veut mutualiser les volumes, repérer fournisseurs communs et mesurer les économies réelles ; il manque spend cube et gestion des synergies.
2. **Acheteur enseigne** : veut trouver tarif, périmètre, exclus, avenant, délai et conditions locales ; il manque droits limités à son enseigne et comparateur prix normalisés.
3. **Juriste / Contract manager** : veut lectures sourcées, gestion des renégociations, visas et alertes ; OCR scannés, annexes et signature électronique restent à valider.
4. **DAF / contrôle de gestion** : veut provisions, gains constatés, créances, avoirs et écritures ; il ne faut JAMAIS afficher « encaissé » pour une estimation ou une saisie non contrôlée.
5. **Comptable fournisseurs** : veut identifier la facture, la note de crédit, le lettrage fournisseur et le paiement ; rapprochement GL/banque à construire.
6. **RSSI/Administrateur** : veut permissions minimales, traçabilité, gestion des secrets, chiffrement et rétention ; test d'accès, pentest et conformité résidence non réalisés.

## Risques / anomalies à traiter
- **P0 — exactitude financière** : le journal importé n'est pas une assiette RFA contractuellement éligible. Vérifier TVA, retours, remises en facture, exclusions famille, périodes, avoirs, intercompany, UOM.
- **P0 — double comptage** : accord Groupe et avenants locaux peuvent couvrir les mêmes transactions. En l'absence d'arbitrage, ne pas cumuler les deux.
- **P0 — gouvernance** : tous les utilisateurs de la Centrale sont actuellement Direction/Admin ; insuffisant pour un workflow multipartite avec séparation Finance/Achats/Juridique.
- **P0 — traitement IA de PDF** : ne pas considérer le site web comme garantie d'hébergement privé du modèle. Transfert à un prestataire externe soumis à consentement et revue conformité.
- **P1 — recouvrement** : une référence textuelle de règlement n'est pas une preuve bancaire. Le nouveau registre distingue « déclaré » et « certifié » mais n'a pas de rapprochement AP/GL.
- **P1 — qualité de lecture** : les documents scannés, annexes absentes, tableaux denses et limite 5 Mo demeurent des risques d'extraction.
- **P1 — visual design** : rationaliser navigation et styles, tester la lisibilité et les erreurs sur mobile.
- **P2 — portefeuille fournisseurs** : rapprochement ICE/RC/alias, contrats-cadres, scorecards, appels d'offres, approvisionnements et risques qualité.
- **P2 — automatisation** : alertes de renouvellement, relances RFA, détection de dépassement de seuil et d'écart avoir. Aucune auto-validation financière.

## Chaîne source-to-savings cible
1. Enregistrer la société fournisseur et le contrat signé + versions/annexes.
2. Extraire les clauses avec preuve PDF/page puis les faire valider par Juridique/Achats/Finance.
3. Constituer les achats admissibles en consolidant D365 et les autres ERP, avec traçabilité facture par facture.
4. Calculer rétroactivité, tranches, assiettes, exclusions et simulations ; contrôler la période, les groupements et l'absence de doublon.
5. Réclamer au fournisseur via dossier, justificatifs et accusé de réception.
6. Documenter avoirs, paiements, compensations, litiges et restes.
7. Certifier par rapprochement financier et lettrage bancaire/GL.
8. Renégocier sur le gain réellement constaté et les opportunités fournisseur.

## Benchmark
- Enable : gestion avancée des paliers RFA, suivi des montants acquis et prévisions — https://www.enable.com/
- Icertis : intelligence contractuelle, obligations post-signature et action dans les workflows — https://www.icertis.com/products/platform/copilot/
- Sirion : gouvernance, performance et conformité fournisseur — https://www.sirion.ai/library/contract-insights/evaluating-ai-first-solutions-for-procurement-teams/
- e-bate : accords, réclamations, provisions et rapprochements — https://www.e-bate.io/product/
- Microsoft Dynamics 365 : contrats de remise et validation des claims / transactions — https://learn.microsoft.com/fr-fr/dynamics365/supply-chain/rebate-management/rebate-management-overview

## GitHub skills étudiés et bonnes pratiques adoptées
- Anthropic frontend-design (design distinctif métier, textes exacts, états vides) : https://github.com/anthropics/skills/blob/main/skills/frontend-design/SKILL.md
- GuidanceStudio UX/UI audit (treize dimensions, sévérité 0–4, vérifier chaque viewport) : https://github.com/GuidanceStudio/uxui-audit-skill
- Superpowers (tests avant fusion, débogage systématique, preuve avant conclusion) : https://github.com/obra/superpowers
- axe-core (futur test automatique WCAG) : https://github.com/dequelabs/axe-core
- Lighthouse (futur budget performance) : https://github.com/GoogleChrome/lighthouse

**Important :** aucune bibliothèque tiers « skills » n'a été installée à l'aveugle. La sélection passe par utilité, licence, sécurité et compatibilité. La revue graphique ci-dessus est une revue du CSS/HTML ; les captures authentifiées et les scores WCAG/Lighthouse restent à exécuter.

## RACI recommandé
| Étape | Achats | Juridique | Finance | Direction |
|---|---|---|---|---|
| Négociation et accord | R | C | C | A |
| Validation clause et assiette | R | R | R | A |
| Réclamation fournisseur | R | I | C | A |
| Avoir et paiement | C | I | R/A | I |
| Clôture après rapprochement | C | I | R | A |

## Quality gates avant déploiement large
- 10 contrats complexes et 100 % des taux/seuils utilisés relus contre les documents originaux.
- 0 RFA enregistrée comme encaissée sans rapprocher facture/avoir/banque.
- 0 dépassement d'un montant réclamé par les preuves de règlement.
- 0 duplication d'assiette fournisseur/contrat/periode/enseigne.
- 0 accès non autorisé entre entités dans les nouveaux profils.
- 0 faille critique WCAG 2.2 AA sur les parcours vérifiés par axe et tests manuels ; il faudra une capture de la véritable application.
- Aucun 504 dans le parcours lecture IA après test sur plusieurs documents longs, avec suivi p95.
- Protection juridique/CNDP des PDF et rétention explicitement validées.

## Roadmap
**Vague 1 (dans ce lot) :** RFA claims + justificatifs déclarés + statuts sourcés, interface action-first, design bleu, tests.
**Vague 2 (priorité suivante) :** D365 AP et journaux de GL, assiette admissible détaillée, scope par entité, contrôleur Finance, scans et annexes lourdes.
**Vague 3 :** spend cube Groupe, mutualisation fournisseur, forecasts et alertes vérifiables, portail fournisseur, comparaison tarifaire.
