import {config} from '../config.mjs';
import {analyticsCacheKey,readAnalyticsCache} from './analytics-persistent-cache.mjs';
const num=v=>v==null||v===''||!Number.isFinite(Number(v))?null:Number(v);
export async function articleBusinessContext(product,stores,{read=readAnalyticsCache,today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Africa/Casablanca'}).format(new Date())}={}){
 const tasks=[],stock=[],pricing=[],coverage=[];
 for(const s of stores){
  const u=await read(analyticsCacheKey('detention-universe-v3',[s.id])),row=u?.rows?.find(r=>r.productNumber===product.productNumber),complete=u?.stockComplete===true&&u?.supplyComplete===true&&!!row;
  if(u?.stockComplete!==true||u?.supplyComplete!==true)tasks.push({kind:'stock',storeId:s.id});
  stock.push({storeId:s.id,storeName:s.name,complete,quantity:row?num(row.storeAvailable):null,warehouseQuantity:row?num(row.warehouseAvailable):null,stockReadAt:u?.stockReadAt||null,warehouseReadAt:u?.warehouseReadAt||null,unit:product.inventoryUnit||null,replenishable:row?.storeAvailable===0&&row?.warehouseAvailable>0,department:product.hierarchy?.department?.label||null});
  const p=await read(analyticsCacheKey('pricing-context-v1',[config.dynamics.dataAreaId,s.id,product.productNumber,today]));
  if(!p)tasks.push({kind:'pricing',storeId:s.id,productNumber:product.productNumber,date:today});
  pricing.push(p?{storeId:s.id,storeName:s.name,businessDate:p.businessDate,checkedAt:p.checkedAt,status:p.status,master:p.master,indicativeEffectivePrice:p.indicativeEffectivePrice,tradeStatus:p.tradeAgreements?.applicability?.status||null,activePromotions:p.promotions?.activeCount??null,priceUnit:p.priceUnit||null,currency:p.currency||'MAD',issues:p.issues||[]}: {storeId:s.id,storeName:s.name,status:'MISSING'});
 }
 const scope=stores.map(s=>s.id).sort().join(','),sup=await read(analyticsCacheKey('suppliers-ops-v1',[scope,today]));
 if(product.primaryVendorAccount&&!sup)tasks.push({kind:'suppliers',storeIds:stores.map(s=>s.id),date:today});
 const supplier=sup?.items?.find(v=>v.vendorAccount===product.primaryVendorAccount)||null;
 coverage.push({domain:'Stock et détention article',status:stock.every(s=>s.complete)?'READ':'PARTIAL',basis:'Image actuelle par magasin et entrepôt ; ne prouve pas les ruptures historiques.'},{domain:'Prix configurés et promotions',status:pricing.every(p=>p.status==='READY')?'READ':'PARTIAL',basis:'Tarifs/accords/offres au contexte courant ; les prix passés sont mesurés sur tickets.'},{domain:'Fournisseur',status:supplier?'READ':product.primaryVendorAccount?'PARTIAL':'MISSING',basis:'Commandes ouvertes et lignes contrôlées, non une attribution causale de disponibilité.'});
 return{stock,pricing,supplier:supplier?{vendorAccount:supplier.vendorAccount,vendorName:supplier.vendorName,openPoCount:supplier.openPoCount,openLines:supplier.openLines,serviceRate90d:supplier.serviceRate90d,serviceCoverageLines:supplier.serviceCoverageLines}:null,primaryVendorAccount:product.primaryVendorAccount||null,vendorName:product.vendorName||null,coverage,tasks,checkedAt:new Date().toISOString()};
}
export function renderArticleBusinessContext(context,focus='all'){
 if(!context)return 'Les sources complémentaires n’ont pas été lues : aucune disponibilité ni performance fournisseur n’est présumée.';
 const n=v=>v==null?'non disponible':new Intl.NumberFormat('fr-FR',{maximumFractionDigits:2}).format(v),lines=[];
 for(const s of focus==='all'||focus==='stock'?context.stock:[])lines.push(`${s.storeName} : stock magasin ${n(s.quantity)} ${s.unit||'(unité à qualifier)'}, entrepôt ${n(s.warehouseQuantity)} ; image ${s.stockReadAt||'non datée'}${s.replenishable?' · réapprovisionnement possible depuis l’entrepôt':''}. ${s.complete?'Image actuelle complète.':'Lecture stock incomplète.'}`);
 for(const p of focus==='all'||focus==='pricing'?context.pricing:[])lines.push(`${p.storeName} : tarif configuré au ${p.businessDate||'jour courant'} ${n(p.indicativeEffectivePrice)} ${p.currency||'MAD'} / ${p.priceUnit||'unité à qualifier'} ; accords ${p.tradeStatus||'non lus'}, ${n(p.activePromotions)} promotions actives. ${(p.issues||[]).join(' ')}`);
 const v=context.supplier;if(focus==='all'||focus==='supplier')lines.push(v?`Fournisseur ${v.vendorName||v.vendorAccount} : ${n(v.openPoCount)} commandes ouvertes, ${n(v.openLines)} lignes, service contrôlé 90j ${n(v.serviceRate90d)} % (${n(v.serviceCoverageLines)} lignes de couverture).`:`Fournisseur principal ${context.vendorName||context.primaryVendorAccount||'non renseigné'} : performance de livraison non disponible dans les preuves lues.`);
 lines.push('Couverture : '+context.coverage.map(c=>`${c.domain} : ${c.status}`).join(' · ')+'. Stock actuel, pas un historique de rupture ; commandes ouvertes, pas une preuve de retard ni de responsabilité fournisseur.');
 return lines.join('\n');
}
