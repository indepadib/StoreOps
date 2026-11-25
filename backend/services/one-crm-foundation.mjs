// ONE CRM: pure retail profile and audience preview. No DB, PII, or provider calls.
// Amounts are integer minor units in a single currency per tenant; source adapter must enforce currency and coverage.
export function buildProfiles({tenantId,asOf,windowStart,coverageComplete,tickets}){
 const validDay=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(Date.parse(s))&&new Date(Date.parse(s)).toISOString().slice(0,10)===s;
 if(!tenantId||!validDay(asOf)||!validDay(windowStart)||windowStart>asOf||coverageComplete!==true||!Array.isArray(tickets))throw Error('Verified tenant and complete observation window required');
 const profiles=new Map(),seen=new Map();let anonymousTickets=0;
 for(const t of tickets){
  if(t.tenantId!==tenantId)throw Error('Tenant mismatch');
  if(!t.storeId||!t.ticketId||!validDay(t.date)||t.date<windowStart||t.date>asOf||!Number.isSafeInteger(t.netMinor))throw Error('Invalid ticket');
  if(t.customerToken!=null&&(typeof t.customerToken!=='string'||!t.customerToken.trim()))throw Error('Invalid customer token');
  const key=JSON.stringify([t.storeId,t.ticketId]),signature=JSON.stringify([t.date,t.netMinor,t.customerToken??null]);
  if(seen.has(key)){if(seen.get(key)!==signature)throw Error('Conflicting duplicate ticket');continue}seen.set(key,signature);
  if(!t.customerToken){anonymousTickets++;continue}
  const p=profiles.get(t.customerToken)||{tenantId,customerToken:t.customerToken,netMinor:0,purchaseTickets:0,refundOrZeroTickets:0,lastPurchase:null,stores:new Set()};
  p.netMinor+=t.netMinor;if(!Number.isSafeInteger(p.netMinor))throw Error('Monetary overflow');
  if(t.netMinor>0){p.purchaseTickets++;if(!p.lastPurchase||t.date>p.lastPurchase)p.lastPurchase=t.date;p.stores.add(t.storeId)}else p.refundOrZeroTickets++;
  profiles.set(t.customerToken,p);
 }
 return {tenantId,asOf,windowStart,anonymousTickets,uniqueTickets:seen.size,profiles:[...profiles.values()].map(p=>({...p,stores:[...p.stores].sort(),recencyDays:p.lastPurchase?Math.round((Date.parse(asOf)-Date.parse(p.lastPurchase))/86400000):null,averageNetMinor:p.purchaseTickets?Math.round(p.netMinor/p.purchaseTickets):null}))};
}

export function previewSegment(snapshot,{tenantId,maxRecencyDays,minRecencyDays,minPurchaseTickets,minNetMinor}){
 if(snapshot.tenantId!==tenantId)throw Error('Tenant mismatch');
 for(const v of [maxRecencyDays,minRecencyDays,minPurchaseTickets])if(v!==undefined&&(!Number.isSafeInteger(v)||v<0))throw Error('Invalid segment threshold');
 if(minNetMinor!==undefined&&!Number.isSafeInteger(minNetMinor))throw Error('Invalid monetary threshold');
 if(minRecencyDays!==undefined&&maxRecencyDays!==undefined&&minRecencyDays>maxRecencyDays)throw Error('Conflicting recency limits');
 return snapshot.profiles.filter(p=>p.recencyDays!==null&&(maxRecencyDays===undefined||p.recencyDays<=maxRecencyDays)&&(minRecencyDays===undefined||p.recencyDays>=minRecencyDays)&&(minPurchaseTickets===undefined||p.purchaseTickets>=minPurchaseTickets)&&(minNetMinor===undefined||p.netMinor>=minNetMinor));
}

export function marketingEligibility({tenantId,customerToken,channel,asOf,consents,suppressed=false}){
 if(suppressed||!tenantId||!customerToken||!['email','whatsapp','sms','push'].includes(channel)||typeof asOf!=='string'||!Number.isFinite(Date.parse(asOf))||!Array.isArray(consents))return false;
 const scoped=consents.filter(c=>c.tenantId===tenantId&&c.customerToken===customerToken&&c.channel===channel&&c.purpose==='marketing');
 if(scoped.some(c=>!Number.isFinite(Date.parse(c.at))||!['granted','revoked'].includes(c.status)))return false;
 const events=scoped.filter(c=>Date.parse(c.at)<=Date.parse(asOf)).sort((a,b)=>Date.parse(b.at)-Date.parse(a.at)||(a.status==='revoked'?-1:1));
 return !!(events[0]?.status==='granted'&&typeof events[0].proofId==='string'&&events[0].proofId.trim());
}
