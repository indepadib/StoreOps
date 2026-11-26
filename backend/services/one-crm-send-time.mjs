// Observational send-time recommendation. Fixed local hour slots in a verified IANA timezone.
// One event represents one delivered contact with a closed outcome window.
// Smoothed rates mitigate small counts but do not establish a causal effect of time.
const id=v=>typeof v==='string'&&v.length>0&&v.length<=200&&v.trim()===v;
const integer=Number.isSafeInteger;
const stamp=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(Date.parse(v)).toISOString().replace('.000Z','Z')===v;
const channels=['email','whatsapp','sms','push'];
const days=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
export function analyzeSendTime({tenantId,customerToken,channel,timeZone,windowStart,asOf,events,coverageComplete,consentVerified,minSlotContacts=5,priorStrength=10,startHour=9,endHour=21}){
 if(!id(tenantId)||!id(customerToken)||!channels.includes(channel)||typeof timeZone!=='string'||!stamp(windowStart)||!stamp(asOf)||windowStart>=asOf||!Array.isArray(events)||events.length>100000||!integer(minSlotContacts)||minSlotContacts<1||!integer(priorStrength)||priorStrength<1||priorStrength>1000||!integer(startHour)||!integer(endHour)||startHour<0||endHour>24||startHour>=endHour||startHour%3!==0||endHour%3!==0)throw Error('Invalid time analysis scope');
 const formatter=new Intl.DateTimeFormat('en-US',{timeZone,weekday:'short',hour:'2-digit',hourCycle:'h23'});
 if(coverageComplete!==true||consentVerified!==true)return {status:'BLOCKED',slots:[],recommendation:null,activationEnabled:false};
 const slots=days.flatMap((day,d)=>Array.from({length:8},(_,i)=>({day,weekday:d,hour:i*3,contacts:0,responses:0})));
 const seen=new Map();let contacts=0,responses=0;
 for(const e of events){
  if(e?.tenantId!==tenantId||e.customerToken!==customerToken||e.channel!==channel||!id(e.source)||!id(e.eventId)||!stamp(e.sentAt)||e.sentAt<windowStart||e.sentAt>asOf||!stamp(e.outcomeThrough)||e.outcomeThrough<=e.sentAt||Date.parse(e.outcomeThrough)-Date.parse(e.sentAt)!==24*3600000||e.outcomeThrough>asOf||e.delivered!==true||typeof e.responded!=='boolean')throw Error('Invalid or unclosed contact outcome');
  const k=JSON.stringify([e.source,e.eventId]),sig=JSON.stringify([e.sentAt,e.outcomeThrough,e.responded]);if(seen.has(k)){if(seen.get(k)!==sig)throw Error('Conflicting contact event');continue}seen.set(k,sig);
  const parts=formatter.formatToParts(new Date(e.sentAt)),weekday=days.indexOf(parts.find(x=>x.type==='weekday')?.value),hour=Number(parts.find(x=>x.type==='hour')?.value);
  if(weekday<0||!integer(hour)||hour<0||hour>23)throw Error('Invalid local time');
  const s=slots[weekday*8+Math.floor(hour/3)];s.contacts++;s.responses+=Number(e.responded);contacts++;responses+=Number(e.responded);
 }
 const baseline=contacts?responses/contacts:null;
 for(const s of slots){s.observedRate=s.contacts?s.responses/s.contacts:null;s.smoothedRate=baseline===null?null:(s.responses+priorStrength*baseline)/(s.contacts+priorStrength);s.eligible=s.contacts>=minSlotContacts&&s.hour>=startHour&&s.hour+3<=endHour}
 const eligible=slots.filter(s=>s.eligible).sort((a,b)=>b.smoothedRate-a.smoothedRate||b.contacts-a.contacts||a.weekday-b.weekday||a.hour-b.hour);
 const best=eligible[0];return {status:best?'OBSERVED':'INSUFFICIENT_HISTORY',timeZone,contacts,responses,baseline,slots,recommendation:best?{...best,requiresApproval:true}:null,method:'observed-response-smoothed-v1',activationEnabled:false};
}
