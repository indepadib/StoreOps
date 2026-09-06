const state=(code,label,tone='neutral')=>({code,label,tone});

export function integrationReadiness({connected=false,mappings={}}={}){
  const mappedProducts=Boolean(mappings.barcodeEntity&&mappings.productEntity);
  const readAdapter=label=>connected?state('CONNECTED',`${label} · backend D365 connecté`,'ok'):state('READY',`${label} · connexion backend requise`,'warn');
  return [
    {key:'product',domain:'Article / EAN',storeops:state('READY','Prêt','ok'),read:mappedProducts?readAdapter('Mapping article/EAN configuré'):state('MAPPING','Adapter prêt · entités à configurer','warn'),write:state('NA','Non nécessaire'),pilot:'Identification article, scan et saisie manuelle.'},
    {key:'stock',domain:'Stock magasin',storeops:state('READY','Prêt','ok'),read:readAdapter('Adapter stock magasin prêt'),write:state('MAPPING','Ajustement inventaire à mapper','warn'),pilot:'Lecture stock pour ruptures/comptage ; write désactivé.'},
    {key:'pricing',domain:'Prix & promotions',storeops:state('READY','Prêt','ok'),read:readAdapter('Prix de base + promotions prêts'),write:state('NA','Non nécessaire'),pilot:'Contrôle prix/promos depuis StoreOps.'},
    {key:'receiving',domain:'Réception / PO',storeops:state('READY','Contrôle réception prêt','ok'),read:state('MAPPING','Source PO Dynamics à valider','warn'),write:state('MAPPING','Posting réception à mapper','warn'),pilot:'Réception utilisable dans StoreOps sans posting D365.'},
    {key:'inventory',domain:'Inventaire',storeops:state('READY','Comptage aveugle prêt','ok'),read:readAdapter('Stock théorique disponible côté moteur'),write:state('MAPPING','Journal ajustement à mapper','warn'),pilot:'Comptage/recomptage utilisable ; aucun write automatique.'},
    {key:'loss',domain:'Démarque & pertes',storeops:state('READY','Workflow prêt','ok'),read:state('NA','Non requis'),write:state('MAPPING','Journal mouvement/perte à mapper','warn'),pilot:'Traçabilité StoreOps complète, posting D365 désactivé.'},
    {key:'cash',domain:'Caisses / clôture',storeops:state('READY','Fallback manuel prêt','ok'),read:state('PILOT','Saisie Z/TPE pilote','neutral'),write:state('MAPPING','Clôture Dynamics à mapper','warn'),pilot:'La fermeture reste possible avec contrôle manuel obligatoire.'},
    {key:'staffing',domain:'Équipe',storeops:state('NATIVE','StoreOps pilote','ok'),read:state('LATER','Planning RH plus tard'),write:state('NA','Non requis'),pilot:'Ne bloque pas le lancement.'},
    {key:'cold',domain:'Froid / qualité / incidents',storeops:state('NATIVE','StoreOps natif','ok'),read:state('NA','Non requis'),write:state('NA','Non requis'),pilot:'Opérationnel indépendamment de Dynamics.'}
  ];
}

export function dataProvenance({connected=false,mode='SIMULATED'}={}){
  const live=connected&&String(mode).toUpperCase()==='LIVE';
  const dyn=domain=>({key:domain,source:live?'Dynamics 365 F&O':'Moteur Dynamics simulé',status:live?'LIVE':'SIMULATION',tone:live?'ok':'warn'});
  return [
    {key:'identity',domain:'Identité & droits',source:'Microsoft Entra + StoreOps',status:'RÉEL',tone:'ok',note:'Compte authentifié et rôle imposé côté backend.'},
    {key:'stores',domain:'Magasins & périmètres',source:'Base StoreOps',status:'CONFIGURÉ',tone:'ok',note:'Liste magasin pilotée par StoreOps, pas synchronisée depuis D365.'},
    {...dyn('product'),domain:'Article / EAN',note:live?'Lecture F&O active.':'Les articles affichés ne doivent pas être considérés comme une lecture F&O live.'},
    {...dyn('stock'),domain:'Stock magasin',note:live?'Lecture stock F&O active.':'Stock Dynamics encore simulé sur ce déploiement.'},
    {...dyn('pricing'),domain:'Prix & promotions',note:live?'Prix et promotions lus depuis F&O.':'Prix/promotions Dynamics encore simulés sur ce déploiement.'},
    {key:'ops',domain:'Ouverture, contrôles, incidents, passation',source:'Base StoreOps persistante',status:'STOREOPS',tone:'ok',note:'Les validations réellement saisies sont conservées ; leur exactitude dépend des saisies terrain.'},
    {key:'staffing',domain:'Équipe / prise de poste',source:'StoreOps',status:'STOREOPS',tone:'ok',note:'Source pilote StoreOps ; planning RH externe non branché.'},
    {key:'cash',domain:'Caisses ouverture / clôture',source:'StoreOps',status:'PILOTE',tone:'neutral',note:'Ouverture et fallback de clôture manuels ; D365 caisse non branché.'},
    {key:'writes',domain:'Réception / inventaire / démarque — écritures',source:'StoreOps uniquement',status:'D365 WRITE OFF',tone:'warn',note:'Aucun posting F&O réel n’est activé tant que chaque mapping write n’est pas validé.'}
  ];
}

export function readinessCounts(rows=[]){
  return {
    ready:rows.filter(r=>['READY','NATIVE'].includes(r.storeops?.code)).length,
    readMapping:rows.filter(r=>r.read?.code==='MAPPING').length,
    writeMapping:rows.filter(r=>r.write?.code==='MAPPING').length
  };
}
