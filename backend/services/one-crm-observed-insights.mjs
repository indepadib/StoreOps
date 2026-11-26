import {summarizeObservedSales} from './one-crm-observed-sales.mjs';
const validProduct=v=>typeof v==='string'&&v.trim().length>0&&v.length<=160&&!/[\x00-\x1f]/.test(v);
const round=n=>Math.round(n*100)/100;
const unavailable=reason=>({status:'UNAVAILABLE',reason,activationEnabled:false});
const basis=(s,storeId,date)=>({status:'READY',storeId,date,source:s.source,basis:s.basis,checkedAt:s.checkedAt,currency:'MAD',activationEnabled:false});
export function projectObservedCustomers(evidence,{storeId,date,page}){
 const s=summarizeObservedSales(evidence,{storeId,date});if(s.status!=='READY')return s;
 const customers=new Map();
 for(const b of [...evidence.baskets].sort((a,b)=>a.key<b.key?-1:a.key>b.key?1:0)){
  if(!b.customerToken)continue;
  const c=customers.get(b.customerToken)||{ordinal:customers.size+1,tickets:0,positiveTtc:0,products:new Set()};
  c.tickets++;for(const i of b.items){if(!validProduct(i.productNumber))return unavailable('INVALID_PRODUCT');c.positiveTtc+=i.sales;c.products.add(i.productNumber)}
  customers.set(b.customerToken,c);
 }
 if(!Number.isSafeInteger(page)||page<1||page>Math.ceil(customers.size/20))return unavailable('PAGE_OUT_OF_RANGE');
 const rows=[...customers.values()].slice((page-1)*20,page*20).map(c=>({ordinal:c.ordinal,tickets:c.tickets,positiveTtc:round(c.positiveTtc),distinctProducts:c.products.size}));
 return {...basis(s,storeId,date),identityBasis:'EXTRACTION_LOCAL_ORDINAL',page,pageSize:20,totalCustomers:customers.size,rows};
}
export function projectObservedAssociations(evidence,{storeId,date,page}){
 const s=summarizeObservedSales(evidence,{storeId,date});if(s.status!=='READY')return s;
 if(page!==1)return unavailable('PAGE_OUT_OF_RANGE');
 const counts=new Map(),pairs=new Map();let baskets=0,work=0;
 for(const b of evidence.baskets){
  if(!b.customerToken)continue;
  if(b.items.some(i=>!validProduct(i.productNumber)))return unavailable('INVALID_PRODUCT');
  const products=[...new Set(b.items.filter(i=>i.sales>0).map(i=>i.productNumber))].sort();
  if(!products.length)continue;if(products.length>100)return unavailable('ANALYSIS_BOUND');
  baskets++;for(const p of products)counts.set(p,(counts.get(p)||0)+1);
  for(let i=0;i<products.length;i++)for(let j=i+1;j<products.length;j++){
   if(++work>2000000)return unavailable('ANALYSIS_BOUND');
   const key=JSON.stringify([products[i],products[j]]),r=pairs.get(key)||{count:0,cohort:new Set()};
   r.count++;if(r.cohort.size<10)r.cohort.add(b.customerToken);pairs.set(key,r);if(pairs.size>100000)return unavailable('ANALYSIS_BOUND');
  }
 }
 const rows=[];for(const [key,r] of pairs){if(r.cohort.size<10)continue;const [a,b]=JSON.parse(key);const confidence=r.count/counts.get(a),lift=confidence/(counts.get(b)/baskets);rows.push({productA:a,productB:b,together:r.count,supportPct:round(100*r.count/baskets),confidencePct:round(100*confidence),lift:round(lift)})}
 rows.sort((a,b)=>b.together-a.together||b.lift-a.lift||a.productA.localeCompare(b.productA)||a.productB.localeCompare(b.productB));
 return {...basis(s,storeId,date),method:'IDENTIFIED_POSITIVE_BASKET_COOCCURRENCE',baskets,rows:rows.slice(0,30),minimumDistinctCustomers:10};
}
