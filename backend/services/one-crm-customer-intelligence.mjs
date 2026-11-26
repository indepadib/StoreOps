// Explainable RFM rules, NOT predictive probabilities. Monetary unit: MAD cents.
// Profile and item evidence must be produced by verified, authorized source adapters.
const validDay=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(Date.parse(s))&&new Date(Date.parse(s)).toISOString().slice(0,10)===s;
const id=s=>typeof s==='string'&&s.trim()===s&&s.length>0&&s.length<=200;
const amount=n=>Number.isSafeInteger(n);
const sum=(a,b)=>{const n=a+b;if(!amount(n))throw Error('Monetary overflow');return n};
export function scoreRfm(p){
 if(!p||!Number.isSafeInteger(p.purchaseTickets)||p.purchaseTickets<0||!amount(p.netMinor)||!(p.recencyDays===null||Number.isSafeInteger(p.recencyDays)&&p.recencyDays>=0))throw Error('Invalid profile metrics');
 if(p.purchaseTickets===0||p.recencyDays===null)return {status:'INSUFFICIENT_HISTORY',r:null,f:null,m:null,total:null,risk:'unknown',reason:'Aucun achat observé',nextAction:'Compléter l’historique'};
 const d=p.recencyDays,n=p.purchaseTickets,v=p.netMinor;
 const r=d<=7?5:d<=14?4:d<=30?3:d<=59?2:1;
 const f=n>=12?5:n>=8?4:n>=5?3:n>=2?2:1;
 const m=v>=300000?5:v>=200000?4:v>=100000?3:v>=50000?2:1;
 const risk=d>=60&&n>=2?'high':d>=31&&n>=2?'watch':n===1?'unknown':'low';
 return {status:'SCORED',r,f,m,total:r+f+m,risk,reason:risk==='high'?'60 jours ou plus sans achat, au moins deux achats observés':risk==='watch'?'31 à 59 jours sans achat, au moins deux achats observés':risk==='unknown'?'Un seul achat observé':'Dernier achat dans les 30 jours',nextAction:risk==='high'?'Étudier une réactivation':risk==='watch'?'Explorer une relance pertinente':risk==='unknown'?'Observer le prochain achat':'Entretenir la relation',method:'fixed-threshold-v1'};
}
export function buildCustomerEvidence({tenantId,customerToken,windowStart,asOf,tickets,events=[],coverageComplete}){
 if(!id(tenantId)||!id(customerToken)||!validDay(windowStart)||!validDay(asOf)||windowStart>asOf||coverageComplete!==true||!Array.isArray(tickets)||!Array.isArray(events))throw Error('Unverified evidence');
 const scoped=x=>x?.tenantId===tenantId&&x.customerToken===customerToken&&validDay(x.date)&&x.date>=windowStart&&x.date<=asOf;
 const seen=new Map(),categories=new Map(),products=new Map(),timeline=[];
 let netMinor=0,purchaseTickets=0,lastPurchase=null;
 const add=(map,k,minor)=>{const cur=map.get(k)||{key:k,netMinor:0,lines:0};cur.netMinor=sum(cur.netMinor,minor);cur.lines++;map.set(k,cur)};
 for(const t of tickets){
  if(!scoped(t)||!id(t.storeId)||!id(t.ticketId)||!amount(t.netMinor)||!Array.isArray(t.items))throw Error('Invalid ticket evidence');
  const k=JSON.stringify([t.storeId,t.date,t.ticketId]),lineKeys=new Set();let lineTotal=0;
  for(const x of t.items){if(!id(x.lineId)||lineKeys.has(x.lineId)||!id(x.productId)||!id(x.category)||!amount(x.netMinor))throw Error('Invalid item evidence');lineKeys.add(x.lineId);lineTotal=sum(lineTotal,x.netMinor)}
  if(lineTotal!==t.netMinor)throw Error('Ticket items do not reconcile');
  const signature=JSON.stringify([t.netMinor,t.items.map(x=>[x.lineId,x.productId,x.category,x.netMinor]).sort((a,b)=>a[0].localeCompare(b[0]))]);
  if(seen.has(k)){if(seen.get(k)!==signature)throw Error('Conflicting duplicate');continue}seen.set(k,signature);
  netMinor=sum(netMinor,t.netMinor);
  if(t.netMinor>0){purchaseTickets++;if(!lastPurchase||t.date>lastPurchase)lastPurchase=t.date}
  for(const x of t.items){add(categories,x.category,x.netMinor);add(products,x.productId,x.netMinor)}
  timeline.push({date:t.date,type:t.netMinor>0?'purchase':t.netMinor<0?'refund':'zero',storeId:t.storeId,netMinor:t.netMinor});
 }
 const eventKeys=new Map();for(const e of events){
  if(!scoped(e)||!id(e.source)||!id(e.eventId)||!['enrolled','points_earned','points_redeemed','consent_granted','consent_revoked'].includes(e.type))throw Error('Invalid customer event');
  const k=JSON.stringify([e.source,e.eventId]),sig=JSON.stringify([e.date,e.type]);if(eventKeys.has(k)){if(eventKeys.get(k)!==sig)throw Error('Conflicting event');continue}eventKeys.set(k,sig);timeline.push({date:e.date,type:e.type});
 }
 const ranked=map=>[...map.values()].sort((a,b)=>b.netMinor-a.netMinor||a.key.localeCompare(b.key));
 const profile={recencyDays:lastPurchase?Math.round((Date.parse(asOf)-Date.parse(lastPurchase))/86400000):null,purchaseTickets,netMinor};
 const categoryRanking=ranked(categories),productRanking=ranked(products);
 const topThree=rows=>rows.filter(x=>x.netMinor>0).slice(0,3).map(x=>x.key);
 return {profile,rfm:scoreRfm(profile),categories:categoryRanking,products:productRanking,segmentAttributes:{preferredCategories:topThree(categoryRanking),preferredProducts:topThree(productRanking)},timeline:timeline.sort((a,b)=>b.date.localeCompare(a.date)),method:'verified-observed-evidence',activationEnabled:false};
}
