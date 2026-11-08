import {readStoreSalesRange,readStoreBasketEvidence} from './dynamics-sales.mjs';
import {readAnalyticsCatalog} from './analytics-catalog.mjs';

const n=v=>{const x=Number(v);return Number.isFinite(x)?x:0};
const clean=v=>String(v??'').trim();
const round2=v=>Math.round((n(v)+Number.EPSILON)*100)/100;
const pct=(a,b)=>b?round2(n(a)/n(b)*100):null;
const growth=(a,b)=>n(b)!==0?round2((n(a)-n(b))/Math.abs(n(b))*100):null;

function daysBetween(start,end){
 const a=Date.parse(start+'T00:00:00Z'),b=Date.parse(end+'T00:00:00Z');
 return Number.isFinite(a)&&Number.isFinite(b)&&b>=a?Math.floor((b-a)/86400000)+1:null;
}
function shiftYear(iso,delta=-1){
 const m=String(iso||'').match(/^(\d{4})-(\d{2})-(\d{2})$/);if(!m)return null;
 const year=Number(m[1])+delta,month=Number(m[2]),day=Number(m[3]),max=new Date(Date.UTC(year,month,0)).getUTCDate();
 return String(year).padStart(4,'0')+'-'+String(month).padStart(2,'0')+'-'+String(Math.min(day,max)).padStart(2,'0');
}
export function previousYearPeriod(startDate,endDate){return{startDate:shiftYear(startDate,-1),endDate:shiftYear(endDate,-1)}}

function quantityMap(row={}){
 const out=new Map(),raw=row.quantityByUnit&&typeof row.quantityByUnit==='object'?Object.entries(row.quantityByUnit):row.quantityUnit?[[row.quantityUnit,row.units]]:[];
 for(const [u,v] of raw){const key=clean(u).toUpperCase();if(key)out.set(key,(out.get(key)||0)+n(v))}
 return out
}
function mergeQuantity(target,source){for(const [u,v] of source||[])target.set(u,(target.get(u)||0)+n(v))}
function singleQuantity(q){
 const rows=[...(q||new Map()).entries()].filter(([,v])=>n(v)!==0);
 return rows.length===1?{unit:rows[0][0],units:round2(rows[0][1])}:{unit:null,units:null}
}
function combineRanges(ranges=[]){
 const usable=ranges.filter(Boolean),products=new Map();let sales=0,tickets=0,units=0;
 for(const range of usable){
  sales+=n(range.summary?.sales);tickets+=n(range.summary?.tickets);units+=n(range.summary?.units);
  for(const p of range.products||[]){
   const key=clean(p.key);if(!key)continue;
   const cur=products.get(key)||{key,label:p.label||key,sales:0,units:0,quantityByUnit:new Map()};
   cur.sales+=n(p.sales);cur.units+=n(p.units);mergeQuantity(cur.quantityByUnit,quantityMap(p));if((!cur.label||cur.label===key)&&p.label)cur.label=p.label;products.set(key,cur)
  }
 }
 const rows=[...products.values()].map(p=>{const q=singleQuantity(p.quantityByUnit);return{key:p.key,label:p.label,sales:round2(p.sales),units:round2(p.units),quantityUnit:q.unit,quantityByUnit:Object.fromEntries([...p.quantityByUnit].map(([u,v])=>[u,round2(v)]))}}).sort((a,b)=>b.sales-a.sales);
 const statuses=usable.map(x=>x.status),status=!usable.length?'UNAVAILABLE':statuses.every(x=>x==='READY')?'READY':statuses.some(x=>x==='TRUNCATED')?'TRUNCATED':'PARTIAL';
 return{status,summary:{sales:round2(sales),tickets:Math.round(tickets),units:round2(units)},products:rows}
}
function combineEvidence(parts=[]){
 const valid=parts.filter(x=>x&&Array.isArray(x.baskets));
 if(!valid.length)return null;
 return{baskets:valid.flatMap(x=>x.baskets||[]),rejectedIdentity:valid.reduce((s,x)=>s+n(x.rejectedIdentity),0)}
}
function basketStats(evidence){
 if(!evidence||!Array.isArray(evidence.baskets))return{ready:false,totalTickets:null,products:new Map()};
 const products=new Map(),ticketCounts=new Map(),pairCounts=new Map();
 for(const basket of evidence.baskets){
  const bySku=new Map();let basketSales=0;
  for(const item of basket.items||[]){
   const sku=clean(item.productNumber);if(!sku)continue;
   const cur=bySku.get(sku)||{sales:0,units:0,promotionSales:0,discountAmount:0,unitsByUnit:new Map()};
   cur.sales+=n(item.sales);cur.units+=n(item.units);cur.promotionSales+=n(item.promotionSales);cur.discountAmount+=n(item.discountAmount);
   const unit=clean(item.unit).toUpperCase();if(unit)cur.unitsByUnit.set(unit,(cur.unitsByUnit.get(unit)||0)+n(item.units));
   bySku.set(sku,cur);basketSales+=n(item.sales)
  }
  const skus=[...bySku.keys()];
  for(const sku of skus){
   const item=bySku.get(sku),cur=products.get(sku)||{tickets:0,basketSales:0,otherSales:0,productSales:0,promotionSales:0,discountAmount:0,unitsByUnit:new Map(),dates:new Set()};
   cur.tickets++;cur.basketSales+=basketSales;cur.otherSales+=basketSales-item.sales;cur.productSales+=item.sales;cur.promotionSales+=item.promotionSales;cur.discountAmount+=item.discountAmount;
   mergeQuantity(cur.unitsByUnit,item.unitsByUnit);if(basket.date)cur.dates.add(basket.date);products.set(sku,cur);ticketCounts.set(sku,(ticketCounts.get(sku)||0)+1)
  }
  const capped=skus.slice(0,60);
  for(let i=0;i<capped.length;i++)for(let j=i+1;j<capped.length;j++){
   const a=capped[i],b=capped[j],key=a<b?a+'|'+b:b+'|'+a;pairCounts.set(key,(pairCounts.get(key)||0)+1)
  }
 }
 const totalTickets=evidence.baskets.length;
 for(const [sku,cur] of products){
  let best=null;
  for(const [key,count] of pairCounts){
   const [a,b]=key.split('|');if(a!==sku&&b!==sku)continue;
   const other=a===sku?b:a,otherTickets=ticketCounts.get(other)||0,lift=cur.tickets&&otherTickets&&totalTickets?round2(count*totalTickets/(cur.tickets*otherTickets)):null;
   const candidate={productNumber:other,tickets:count,sharePct:pct(count,cur.tickets),lift};
   if(!best||candidate.tickets>best.tickets||candidate.tickets===best.tickets&&n(candidate.lift)>n(best.lift))best=candidate
  }
  const q=singleQuantity(cur.unitsByUnit);
  cur.result={
   tickets:cur.tickets,
   penetrationPct:pct(cur.tickets,totalTickets),
   averageBasket:cur.tickets?round2(cur.basketSales/cur.tickets):null,
   averageOtherSales:cur.tickets?round2(cur.otherSales/cur.tickets):null,
   averageProductSales:cur.tickets?round2(cur.productSales/cur.tickets):null,
   activeDays:cur.dates.size,
   ticketsPerActiveDay:cur.dates.size?round2(cur.tickets/cur.dates.size):null,
   units:q.units,
   unit:q.unit,
   unitsPerContainingTicket:q.units!=null&&cur.tickets?round2(q.units/cur.tickets):null,
   promotionSales:round2(cur.promotionSales),
   promotionSalesSharePct:cur.productSales?pct(cur.promotionSales,cur.productSales):null,
   discountAmount:round2(cur.discountAmount),
   topAssociation:best
  }
 }
 return{ready:true,totalTickets,products:new Map([...products].map(([k,v])=>[k,v.result]))}
}
function catalogMap(items=[]){return new Map((items||[]).map(x=>[clean(x.productNumber),x]))}
function node(catalog,level){return catalog?.hierarchy?.[level]||{}}
function productStatus(cur,prev){
 const c=n(cur?.sales),p=n(prev?.sales);if(c>0&&p===0)return'NEW_VS_N1';if(c===0&&p>0)return'LOST_VS_N1';
 const g=growth(c,p);if(g==null)return'STABLE';if(g>=10)return'GROWTH';if(g<=-10)return'DECLINE';return'STABLE'
}
function rankMap(rows=[]){return new Map([...rows].sort((a,b)=>n(b.sales)-n(a.sales)||clean(a.key).localeCompare(clean(b.key),'fr')).map((x,i)=>[clean(x.key),i+1]))}

function buildScopeRows({scopeType,storeId=null,storeName,storeCode=null,current,previous,currentEvidence,previousEvidence,catalog,currentPeriod,previousPeriod}){
 const cm=new Map((current.products||[]).map(x=>[clean(x.key),x])),pm=new Map((previous.products||[]).map(x=>[clean(x.key),x])),keys=[...new Set([...cm.keys(),...pm.keys()])];
 const cb=basketStats(currentEvidence),pb=basketStats(previousEvidence),cr=rankMap(current.products||[]),pr=rankMap(previous.products||[]);
 const totalCurrent=n(current.summary?.sales),totalPrevious=n(previous.summary?.sales);
 return keys.map(productNumber=>{
  const c=cm.get(productNumber)||{},p=pm.get(productNumber)||{},cat=catalog.get(productNumber)||{},bc=cb.products.get(productNumber)||{},bp=pb.products.get(productNumber)||{};
  const cq=singleQuantity(quantityMap(c)),pq=singleQuantity(quantityMap(p)),sameUnit=!!cq.unit&&cq.unit===pq.unit,avgPriceC=cq.units>0?round2(n(c.sales)/cq.units):null,avgPriceP=pq.units>0?round2(n(p.sales)/pq.units):null;
  const assocC=bc.topAssociation||{},assocP=bp.topAssociation||{},assocCatC=catalog.get(assocC.productNumber)||{},assocCatP=catalog.get(assocP.productNumber)||{};
  return{
   scope_type:scopeType,store_id:storeId||'',store_code:storeCode||'',store_name:storeName,
   period_start:currentPeriod.startDate,period_end:currentPeriod.endDate,n1_start:previousPeriod.startDate,n1_end:previousPeriod.endDate,
   product_number:productNumber,product_name:cat.productName||c.label||p.label||productNumber,
   hierarchy_status:cat.hierarchyStatus||'MISSING',
   department_code:node(cat,'department').id||'',department:node(cat,'department').label||'',
   rayon_code:node(cat,'rayon').id||cat.rayonCode||'',rayon:node(cat,'rayon').label||cat.rayonLabel||'',
   family_code:node(cat,'family').id||'',family:node(cat,'family').label||'',
   subfamily_code:node(cat,'subfamily').id||'',subfamily:node(cat,'subfamily').label||'',
   subsubfamily_code:node(cat,'subsubfamily').id||'',subsubfamily:node(cat,'subsubfamily').label||'',
   ub_code:node(cat,'ub').id||cat.ub||'',ub:node(cat,'ub').label||'',
   retail_scope:cat.retailScope||'',vendor_account:cat.primaryVendorAccount||'',vendor_name:cat.vendorName||'',supply_mode:cat.supplyMode||'',
   sales_unit:cat.salesUnit||cq.unit||pq.unit||'',inventory_unit:cat.inventoryUnit||'',purchase_unit:cat.purchaseUnit||'',
   status_vs_n1:productStatus(c,p),
   ca_n:round2(c.sales),ca_n1:round2(p.sales),ca_delta:round2(n(c.sales)-n(p.sales)),ca_evolution_pct:growth(c.sales,p.sales),
   ca_weight_pct:pct(c.sales,totalCurrent),ca_weight_n1_pct:pct(p.sales,totalPrevious),ca_weight_delta_points:totalCurrent&&totalPrevious?round2(pct(c.sales,totalCurrent)-pct(p.sales,totalPrevious)):null,
   rank_ca_n:cr.get(productNumber)||null,rank_ca_n1:pr.get(productNumber)||null,rank_delta:cr.get(productNumber)&&pr.get(productNumber)?pr.get(productNumber)-cr.get(productNumber):null,
   quantity_n:cq.units??round2(c.units),quantity_n1:pq.units??round2(p.units),quantity_unit:cq.unit||pq.unit||'',
   quantity_delta:sameUnit?round2(cq.units-pq.units):null,quantity_evolution_pct:sameUnit?growth(cq.units,pq.units):null,
   realized_price_n:avgPriceC,realized_price_n1:avgPriceP,realized_price_evolution_pct:avgPriceC!=null&&avgPriceP!=null?growth(avgPriceC,avgPriceP):null,
   tickets_scope_n:cb.totalTickets,tickets_scope_n1:pb.totalTickets,
   tickets_with_product_n:bc.tickets??null,tickets_with_product_n1:bp.tickets??null,tickets_with_product_evolution_pct:bc.tickets!=null&&bp.tickets!=null?growth(bc.tickets,bp.tickets):null,
   basket_penetration_pct:bc.penetrationPct??null,basket_penetration_n1_pct:bp.penetrationPct??null,basket_penetration_delta_points:bc.penetrationPct!=null&&bp.penetrationPct!=null?round2(bc.penetrationPct-bp.penetrationPct):null,
   average_basket_with_product:bc.averageBasket??null,average_basket_with_product_n1:bp.averageBasket??null,average_basket_evolution_pct:bc.averageBasket!=null&&bp.averageBasket!=null?growth(bc.averageBasket,bp.averageBasket):null,
   average_other_items_value_same_basket:bc.averageOtherSales??null,average_other_items_value_same_basket_n1:bp.averageOtherSales??null,
   product_sales_per_containing_ticket:bc.averageProductSales??null,product_sales_per_containing_ticket_n1:bp.averageProductSales??null,
   active_sales_days:bc.activeDays??null,active_sales_days_n1:bp.activeDays??null,tickets_per_active_day:bc.ticketsPerActiveDay??null,tickets_per_active_day_n1:bp.ticketsPerActiveDay??null,
   units_per_containing_ticket:bc.unitsPerContainingTicket??null,units_per_containing_ticket_n1:bp.unitsPerContainingTicket??null,
   promotion_sales:bc.promotionSales??null,promotion_sales_n1:bp.promotionSales??null,promotion_sales_share_pct:bc.promotionSalesSharePct??null,promotion_sales_share_n1_pct:bp.promotionSalesSharePct??null,
   discount_amount:bc.discountAmount??null,discount_amount_n1:bp.discountAmount??null,
   top_associated_product:assocC.productNumber||'',top_associated_product_name:assocCatC.productName||'',top_association_tickets:assocC.tickets??null,top_association_share_pct:assocC.sharePct??null,top_association_lift:assocC.lift??null,
   top_associated_product_n1:assocP.productNumber||'',top_associated_product_n1_name:assocCatP.productName||'',top_association_n1_tickets:assocP.tickets??null,top_association_n1_share_pct:assocP.sharePct??null,top_association_n1_lift:assocP.lift??null,
   sales_source_status_n:current.status||'UNAVAILABLE',sales_source_status_n1:previous.status||'UNAVAILABLE',basket_source_status_n:cb.ready?'READY':'UNAVAILABLE',basket_source_status_n1:pb.ready?'READY':'UNAVAILABLE'
  }
 }).sort((a,b)=>n(b.ca_n)-n(a.ca_n)||clean(a.product_number).localeCompare(clean(b.product_number),'fr'))
}

export const MONTHLY_EXPORT_COLUMNS=[
 ['scope_type','Périmètre'],['store_id','ID magasin'],['store_code','Code magasin'],['store_name','Magasin'],
 ['period_start','Début N'],['period_end','Fin N'],['n1_start','Début N-1'],['n1_end','Fin N-1'],
 ['product_number','Code article'],['product_name','Libellé article'],['hierarchy_status','Qualité hiérarchie'],
 ['department_code','Code département'],['department','Département'],['rayon_code','Code rayon'],['rayon','Rayon'],['family_code','Code famille'],['family','Famille'],['subfamily_code','Code sous-famille'],['subfamily','Sous-famille'],['subsubfamily_code','Code sous-sous-famille'],['subsubfamily','Sous-sous-famille'],['ub_code','Code UB'],['ub','UB'],
 ['retail_scope','Scope retail'],['vendor_account','Compte fournisseur'],['vendor_name','Fournisseur'],['supply_mode','Mode appro'],['sales_unit','Unité vente'],['inventory_unit','Unité stock'],['purchase_unit','Unité achat'],['status_vs_n1','Statut vs N-1'],
 ['ca_n','CA N TTC'],['ca_n1','CA N-1 TTC'],['ca_delta','Écart CA'],['ca_evolution_pct','Évolution CA %'],['ca_weight_pct','Poids CA %'],['ca_weight_n1_pct','Poids CA N-1 %'],['ca_weight_delta_points','Écart poids CA pts'],
 ['rank_ca_n','Rang CA N'],['rank_ca_n1','Rang CA N-1'],['rank_delta','Gain/perte rang'],
 ['quantity_n','Quantité N'],['quantity_n1','Quantité N-1'],['quantity_unit','Unité quantité'],['quantity_delta','Écart quantité'],['quantity_evolution_pct','Évolution quantité %'],
 ['realized_price_n','Prix moyen réalisé N'],['realized_price_n1','Prix moyen réalisé N-1'],['realized_price_evolution_pct','Évolution prix moyen %'],
 ['tickets_scope_n','Tickets périmètre N'],['tickets_scope_n1','Tickets périmètre N-1'],['tickets_with_product_n','Tickets avec article N'],['tickets_with_product_n1','Tickets avec article N-1'],['tickets_with_product_evolution_pct','Évolution tickets article %'],
 ['basket_penetration_pct','Présence panier %'],['basket_penetration_n1_pct','Présence panier N-1 %'],['basket_penetration_delta_points','Écart présence panier pts'],
 ['average_basket_with_product','Panier moyen avec article'],['average_basket_with_product_n1','Panier moyen avec article N-1'],['average_basket_evolution_pct','Évolution panier avec article %'],
 ['average_other_items_value_same_basket','Valeur autres articles du panier'],['average_other_items_value_same_basket_n1','Valeur autres articles du panier N-1'],
 ['product_sales_per_containing_ticket','CA article / panier contenant'],['product_sales_per_containing_ticket_n1','CA article / panier contenant N-1'],
 ['active_sales_days','Jours actifs N'],['active_sales_days_n1','Jours actifs N-1'],['tickets_per_active_day','Tickets/jour actif N'],['tickets_per_active_day_n1','Tickets/jour actif N-1'],
 ['units_per_containing_ticket','Qté/panier contenant N'],['units_per_containing_ticket_n1','Qté/panier contenant N-1'],
 ['promotion_sales','CA promo N'],['promotion_sales_n1','CA promo N-1'],['promotion_sales_share_pct','Poids promo N %'],['promotion_sales_share_n1_pct','Poids promo N-1 %'],['discount_amount','Remises N'],['discount_amount_n1','Remises N-1'],
 ['top_associated_product','Article associé #1'],['top_associated_product_name','Libellé associé #1'],['top_association_tickets','Tickets communs #1'],['top_association_share_pct','Présence associé dans paniers article %'],['top_association_lift','Lift association'],
 ['top_associated_product_n1','Article associé #1 N-1'],['top_associated_product_n1_name','Libellé associé #1 N-1'],['top_association_n1_tickets','Tickets communs #1 N-1'],['top_association_n1_share_pct','Présence associé N-1 %'],['top_association_n1_lift','Lift association N-1'],
 ['sales_source_status_n','Qualité ventes N'],['sales_source_status_n1','Qualité ventes N-1'],['basket_source_status_n','Qualité paniers N'],['basket_source_status_n1','Qualité paniers N-1']
].map(([key,label])=>({key,label}));

async function catalogForProducts(products=[]){
 const keys=[...new Set(products.map(clean).filter(Boolean))],items=[];
 for(let i=0;i<keys.length;i+=200){const part=await readAnalyticsCatalog(keys.slice(i,i+200));items.push(...(part.items||[]))}
 return items
}
export async function readMonthlySalesExport(stores=[],{startDate,endDate,force=false}={}){
 const days=daysBetween(startDate,endDate);
 if(!days||days<1||days>31)throw Object.assign(new Error('Export mensuel : sélectionne une période de 1 à 31 jours.'),{status:400,code:'MONTHLY_EXPORT_RANGE'});
 const previousPeriod=previousYearPeriod(startDate,endDate),currentPeriod={startDate,endDate},storeResults=[];
 for(const store of stores){
  const [current,previous]=await Promise.all([
   readStoreSalesRange(store.id,{startDate,endDate,force}),
   readStoreSalesRange(store.id,{startDate:previousPeriod.startDate,endDate:previousPeriod.endDate,force})
  ]);
  let currentEvidence=null,previousEvidence=null;
  if(current.status==='READY')try{currentEvidence=await readStoreBasketEvidence(store.id,{startDate,endDate,force:false})}catch{}
  if(previous.status==='READY')try{previousEvidence=await readStoreBasketEvidence(store.id,{startDate:previousPeriod.startDate,endDate:previousPeriod.endDate,force:false})}catch{}
  storeResults.push({store,current,previous,currentEvidence,previousEvidence})
 }
 const products=storeResults.flatMap(x=>[...(x.current.products||[]),...(x.previous.products||[])]).map(x=>x.key),catalogItems=await catalogForProducts(products),catalog=catalogMap(catalogItems);
 const networkCurrent=combineRanges(storeResults.map(x=>x.current)),networkPrevious=combineRanges(storeResults.map(x=>x.previous)),networkCurrentEvidence=combineEvidence(storeResults.map(x=>x.currentEvidence)),networkPreviousEvidence=combineEvidence(storeResults.map(x=>x.previousEvidence));
 const networkRows=buildScopeRows({scopeType:'NETWORK',storeName:'Réseau sélectionné',current:networkCurrent,previous:networkPrevious,currentEvidence:networkCurrentEvidence,previousEvidence:networkPreviousEvidence,catalog,currentPeriod,previousPeriod});
 const storeRows=storeResults.flatMap(x=>buildScopeRows({scopeType:'STORE',storeId:x.store.id,storeName:x.store.name,storeCode:x.store.code,current:x.current,previous:x.previous,currentEvidence:x.currentEvidence,previousEvidence:x.previousEvidence,catalog,currentPeriod,previousPeriod}));
 return{
  status:storeResults.every(x=>x.current.status==='READY'&&x.previous.status==='READY')?'READY':'PARTIAL',
  period:currentPeriod,comparison:{...previousPeriod,type:'PREVIOUS_YEAR'},stores:stores.map(s=>({id:s.id,name:s.name,code:s.code})),columns:MONTHLY_EXPORT_COLUMNS,rows:[...networkRows,...storeRows],
  summary:{stores:stores.length,networkProducts:networkRows.length,rows:networkRows.length+storeRows.length,currentSales:networkCurrent.summary.sales,previousSales:networkPrevious.summary.sales,currentTickets:networkCurrent.summary.tickets,previousTickets:networkPrevious.summary.tickets},
  diagnostics:{catalogProducts:catalogItems.length,basketCurrentReady:storeResults.filter(x=>!!x.currentEvidence).length,basketPreviousReady:storeResults.filter(x=>!!x.previousEvidence).length,checkedAt:new Date().toISOString()}
 }
}
