import {buildProfiles,previewSegment} from './one-crm-foundation.mjs';
import {evaluateSegment} from './one-crm-segment-engine.mjs';

// Internal adapter only. Never mount as a public route; caller must provide
// server-derived authorization and a verified source/currency reconciliation.
// Existing basket evidence alone does not certify these properties.
export async function readCrmAudience({tenantId,storeIds,allowedStoreIds,windowStart,asOf,readVerifiedDay,rules={}}){
 if(!tenantId||!Array.isArray(storeIds)||!storeIds.length||new Set(storeIds).size!==storeIds.length||!Array.isArray(allowedStoreIds)||storeIds.some(s=>!allowedStoreIds.includes(s)))throw Error('Forbidden store scope');
 const day=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(Date.parse(s))&&new Date(Date.parse(s)).toISOString().slice(0,10)===s;
 if(!day(windowStart)||!day(asOf)||windowStart>asOf||Date.parse(asOf)-Date.parse(windowStart)>89*86400000)throw Error('Invalid observation period');
 if(typeof readVerifiedDay!=='function')throw Error('Verified source unavailable');
 const tickets=[];
 for(const storeId of storeIds)for(let ts=Date.parse(windowStart);ts<=Date.parse(asOf);ts+=86400000){
  const date=new Date(ts).toISOString().slice(0,10),d=await readVerifiedDay({tenantId,storeId,date});
  if(d?.tenantId!==tenantId||d.storeId!==storeId||d.date!==date||d.coverageComplete!==true||d.currency!=='MAD'||d.netAmountBasis!=='verified-net-signed'||d.rejectedIdentity!==0||!Array.isArray(d.tickets))throw Error('Incomplete or unverified source');
  for(const t of d.tickets){
   if(t.tenantId!==tenantId||t.storeId!==storeId||t.date!==date)throw Error('Ticket outside authorized partition');
   tickets.push(t);
  }
 }
 const snapshot=buildProfiles({tenantId,asOf,windowStart,coverageComplete:true,tickets});
 const audience=rules.expression?evaluateSegment(snapshot,{tenantId,expression:rules.expression}):previewSegment(snapshot,{...rules,tenantId});
 const audienceNetMinor=audience.reduce((n,p)=>{const total=n+p.netMinor;if(!Number.isSafeInteger(total))throw Error('Audience monetary overflow');return total},0);
 // No contact information or customer identifiers cross this boundary.
 return {status:'READY',currency:'MAD',windowStart,asOf,storeIds:[...storeIds],observedCustomers:snapshot.profiles.length,anonymousTickets:snapshot.anonymousTickets,uniqueTickets:snapshot.uniqueTickets,audienceCount:audience.length,audienceNetMinor,activationEnabled:false};
}
