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

export function readinessCounts(rows=[]){
  return {
    ready:rows.filter(r=>['READY','NATIVE'].includes(r.storeops?.code)).length,
    readMapping:rows.filter(r=>r.read?.code==='MAPPING').length,
    writeMapping:rows.filter(r=>r.write?.code==='MAPPING').length
  };
}
