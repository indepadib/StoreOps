// Pure synthetic dispatch state machine. No network, persistence, or real recipients.
const id=v=>typeof v==='string'&&/^demo-[a-z0-9-]{1,80}$/.test(v);
const channels=['email','whatsapp','sms'];
const safe=Number.isSafeInteger;
const stamp=v=>typeof v==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(Date.parse(v)).toISOString().replace('.000Z','Z')===v;
export function prepareDispatch({tenantId,campaignId,author,reviewer,approvedRevision,revision,channel,templateApproved,consentComplete,historyComplete,budgetMinor,costMinor,recipients}){
 if(![tenantId,campaignId,author,reviewer].every(id)||!safe(revision)||revision<1||!safe(approvedRevision)||!channels.includes(channel)||!safe(budgetMinor)||budgetMinor<0||!safe(costMinor)||costMinor<0||!Array.isArray(recipients)||recipients.length>10000)throw Error('Invalid dispatch scope');
 const seen=new Set();for(const p of recipients){if(p?.tenantId!==tenantId||!id(p.customerToken)||seen.has(p.customerToken)||typeof p.eligible!=='boolean'||typeof p.frequencyAllowed!=='boolean'||typeof p.contactable!=='boolean')throw Error('Invalid recipient');seen.add(p.customerToken)}
 if(author===reviewer||approvedRevision!==revision||templateApproved!==true||consentComplete!==true||historyComplete!==true)return {status:'BLOCKED',jobs:[],reservedMinor:0,activationEnabled:false};
 const jobs=[];let reservedMinor=0;
 for(const p of [...recipients].sort((a,b)=>a.customerToken.localeCompare(b.customerToken))){
  if(!p.eligible||!p.frequencyAllowed||!p.contactable||costMinor>budgetMinor-reservedMinor)continue;
  jobs.push({tenantId,campaignId,customerToken:p.customerToken,channel,id:JSON.stringify([tenantId,campaignId,p.customerToken]),state:'queued',providerId:null,lastAt:null,events:[]});reservedMinor+=costMinor;
 }
 return {status:'PREPARED',jobs,reservedMinor,excluded:recipients.length-jobs.length,activationEnabled:false};
}
export function simulateDispatch(job,{tenantId,consentVerified,frequencyAllowed,contactable,killSwitch,providerResult,providerId,at}){
 if(job?.tenantId!==tenantId||!stamp(at)||!['accepted','rejected','unknown'].includes(providerResult))throw Error('Invalid simulation');
 if(job.state!=='queued')return job; // No retry, including ambiguous delivery.
 if(killSwitch!==false||consentVerified!==true||frequencyAllowed!==true||contactable!==true)return {...job,state:'blocked',lastAt:at};
 if(providerResult==='accepted'&&!id(providerId))throw Error('Invalid mock reference');
 return {...job,state:providerResult==='accepted'?'submitted':providerResult==='rejected'?'failed':'unknown',providerId:providerResult==='accepted'?providerId:null,lastAt:at};
}
export function applyMockReceipt(job,event){
 if(event?.tenantId!==job?.tenantId||!id(event.eventId)||!id(event.providerId)||event.providerId!==job.providerId||event.verified!==true||!stamp(event.at)||!['delivered','failed','unsubscribed'].includes(event.type))throw Error('Invalid mock receipt');
 const signature=JSON.stringify([event.type,event.at,event.providerId]),old=job.events.find(e=>e.id===event.eventId);
 if(old){if(old.signature!==signature)throw Error('Conflicting receipt');return job}
 if(event.at<job.lastAt&&event.type!=='unsubscribed')throw Error('Out-of-order receipt');
 if(event.type!=='unsubscribed'&&!['submitted','delivered','failed'].includes(job.state))throw Error('Invalid transition');
 if(event.type!=='unsubscribed'&&job.state!=='submitted'&&job.state!==event.type)throw Error('Conflicting terminal receipt');
 // Opt-out is independent of delivery state and must be persisted in a real suppression ledger.
 return {...job,state:event.type==='unsubscribed'?job.state:event.type,suppressed:job.suppressed===true||event.type==='unsubscribed',lastAt:event.at>job.lastAt?event.at:job.lastAt,events:[...job.events,{id:event.eventId,signature}]};
}
