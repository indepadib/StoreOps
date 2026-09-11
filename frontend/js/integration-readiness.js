const state=(code,label,tone='neutral')=>({code,label,tone});
const storeops=label=>state('STOREOPS',label||'StoreOps','ok');
const mapped=label=>state('MAPPING',label||'À mapper','warn');
const simulated=label=>state('SIMULATED',label||'Simulé','neutral');
const live=label=>state('LIVE',label||'LIVE Dynamics','ok');
const na=label=>state('NA',label||'Non requis','neutral');

export function integrationReadiness({connected=false,mappings={},readModes={}}={}){
  const read=(domain,ready=true)=>readModes?.[domain]==='live'&&connected&&ready?live('LIVE Dynamics'):readModes?.[domain]==='live'&&!connected?state('LIVE_PENDING','LIVE demandé · connexion NOK','danger'):readModes?.[domain]==='live'&&!ready?mapped('LIVE demandé · mapping incomplet'):simulated('Simulé / désactivé');
  const productReady=Boolean(mappings.barcodeEntity),stockReady=Boolean(mappings.stockEntity),priceReady=Boolean(mappings.basePriceEntity),promoReady=Boolean(mappings.retailDiscountEntity&&mappings.retailDiscountLineEntity),receivingReady=Boolean(mappings.purchaseOrderHeaderEntity&&mappings.purchaseOrderLineEntity);
  const assortmentReady=Boolean(mappings.assortmentEntity),taxonomyReady=Boolean(mappings.categoryEntity&&mappings.productCategoryAssignmentEntity),salesReady=Boolean(mappings.salesEntity),supplyReady=Boolean(Object.keys(mappings.storeSupplyWarehouses||{}).length),batchReady=Boolean(mappings.stockBatchField);
  return [
    {key:'product',domain:'Article / EAN',storeops:storeops('StoreOps'),read:productReady?read('product',true):mapped('EAN à mapper'),write:na('Non requis'),pilot:'Scan article et enrichissement catalogue.'},
    {key:'assortment',domain:'Assortiment magasin',storeops:storeops('Kernel StoreOps'),read:assortmentReady?read('assortment',true):mapped('Entité assortiment × canal à mapper'),write:na('Non requis'),pilot:'Condition obligatoire pour calculer une vraie rupture magasin.'},
    {key:'taxonomy',domain:'Catégories / familles',storeops:storeops('Kernel StoreOps'),read:taxonomyReady?read('taxonomy',true):mapped('Hiérarchie / affectations à valider'),write:na('Non requis'),pilot:'Drill-down rayon/catégorie/famille et contexte article.'},
    {key:'stock',domain:'Stock magasin',storeops:storeops('StoreOps'),read:stockReady?read('stock',true):mapped('Stock à mapper'),write:mapped('Write bloqué'),pilot:'Toutes les lignes de dimensions sont agrégées ; inventaire/ruptures utilisent le disponible.'},
    {key:'batch',domain:'Lots / emplacements',storeops:storeops('Détail progressif'),read:batchReady?read('stock',true):mapped('Champ batch facultatif à mapper'),write:na('Non requis'),pilot:'Le total stock n’en dépend pas ; le détail lot/location apparaît seulement si mappé.'},
    {key:'supply',domain:'Stock entrepôt source',storeops:storeops('Assistant réappro'),read:supplyReady?read('stock',true):mapped('Warehouse source par magasin à mapper'),write:na('Lecture uniquement'),pilot:'Permet de distinguer besoin magasin, rupture entrepôt et transfert partiel.'},
    {key:'pricing',domain:'Prix de base',storeops:storeops('StoreOps'),read:priceReady?read('price',true):mapped('Prix à mapper'),write:na('Non requis'),pilot:'Prix fiche article.'},
    {key:'promotion',domain:'Promotions retail',storeops:storeops('StoreOps'),read:promoReady?read('promotion',true):mapped('Promo à mapper'),write:na('Non requis'),pilot:'Promos retail, dépliants et Mix & Match.'},
    {key:'sales',domain:'Ventes / Business Pulse',storeops:storeops('Business Pulse'),read:salesReady?read('sales',true):mapped('Flux ventes / magasin à valider'),write:na('Non requis'),pilot:'CA, tickets, panier, mix et vélocité article ; marge uniquement si coût disponible.'},
    {key:'receiving',domain:'Réception / PO',storeops:storeops('StoreOps'),read:receivingReady?read('receiving',true):mapped('PO à mapper / auditer'),write:mapped('Write bloqué'),pilot:'Commandes attendues et contrôles qualité ; aucun posting ERP automatique.'},
    {key:'inventory',domain:'Inventaire',storeops:storeops('StoreOps'),read:readModes?.stock==='live'&&connected?live('LIVE via stock'):simulated('Stock non LIVE'),write:mapped('Write bloqué'),pilot:'Comptage aveugle + recomptage ; export/write à valider par connecteur.'},
    {key:'loss',domain:'Démarque & pertes',storeops:storeops('StoreOps + Closing Pack'),read:na('Natif StoreOps'),write:mapped('API write bloquée'),pilot:'Saisie obligatoire ; fichier ERP configurable puis confirmation d’import auditée.'},
    {key:'cash',domain:'Caisses / clôture',storeops:storeops('StoreOps'),read:mapped('Connecteur caisse à qualifier'),write:mapped('Write bloqué'),pilot:'Rapprochement StoreOps ; connecteur caisse futur.'},
    {key:'staffing',domain:'Équipe',storeops:storeops('StoreOps'),read:na('Natif StoreOps'),write:na('Natif StoreOps'),pilot:'Employés, contrats, shifts et objectifs indépendants de l’ERP.'},
    {key:'cold',domain:'Froid / qualité / incidents',storeops:storeops('StoreOps'),read:na('Natif StoreOps'),write:na('Natif StoreOps'),pilot:'Process et preuves natifs StoreOps.'}
  ];
}

export function readinessCounts(rows=[]){return{ready:rows.filter(r=>r.storeops?.code==='STOREOPS').length,liveReads:rows.filter(r=>r.read?.code==='LIVE').length,simulatedReads:rows.filter(r=>r.read?.code==='SIMULATED').length,readMapping:rows.filter(r=>r.read?.code==='MAPPING').length,writeMapping:rows.filter(r=>r.write?.code==='MAPPING').length};}
