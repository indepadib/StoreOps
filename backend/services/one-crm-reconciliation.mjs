// Reconcile a closed store-day using signed ticket totals and independent controls.
// All values are integer MAD minor units. No contact data, provider access or storage.
const validDay=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(Date.parse(s))&&new Date(Date.parse(s)).toISOString().slice(0,10)===s;
const safe=(n)=>Number.isSafeInteger(n);
function sum(a,b){const n=a+b;if(!safe(n))throw Error('Monetary overflow');return n}
export function reconcileStoreDay({tenantId,storeId,date,batch,control}){
 const issues=[];
 const check=(ok,code)=>{if(!ok)issues.push(code)};
 const scope=x=>x?.tenantId===tenantId&&x.storeId===storeId&&x.date===date;
 if(!tenantId||!storeId||!validDay(date))throw Error('Invalid partition');
 check(scope(batch)&&scope(control),'PARTITION_MISMATCH');
 check(batch?.currency==='MAD'&&control?.currency==='MAD','CURRENCY_MISMATCH');
 check(batch?.closed===true&&control?.closed===true&&batch?.coverageComplete===true,'DAY_NOT_COMPLETE');
 check(batch?.basis==='signed-retail-net'&&control?.basis==='signed-retail-net','AMOUNT_BASIS_UNVERIFIED');
 check(typeof batch?.source==='string'&&!!batch.source.trim()&&typeof control?.source==='string'&&!!control.source.trim()&&batch.source!==control.source,'INDEPENDENT_CONTROL_REQUIRED');
 check(batch?.rejectedIdentity===0,'IDENTITY_CONFLICT');
 check(Array.isArray(batch?.tickets),'TICKETS_MISSING');
 const metrics={tickets:0,identifiedTickets:0,anonymousTickets:0,positiveMinor:0,refundMinor:0,netMinor:0,identifiedNetMinor:0,anonymousNetMinor:0,duplicates:0};
 const seen=new Map(),normalized=[];
 const itemEvidenceComplete=batch?.itemEvidenceComplete===true;
 const itemId=v=>typeof v==='string'&&v.length>0&&v.length<=200&&v===v.trim();
 if(Array.isArray(batch?.tickets))for(const t of batch.tickets){
  if(!scope(t)||typeof t.ticketId!=='string'||!t.ticketId.trim()||!safe(t.netMinor)||(t.customerToken!=null&&(typeof t.customerToken!=='string'||!t.customerToken.trim()))){issues.push('INVALID_TICKET');continue}
  let items;
  if(itemEvidenceComplete){
   if(!Array.isArray(t.items)||(!t.items.length&&t.netMinor!==0)){issues.push('ITEM_EVIDENCE_MISSING');continue}
   const lineKeys=new Set();items=[];let lineTotal=0,valid=true;
   for(const x of t.items){
    if(!x||!itemId(x.lineId)||lineKeys.has(x.lineId)||!itemId(x.productId)||!itemId(x.category)||!safe(x.netMinor)){valid=false;break}
    lineKeys.add(x.lineId);lineTotal=sum(lineTotal,x.netMinor);items.push({lineId:x.lineId,productId:x.productId,category:x.category,netMinor:x.netMinor});
   }
   if(!valid){issues.push('INVALID_ITEM_EVIDENCE');continue}
   if(lineTotal!==t.netMinor){issues.push('ITEM_TOTAL_MISMATCH');continue}
   items.sort((a,b)=>a.lineId.localeCompare(b.lineId));
  }
  const signature=JSON.stringify([t.netMinor,t.customerToken??null,items??null]);
  if(seen.has(t.ticketId)){metrics.duplicates++;if(seen.get(t.ticketId)!==signature)issues.push('CONFLICTING_DUPLICATE');continue}
  seen.set(t.ticketId,signature);metrics.tickets++;metrics.netMinor=sum(metrics.netMinor,t.netMinor);
  if(t.netMinor>0)metrics.positiveMinor=sum(metrics.positiveMinor,t.netMinor);
  if(t.netMinor<0)metrics.refundMinor=sum(metrics.refundMinor,-t.netMinor);
  if(t.customerToken){metrics.identifiedTickets++;metrics.identifiedNetMinor=sum(metrics.identifiedNetMinor,t.netMinor)}else{metrics.anonymousTickets++;metrics.anonymousNetMinor=sum(metrics.anonymousNetMinor,t.netMinor)}
  normalized.push({tenantId,storeId,date,ticketId:t.ticketId,customerToken:t.customerToken??null,netMinor:t.netMinor,...(itemEvidenceComplete?{items}:{})});
 }
 for(const key of ['tickets','positiveMinor','refundMinor','netMinor']){
  if(!safe(control?.[key])||(key!=='netMinor'&&control[key]<0))issues.push('CONTROL_MISSING_'+key);
  else if(control[key]!==metrics[key])issues.push('CONTROL_MISMATCH_'+key);
 }
 const codes=[...new Set(issues)];
 const report={tenantId,storeId,date,status:codes.length?'BLOCKED':'VERIFIED',issues:codes,metrics,activationEnabled:false};
 return {report,verifiedDay:codes.length?null:{tenantId,storeId,date,currency:'MAD',netAmountBasis:'verified-net-signed',coverageComplete:true,rejectedIdentity:0,itemEvidenceComplete,tickets:normalized}};
}
export function makeVerifiedDayReader({loadSignedBatch,loadIndependentControl}){
 if(typeof loadSignedBatch!=='function'||typeof loadIndependentControl!=='function')throw Error('Source and control required');
 return async scope=>{
  const [batch,control]=await Promise.all([loadSignedBatch(scope),loadIndependentControl(scope)]);
  const {report,verifiedDay}=reconcileStoreDay({...scope,batch,control});
  if(!verifiedDay)throw Object.assign(Error('Unverified store-day'),{code:'CRM_RECONCILIATION_BLOCKED',issues:report.issues});
  return verifiedDay;
 };
}
