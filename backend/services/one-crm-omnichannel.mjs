// Omnichannel planning, simulation only. No dispatch or provider integration.
// Consent and contact history must be complete as of the planning snapshot.
// All proposed contacts are single-channel, with fallback in configured order.
const channels=['email','whatsapp','sms','push'];
const id=v=>typeof v==='string'&&v.length>0&&v.length<=200&&v===v.trim();
const stamp=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(Date.parse(v)).toISOString().replace('.000Z','Z')===v;
const safe=Number.isSafeInteger;
export function planOmnichannel({tenantId,asOf,audience,channelOrder,history,historyComplete,consentComplete,maxContacts7d=2,minGapHours=24,costMinorByChannel,budgetMinor}){
 if(!id(tenantId)||!stamp(asOf)||!Array.isArray(audience)||audience.length>100000||!Array.isArray(history)||history.length>1000000||!Array.isArray(channelOrder)||!channelOrder.length||new Set(channelOrder).size!==channelOrder.length||channelOrder.some(c=>!channels.includes(c))||!safe(maxContacts7d)||maxContacts7d<1||maxContacts7d>20||!safe(minGapHours)||minGapHours<0||minGapHours>168||!safe(budgetMinor)||budgetMinor<0||channelOrder.some(c=>!safe(costMinorByChannel?.[c])||costMinorByChannel[c]<0))throw Error('Invalid omnichannel plan');
 const profiles=new Map();for(const p of audience){if(p?.tenantId!==tenantId||!id(p.id)||profiles.has(p.id)||!['active','quarantined','erased'].includes(p.status)||!Array.isArray(p.eligibleChannels)||new Set(p.eligibleChannels).size!==p.eligibleChannels.length||p.eligibleChannels.some(c=>!channels.includes(c)))throw Error('Invalid audience scope');profiles.set(p.id,p)}
 const reasons={incomplete:0,inactive:0,no_consent:0,frequency_cap:0,cooldown:0,budget:0},counts=Object.fromEntries(channelOrder.map(c=>[c,0]));
 if(historyComplete!==true||consentComplete!==true){reasons.incomplete=audience.length;return {status:'BLOCKED',audience:audience.length,planned:0,excluded:audience.length,reasons,channels:counts,totalCostMinor:0,activationEnabled:false}}
 const now=Date.parse(asOf),seen=new Map(),contacts=new Map();
 for(const e of history){
  if(e?.tenantId!==tenantId||!profiles.has(e.id)||!id(e.source)||!id(e.eventId)||!channels.includes(e.channel)||!stamp(e.at)||Date.parse(e.at)>now)throw Error('Invalid contact history');
  const key=JSON.stringify([e.source,e.eventId]),sig=JSON.stringify([e.id,e.channel,e.at]);
  if(seen.has(key)){if(seen.get(key)!==sig)throw Error('Conflicting contact history');continue}seen.set(key,sig);
  const t=Date.parse(e.at);if(t<=now-7*86400000)continue;
  const p=contacts.get(e.id)||{count:0,last:-Infinity};p.count++;p.last=Math.max(p.last,t);contacts.set(e.id,p)
 }
 let planned=0,totalCostMinor=0;
 // Stable ordering by opaque ID for demonstration; no claim of optimal allocation.
 for(const p of [...profiles.values()].sort((a,b)=>a.id.localeCompare(b.id))){
  if(p.status!=='active'){reasons.inactive++;continue}
  const candidates=channelOrder.filter(c=>p.eligibleChannels.includes(c));if(!candidates.length){reasons.no_consent++;continue}
  const h=contacts.get(p.id);if(h&&h.count>=maxContacts7d){reasons.frequency_cap++;continue}
  if(h&&now-h.last<minGapHours*3600000){reasons.cooldown++;continue}
  const c=candidates.find(c=>costMinorByChannel[c]<=budgetMinor-totalCostMinor);
  if(!c){reasons.budget++;continue}
  counts[c]++;planned++;totalCostMinor+=costMinorByChannel[c];
 }
 return {status:'PLANNED',audience:audience.length,planned,excluded:audience.length-planned,reasons,channels:counts,totalCostMinor,budgetMinor,activationEnabled:false,method:'single-channel-priority-fallback-v1'};
}
