export const RETAIL_PROCESS_CATALOG=Object.freeze([
 {code:'integration_health',phase:'SETUP',label:'Santé des intégrations',trigger:'SCHEDULED',mandatory:true},
 {code:'assortment_sync',phase:'SETUP',label:'Synchronisation assortiment magasin',trigger:'SCHEDULED',mandatory:true},
 {code:'taxonomy_sync',phase:'SETUP',label:'Synchronisation catégories / familles',trigger:'SCHEDULED',mandatory:true},
 {code:'store_supply_mapping',phase:'SETUP',label:'Mapping magasin / source d’approvisionnement',trigger:'CONFIG',mandatory:true},

 {code:'handover_ack',phase:'PRE_OPENING',label:'Prise en compte de la passation',trigger:'OPENING',mandatory:true},
 {code:'staffing_readiness',phase:'PRE_OPENING',label:'Équipe, shifts et couverture minimale',trigger:'OPENING',mandatory:true},
 {code:'opening_security',phase:'PRE_OPENING',label:'Sécurité des accès et issues',trigger:'OPENING',mandatory:true},
 {code:'opening_equipment',phase:'PRE_OPENING',label:'POS, TPE, réseau, balances et équipements',trigger:'OPENING',mandatory:true},
 {code:'opening_cold_chain',phase:'PRE_OPENING',label:'Chaîne du froid à l’ouverture',trigger:'OPENING',mandatory:true},
 {code:'opening_cash',phase:'PRE_OPENING',label:'Caisses et fonds de caisse',trigger:'OPENING',mandatory:true},
 {code:'opening_commercial',phase:'PRE_OPENING',label:'Prix, promotions, dépliants et nouveautés',trigger:'OPENING',mandatory:true},
 {code:'opening_surface',phase:'PRE_OPENING',label:'Propreté, remplissage, fraîcheur et FEFO',trigger:'OPENING',mandatory:true},
 {code:'opening_stock_critical',phase:'PRE_OPENING',label:'Ruptures critiques de l’assortiment',trigger:'OPENING',mandatory:false},
 {code:'store_opening_validation',phase:'OPENING',label:'Validation finale d’ouverture',trigger:'OPENING',mandatory:true,gate:'STORE_OPENING'},

 {code:'sales_pulse',phase:'TRADING',label:'Suivi ventes, marge et objectifs',trigger:'CONTINUOUS',mandatory:false},
 {code:'category_performance',phase:'TRADING',label:'Performance rayon / catégorie / famille',trigger:'CONTINUOUS',mandatory:false},
 {code:'shelf_replenishment',phase:'TRADING',label:'Réassort rayon',trigger:'EVENT',mandatory:false},
 {code:'out_of_stock_management',phase:'TRADING',label:'Gestion des ruptures assortiment',trigger:'EVENT',mandatory:true},
 {code:'replenishment_recommendation',phase:'TRADING',label:'Recommandation de réapprovisionnement',trigger:'EVENT',mandatory:false},
 {code:'transfer_request',phase:'TRADING',label:'Demande / transfert depuis source d’approvisionnement',trigger:'EVENT',mandatory:false},
 {code:'stock_anomaly',phase:'TRADING',label:'Stock négatif ou incohérent',trigger:'EVENT',mandatory:true},
 {code:'outside_assortment_stock',phase:'TRADING',label:'Stock résiduel hors assortiment',trigger:'EVENT',mandatory:false},
 {code:'assortment_compliance',phase:'TRADING',label:'Conformité assortiment magasin',trigger:'SCHEDULED',mandatory:false},

 {code:'receiving_expected',phase:'RECEIVING',label:'Réceptions attendues',trigger:'EVENT',mandatory:false},
 {code:'receiving_quantity',phase:'RECEIVING',label:'Contrôle quantitatif réception',trigger:'EVENT',mandatory:true},
 {code:'receiving_quality',phase:'RECEIVING',label:'Contrôle qualité / température / emballage',trigger:'EVENT',mandatory:true},
 {code:'receiving_batch_expiry',phase:'RECEIVING',label:'Lots, DLC/DDM et traçabilité réception',trigger:'EVENT',mandatory:false},
 {code:'receiving_discrepancy',phase:'RECEIVING',label:'Écart commande / livraison',trigger:'EVENT',mandatory:true},
 {code:'receiving_accept_reject',phase:'RECEIVING',label:'Acceptation, rejet ou réception partielle',trigger:'EVENT',mandatory:true},
 {code:'receiving_post_export',phase:'RECEIVING',label:'Posting ou fichier de réception ERP',trigger:'EVENT',mandatory:false},

 {code:'price_change_execution',phase:'COMMERCIAL',label:'Exécution des changements de prix',trigger:'EVENT',mandatory:true},
 {code:'promotion_start',phase:'COMMERCIAL',label:'Mise en place promotion',trigger:'EVENT',mandatory:true},
 {code:'promotion_end',phase:'COMMERCIAL',label:'Retrait promotion / ancienne signalétique',trigger:'EVENT',mandatory:true},
 {code:'leaflet_execution',phase:'COMMERCIAL',label:'Exécution dépliant / campagne',trigger:'EVENT',mandatory:false},
 {code:'new_item_launch',phase:'COMMERCIAL',label:'Mise en rayon nouvel article',trigger:'EVENT',mandatory:false},
 {code:'price_promo_audit',phase:'COMMERCIAL',label:'Contrôle prix et signalétique terrain',trigger:'SCHEDULED',mandatory:false},

 {code:'dlc_monitoring',phase:'QUALITY',label:'Suivi DLC / DDM',trigger:'CONTINUOUS',mandatory:true},
 {code:'dlc_treatment',phase:'QUALITY',label:'Traitement retrait / démarque / don / retour',trigger:'EVENT',mandatory:true},
 {code:'cold_chain_monitoring',phase:'QUALITY',label:'Relevés chaîne du froid',trigger:'SCHEDULED',mandatory:true},
 {code:'cleaning_hygiene',phase:'QUALITY',label:'Nettoyage et hygiène',trigger:'SCHEDULED',mandatory:false},
 {code:'traceability_recall',phase:'QUALITY',label:'Traçabilité, retrait et rappel produit',trigger:'EVENT',mandatory:true},
 {code:'quality_nonconformity',phase:'QUALITY',label:'Non-conformité qualité et action corrective',trigger:'EVENT',mandatory:true},

 {code:'loss_capture',phase:'LOSS',label:'Saisie démarque / casse / perte',trigger:'CONTINUOUS',mandatory:true},
 {code:'loss_evidence',phase:'LOSS',label:'Preuves et justification démarque',trigger:'EVENT',mandatory:false},
 {code:'loss_approval',phase:'LOSS',label:'Approbation démarque selon seuil',trigger:'EVENT',mandatory:false},
 {code:'loss_export_post',phase:'LOSS',label:'Export ou posting démarque ERP',trigger:'CLOSING',mandatory:true},
 {code:'supplier_return',phase:'LOSS',label:'Retour fournisseur',trigger:'EVENT',mandatory:false},

 {code:'cycle_count',phase:'INVENTORY',label:'Inventaire tournant / ciblé',trigger:'SCHEDULED',mandatory:false},
 {code:'stock_discrepancy',phase:'INVENTORY',label:'Analyse écart inventaire',trigger:'EVENT',mandatory:true},
 {code:'inventory_adjustment',phase:'INVENTORY',label:'Ajustement / journal inventaire ERP',trigger:'EVENT',mandatory:false},
 {code:'full_inventory',phase:'INVENTORY',label:'Inventaire complet',trigger:'SCHEDULED',mandatory:false},

 {code:'employee_lifecycle',phase:'WORKFORCE',label:'Employés et contrats',trigger:'MANUAL',mandatory:false},
 {code:'shift_planning',phase:'WORKFORCE',label:'Planning et shifts',trigger:'SCHEDULED',mandatory:true},
 {code:'attendance',phase:'WORKFORCE',label:'Présences, absences et remplacements',trigger:'OPENING',mandatory:true},
 {code:'employee_objectives',phase:'WORKFORCE',label:'Objectifs collaborateurs',trigger:'SCHEDULED',mandatory:false},
 {code:'training_compliance',phase:'WORKFORCE',label:'Formation et habilitations',trigger:'SCHEDULED',mandatory:false},

 {code:'maintenance_check',phase:'MAINTENANCE',label:'Contrôle équipement',trigger:'SCHEDULED',mandatory:false},
 {code:'maintenance_incident',phase:'MAINTENANCE',label:'Panne / ticket maintenance',trigger:'EVENT',mandatory:true},
 {code:'preventive_maintenance',phase:'MAINTENANCE',label:'Maintenance préventive',trigger:'SCHEDULED',mandatory:false},

 {code:'customer_feedback',phase:'CUSTOMER',label:'Avis, NPS et irritants client',trigger:'CONTINUOUS',mandatory:false},
 {code:'customer_incident',phase:'CUSTOMER',label:'Incident ou réclamation client',trigger:'EVENT',mandatory:false},

 {code:'incident_management',phase:'CONTROL',label:'Incidents, actions et preuves',trigger:'EVENT',mandatory:true},
 {code:'manager_handover',phase:'CONTROL',label:'Passation entre responsables',trigger:'CLOSING',mandatory:true},
 {code:'process_compliance',phase:'CONTROL',label:'Conformité des process',trigger:'SCHEDULED',mandatory:false},
 {code:'safety_audit',phase:'CONTROL',label:'Audit sécurité / conformité',trigger:'SCHEDULED',mandatory:false},

 {code:'closing_surface',phase:'CLOSING',label:'Tour surface et remise en état',trigger:'CLOSING',mandatory:true},
 {code:'closing_dlc_cold',phase:'CLOSING',label:'DLC et froid fin de journée',trigger:'CLOSING',mandatory:true},
 {code:'closing_loss',phase:'CLOSING',label:'Démarque complète et prête ERP',trigger:'CLOSING',mandatory:true},
 {code:'closing_cash',phase:'CLOSING',label:'Clôture et rapprochement caisses',trigger:'CLOSING',mandatory:true},
 {code:'closing_receiving',phase:'CLOSING',label:'Réceptions finalisées',trigger:'CLOSING',mandatory:false},
 {code:'closing_stock',phase:'CLOSING',label:'Anomalies stock traitées',trigger:'CLOSING',mandatory:false},
 {code:'closing_incidents',phase:'CLOSING',label:'Incidents bloquants traités',trigger:'CLOSING',mandatory:true},
 {code:'closing_handover',phase:'CLOSING',label:'Passation préparée',trigger:'CLOSING',mandatory:true},
 {code:'closing_pack',phase:'CLOSING',label:'Pack de fermeture et exports ERP',trigger:'CLOSING',mandatory:true},
 {code:'closing_security',phase:'CLOSING',label:'Sécurité finale et alarme',trigger:'CLOSING',mandatory:true},
 {code:'store_closing_validation',phase:'CLOSING',label:'Validation finale de fermeture',trigger:'CLOSING',mandatory:true,gate:'STORE_CLOSING'},

 {code:'assortment_review',phase:'PERIODIC',label:'Revue assortiment et trous d’assortiment',trigger:'SCHEDULED',mandatory:false},
 {code:'margin_review',phase:'PERIODIC',label:'Revue marge et mix',trigger:'SCHEDULED',mandatory:false},
 {code:'shrink_review',phase:'PERIODIC',label:'Revue démarque et causes',trigger:'SCHEDULED',mandatory:false},
 {code:'supplier_performance',phase:'PERIODIC',label:'Performance fournisseurs / réception',trigger:'SCHEDULED',mandatory:false},
 {code:'workforce_review',phase:'PERIODIC',label:'Productivité, planning et couverture',trigger:'SCHEDULED',mandatory:false},
 {code:'store_performance_review',phase:'PERIODIC',label:'Revue performance magasin',trigger:'SCHEDULED',mandatory:false}
]);

export function processCatalogByPhase(){const out={};for(const p of RETAIL_PROCESS_CATALOG)(out[p.phase]??=[]).push(p);return out}
export function processDefinition(code){return RETAIL_PROCESS_CATALOG.find(x=>x.code===code)||null}
export function mandatoryProcessCodes(){return RETAIL_PROCESS_CATALOG.filter(x=>x.mandatory).map(x=>x.code)}
