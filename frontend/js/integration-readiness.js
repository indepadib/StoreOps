const state=(code,label,tone='neutral')=>({code,label,tone});
const storeops=label=>state('STOREOPS',label||'StoreOps','ok');
const mapped=label=>state('MAPPING',label||'À mapper','warn');
const simulated=label=>state('SIMULATED',label||'Simulé','neutral');
const live=label=>state('LIVE',label||'LIVE Dynamics','ok');
const na=label=>state('NA',label||'Non requis','neutral');

export function integrationReadiness({connected=false,mappings={},readModes={}}={}){
  const read=(domain,ready=true)=>readModes?.[domain]==='live'&&connected&&ready?live('LIVE Dynamics'):readModes?.[domain]==='live'&&!connected?state('LIVE_PENDING','LIVE demandé · connexion NOK','danger'):simulated('Simulé');
  const productReady=Boolean(mappings.barcodeEntity);
  const stockReady=Boolean(mappings.stockEntity);
  const priceReady=Boolean(mappings.basePriceEntity);
  const promoReady=Boolean(mappings.retailDiscountEntity&&mappings.retailDiscountLineEntity);
  return [
    {key:'product',domain:'Article / EAN',storeops:storeops('StoreOps'),read:productReady?read('product',true):mapped('À mapper'),write:na('Non requis'),pilot:'Scan EAN / saisie manuelle ; enrichissement produit facultatif.'},
    {key:'stock',domain:'Stock magasin',storeops:storeops('StoreOps'),read:stockReady?read('stock',true):mapped('À mapper'),write:mapped('À mapper'),pilot:'READ stock pour comptage/ruptures ; ajustement D365 désactivé.'},
    {key:'pricing',domain:'Prix de base',storeops:storeops('StoreOps'),read:priceReady?read('price',true):mapped('À mapper'),write:na('Non requis'),pilot:'Prix fiche article Dynamics.'},
    {key:'promotion',domain:'Promotions retail',storeops:storeops('StoreOps'),read:promoReady?read('promotion',true):mapped('À mapper'),write:na('Non requis'),pilot:'Promos retail et mécanique Mix & Match.'},
    {key:'receiving',domain:'Réception / PO',storeops:storeops('StoreOps'),read:mapped('À mapper / auditer'),write:mapped('À mapper'),pilot:'Contrôle réception StoreOps utilisable ; aucun posting D365.'},
    {key:'inventory',domain:'Inventaire',storeops:storeops('StoreOps'),read:readModes?.stock==='live'&&connected?live('LIVE Dynamics via stock'):simulated('Simulé'),write:mapped('À mapper'),pilot:'Comptage aveugle + recomptage ; write bloqué.'},
    {key:'loss',domain:'Démarque & pertes',storeops:storeops('StoreOps'),read:na('Non requis'),write:mapped('À mapper'),pilot:'Traçabilité StoreOps ; posting D365 désactivé.'},
    {key:'cash',domain:'Caisses / clôture',storeops:storeops('StoreOps'),read:mapped('À mapper'),write:mapped('À mapper'),pilot:'Flux Dynamics caisse non qualifié LIVE.'},
    {key:'staffing',domain:'Équipe',storeops:storeops('StoreOps'),read:na('StoreOps'),write:na('Non requis'),pilot:'Source volontairement StoreOps.'},
    {key:'cold',domain:'Froid / qualité / incidents',storeops:storeops('StoreOps'),read:na('StoreOps'),write:na('Non requis'),pilot:'Natif StoreOps, indépendant de Dynamics.'}
  ];
}

export function readinessCounts(rows=[]){
  return {
    ready:rows.filter(r=>r.storeops?.code==='STOREOPS').length,
    liveReads:rows.filter(r=>r.read?.code==='LIVE').length,
    simulatedReads:rows.filter(r=>r.read?.code==='SIMULATED').length,
    readMapping:rows.filter(r=>r.read?.code==='MAPPING').length,
    writeMapping:rows.filter(r=>r.write?.code==='MAPPING').length
  };
}
