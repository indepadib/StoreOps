// Observed promotion exposure, not price elasticity or causal uplift.
// Only positive product lines in positive-net tickets enter the exposure denominator.
// Promotional discount is an explicitly mapped amount, excluding unrelated loyalty benefits.
const id=v=>typeof v==='string'&&v.trim()===v&&v.length>0&&v.length<=200;
const day=v=>typeof v==='string'&&/^\d{4}-\d\d-\d\d$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(Date.parse(v)).toISOString().slice(0,10)===v;
const safe=Number.isSafeInteger;
const sum=(a,b)=>{const n=a+b;if(!safe(n))throw Error('Monetary overflow');return n};
export function promotionIntelligence({tenantId,customerToken,windowStart,asOf,tickets,promotionEvidenceComplete}){
 if(!id(tenantId)||!id(customerToken)||!day(windowStart)||!day(asOf)||windowStart>asOf||!Array.isArray(tickets))throw Error('Invalid promotion scope');
 if(promotionEvidenceComplete!==true)return {status:'UNAVAILABLE',promotionShareBps:null,promotionBand:'unknown',activationEnabled:false};
 const seen=new Map(),categories=new Map();let visits=0,promoVisits=0,sales=0,promoSales=0,discount=0;
 for(const t of tickets){
  if(t?.tenantId!==tenantId||t.customerToken!==customerToken||!id(t.storeId)||!id(t.ticketId)||!day(t.date)||t.date<windowStart||t.date>asOf||!safe(t.netMinor)||!Array.isArray(t.items))throw Error('Invalid ticket scope');
  const lines=new Set();let total=0,hasPromo=false;
  for(const x of t.items){
   if(!x||!id(x.lineId)||lines.has(x.lineId)||!id(x.productId)||!id(x.category)||!safe(x.netMinor)||typeof x.promoted!=='boolean'||!safe(x.promoDiscountMinor)||x.promoDiscountMinor<0||(!x.promoted&&x.promoDiscountMinor!==0)||(x.netMinor<=0&&x.promoDiscountMinor!==0))throw Error('Invalid promotion line');
   lines.add(x.lineId);total=sum(total,x.netMinor);
  }
  if(total!==t.netMinor)throw Error('Ticket items do not reconcile');
  const key=JSON.stringify([t.storeId,t.date,t.ticketId]),sig=JSON.stringify([t.netMinor,t.items.map(x=>[x.lineId,x.productId,x.category,x.netMinor,x.promoted,x.promoDiscountMinor]).sort((a,b)=>a[0].localeCompare(b[0]))]);
  if(seen.has(key)){if(seen.get(key)!==sig)throw Error('Conflicting promotion evidence');continue}seen.set(key,sig);
  if(t.netMinor<=0)continue;visits++;
  for(const x of t.items){
   if(x.netMinor<=0)continue;sales=sum(sales,x.netMinor);
   if(x.promoted){hasPromo=true;promoSales=sum(promoSales,x.netMinor);discount=sum(discount,x.promoDiscountMinor);categories.set(x.category,sum(categories.get(x.category)||0,x.netMinor))}
  }
  if(hasPromo)promoVisits++;
 }
 const share=sales?Math.round(promoSales/sales*10000):null;
 const band=visits<3||share===null?'unknown':share>=6000?'high':share>=3000?'medium':'low';
 return {status:visits<3||share===null?'INSUFFICIENT_HISTORY':'OBSERVED',purchaseTickets:visits,promotionTickets:promoVisits,positiveSalesMinor:sales,promotedSalesMinor:promoSales,nonPromotedSalesMinor:sales-promoSales,promoDiscountMinor:discount,promotionShareBps:share,promotionBand:band,topPromotionCategories:[...categories].map(([category,netMinor])=>({category,netMinor})).sort((a,b)=>b.netMinor-a.netMinor||a.category.localeCompare(b.category)).slice(0,3),method:'observed-promotion-exposure-v1',activationEnabled:false};
}
