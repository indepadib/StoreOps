// Observed co-occurrence, not causal uplift or purchase predictions.
// One basket = one verified positive-net ticket. Positive lines only, unique product IDs.
const id=v=>typeof v==='string'&&v.length>0&&v.length<=200&&v===v.trim();
const day=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(Date.parse(v)).toISOString().slice(0,10)===v;
const safe=Number.isSafeInteger;
const add=(a,b)=>{const n=a+b;if(!safe(n))throw Error('Amount overflow');return n};
export function analyzeBaskets({tenantId,storeIds,allowedStoreIds,windowStart,asOf,tickets,itemEvidenceComplete,minPairCount=5,minConfidenceBps=0,minLift=1,limit=50,productId=null}){
 if(!id(tenantId)||!Array.isArray(storeIds)||!storeIds.length||new Set(storeIds).size!==storeIds.length||!Array.isArray(allowedStoreIds)||storeIds.some(s=>!id(s)||!allowedStoreIds.includes(s))||!day(windowStart)||!day(asOf)||windowStart>asOf||!Array.isArray(tickets)||tickets.length>100000||!safe(minPairCount)||minPairCount<1||!safe(minConfidenceBps)||minConfidenceBps<0||minConfidenceBps>10000||typeof minLift!=='number'||!Number.isFinite(minLift)||minLift<0||!safe(limit)||limit<1||limit>200||!(productId===null||id(productId)))throw Error('Invalid basket analysis scope');
 if(itemEvidenceComplete!==true)return {status:'UNAVAILABLE',activationEnabled:false,rules:[]};
 const stores=new Set(storeIds),seen=new Map(),counts=new Map(),pairs=new Map();let baskets=0,excludedTickets=0;
 for(const t of tickets){
  if(t?.tenantId!==tenantId||!stores.has(t.storeId)||!day(t.date)||t.date<windowStart||t.date>asOf||!id(t.ticketId)||!safe(t.netMinor)||!Array.isArray(t.items)||t.items.length>1000)throw Error('Invalid basket evidence');
  const lineIds=new Set(),positive=new Set(),normalized=[];let sum=0;
  for(const x of t.items){
   if(!x||!id(x.lineId)||lineIds.has(x.lineId)||!id(x.productId)||!safe(x.netMinor))throw Error('Invalid basket line');
   lineIds.add(x.lineId);sum=add(sum,x.netMinor);normalized.push([x.lineId,x.productId,x.netMinor]);if(x.netMinor>0)positive.add(x.productId)
  }
  if(sum!==t.netMinor)throw Error('Basket items do not reconcile');
  const k=JSON.stringify([t.storeId,t.date,t.ticketId]),sig=JSON.stringify([t.netMinor,normalized.sort((a,b)=>a[0].localeCompare(b[0]))]);
  if(seen.has(k)){if(seen.get(k)!==sig)throw Error('Conflicting basket duplicate');continue}seen.set(k,sig);
  if(t.netMinor<=0||!positive.size){excludedTickets++;continue}
  const products=[...positive].sort();if(products.length>100)throw Error('Basket exceeds analysis bound');
  baskets++;for(const p of products)counts.set(p,(counts.get(p)||0)+1);
  for(let i=0;i<products.length;i++)for(let j=i+1;j<products.length;j++){
   const key=JSON.stringify([products[i],products[j]]);pairs.set(key,(pairs.get(key)||0)+1);if(pairs.size>200000)throw Error('Pair analysis bound exceeded');
  }
 }
 const rules=[];
 for(const [k,n] of pairs){if(n<minPairCount)continue;const [a,b]=JSON.parse(k);
  for(const [from,to] of [[a,b],[b,a]]){
   if(productId!==null&&from!==productId)continue;
   const fromCount=counts.get(from),toCount=counts.get(to),confidence=n/fromCount,lift=confidence/(toCount/baskets);
   if(confidence*10000<minConfidenceBps||lift<minLift)continue;
   rules.push({from,to,pairCount:n,fromCount,toCount,supportBps:Math.round(n/baskets*10000),confidenceBps:Math.round(confidence*10000),lift})
  }
 }
 rules.sort((a,b)=>b.lift-a.lift||b.pairCount-a.pairCount||a.from.localeCompare(b.from)||a.to.localeCompare(b.to));
 return {status:'OBSERVED',baskets,excludedTickets,distinctProducts:counts.size,distinctPairs:pairs.size,qualifiedRules:rules.length,rules:rules.slice(0,limit),method:'positive-line-basket-cooccurrence-v1',activationEnabled:false};
}
