// Ledger in integer reward units; conversion to MAD is a scenario, not an accounting liability.
// Authoritative opening and closing balances, complete history and verified source required.
const safe=Number.isSafeInteger;
const id=v=>typeof v==='string'&&v.length>0&&v.length<=200&&v===v.trim();
const day=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(Date.parse(v)).toISOString().slice(0,10)===v;
const ts=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(v)&&Number.isFinite(Date.parse(v));
const add=(a,b)=>{const n=a+b;if(!safe(n))throw Error('Reward overflow');return n};
export function loyaltyIntelligence({tenantId,customerToken,programId,windowStart,asOf,openingUnits,closingUnits,events,ledgerComplete,netSalesMinor,minorPerUnit}){
 if(!id(tenantId)||!id(customerToken)||!id(programId)||!day(windowStart)||!day(asOf)||windowStart>asOf||!Array.isArray(events)||!safe(openingUnits)||openingUnits<0||!safe(closingUnits)||closingUnits<0||!safe(netSalesMinor)||!safe(minorPerUnit)||minorPerUnit<0)throw Error('Invalid loyalty scope');
 if(ledgerComplete!==true)return {status:'UNAVAILABLE',reason:'Incomplete ledger',activationEnabled:false};
 const seen=new Map(),ordered=[];
 for(const e of events){
  if(e?.tenantId!==tenantId||e.customerToken!==customerToken||e.programId!==programId||!id(e.source)||!id(e.eventId)||!ts(e.at)||e.at.slice(0,10)<windowStart||e.at.slice(0,10)>asOf||!['earn','burn','expire','adjustment'].includes(e.type)||!safe(e.units)||e.units===0||e.type==='earn'&&e.units<0||['burn','expire'].includes(e.type)&&e.units>0)throw Error('Invalid loyalty event');
  const k=JSON.stringify([e.source,e.eventId]),sig=JSON.stringify([e.at,e.type,e.units]);
  if(seen.has(k)){if(seen.get(k)!==sig)throw Error('Conflicting loyalty duplicate');continue}seen.set(k,sig);ordered.push(e)
 }
 ordered.sort((a,b)=>Date.parse(a.at)-Date.parse(b.at));
 let balance=openingUnits,earned=0,burned=0,expired=0,adjustment=0;const timeline=[];
 // Events sharing the same instant have no established order: check their combined balance.
 for(let i=0;i<ordered.length;){
  let delta=0,j=i;const stamp=Date.parse(ordered[i].at);
  while(j<ordered.length&&Date.parse(ordered[j].at)===stamp){const e=ordered[j++];delta=add(delta,e.units);if(e.type==='earn')earned=add(earned,e.units);else if(e.type==='burn')burned=add(burned,-e.units);else if(e.type==='expire')expired=add(expired,-e.units);else adjustment=add(adjustment,e.units);timeline.push({at:e.at,type:e.type,units:e.units})}
  balance=add(balance,delta);if(balance<0)return {status:'BLOCKED',reason:'Negative intermediate balance',activationEnabled:false};i=j;
 }
 if(balance!==closingUnits)return {status:'BLOCKED',reason:'Closing balance mismatch',activationEnabled:false};
 const available=add(add(openingUnits,earned),Math.max(0,adjustment));
 const value=n=>{const v=n*minorPerUnit;if(!safe(v))throw Error('Monetary overflow');return v};
 const issuedValueMinor=value(earned),redeemedValueMinor=value(burned);
 return {status:'RECONCILED',openingUnits,closingUnits,earnedUnits:earned,burnedUnits:burned,expiredUnits:expired,adjustmentUnits:adjustment,redemptionRateBps:available>0?Math.round(burned/available*10000):null,issuedValueMinor,redeemedValueMinor,walletFaceValueMinor:value(closingUnits),issuedValueToSalesBps:netSalesMinor>0?Math.round(issuedValueMinor/netSalesMinor*10000):null,timeline:timeline.reverse(),method:'reward-ledger-observed-v1',activationEnabled:false};
}
