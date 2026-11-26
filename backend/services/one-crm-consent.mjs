// Pure preflight. Inputs must come from an authorized, complete consent ledger.
// A proof reference alone is insufficient: upstream must verify the proof.
const channels=new Set(['email','whatsapp','sms','push']);
const validId=v=>typeof v==='string'&&v.length>0&&v.length<=200&&v===v.trim();
const timestamp=v=>{
 if(typeof v!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(v))return NaN;
 const n=Date.parse(v);if(!Number.isFinite(n))return NaN;
 const canonical=v.includes('.')?v.replace(/\.(\d{1,3})Z$/,(_,ms)=>'.'+ms.padEnd(3,'0')+'Z'):v.replace(/Z$/,'.000Z');
 return new Date(n).toISOString()===canonical?n:NaN;
};
export function consentPreflight({tenantId,channel,asOf,profiles,events,suppressions,ledgerComplete}){
 if(!validId(tenantId)||!channels.has(channel)||!Number.isFinite(timestamp(asOf))||!Array.isArray(profiles)||!Array.isArray(events)||!Array.isArray(suppressions)||profiles.length>100000||events.length>1000000||suppressions.length>1000000)throw Error('Invalid preflight input');
 const cutoff=timestamp(asOf),ids=new Set(),latest=new Map(),blocked=new Set(),invalid=new Set(),seen=new Map();
 for(const p of profiles){
  if(p?.tenantId!==tenantId||!validId(p.customerToken)||ids.has(p.customerToken)||!['active','quarantined','erased'].includes(p.status))throw Error('Invalid profile scope');
  ids.add(p.customerToken);
 }
 for(const e of events){
  if(e?.tenantId!==tenantId||!validId(e.customerToken)||!channels.has(e.channel)||e.purpose!=='marketing'||!validId(e.source)||!validId(e.sourceEventId))throw Error('Invalid consent scope');
  const k=JSON.stringify([e.source,e.sourceEventId]),sig=JSON.stringify([e.customerToken,e.channel,e.status,e.at,e.proofRef??null,e.proofVerified===true]);
  if(seen.has(k)){if(seen.get(k)!==sig)throw Error('Conflicting consent event');continue}seen.set(k,sig);
  if(e.channel!==channel||!ids.has(e.customerToken))continue;
  const at=timestamp(e.at);
  if(!Number.isFinite(at)||!['granted','revoked'].includes(e.status)){invalid.add(e.customerToken);continue}
  if(at>cutoff)continue;
  const current=latest.get(e.customerToken),proof=e.status==='granted'&&e.proofVerified===true&&validId(e.proofRef);
  if(!current||at>current.at)latest.set(e.customerToken,{at,status:e.status,proof});
  else if(at===current.at){if(e.status==='revoked'||current.status==='revoked')latest.set(e.customerToken,{at,status:'revoked',proof:false});else latest.set(e.customerToken,{at,status:'granted',proof:current.proof&&proof})}
 }
 for(const s of suppressions){
  if(s?.tenantId!==tenantId||!validId(s.customerToken)||!(s.channel==='all'||channels.has(s.channel))||typeof s.active!=='boolean')throw Error('Invalid suppression scope');
  if(s.active&&(s.channel==='all'||s.channel===channel))blocked.add(s.customerToken);
 }
 const reasons={eligible:0,ledger_incomplete:0,inactive:0,suppressed:0,invalid:0,unknown:0,revoked:0,proof_missing:0};
 const decisions=profiles.map(p=>{
  const id=p.customerToken,event=latest.get(id);
  const reason=ledgerComplete!==true?'ledger_incomplete':p.status!=='active'?'inactive':blocked.has(id)?'suppressed':invalid.has(id)?'invalid':!event?'unknown':event.status==='revoked'?'revoked':!event.proof?'proof_missing':'eligible';
  reasons[reason]++;return {id,eligible:reason==='eligible',reason}
 });
 return {summary:{channel,audience:profiles.length,eligible:reasons.eligible,excluded:profiles.length-reasons.eligible,reasons,activationEnabled:false},decisions};
}
