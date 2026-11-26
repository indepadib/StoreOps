import {reconcileStoreDay} from './one-crm-reconciliation.mjs';
// Contract for a separately authorized signed export, not the positive-sales BI endpoint.
// No network access, storage or production credentials. Evidence metadata is caller supplied;
// source provenance and independence must be established outside this function.
const id=v=>typeof v==='string'&&v.length>0&&v.length<=160&&v===v.trim()&&!/[\x00-\x1f]/.test(v);
const day=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(Date.parse(v)).toISOString().slice(0,10)===v;
const add=(a,b)=>{const n=a+b;if(!Number.isSafeInteger(n))throw Error('Amount overflow');return n};
export function decimalMadToMinor(v){
 if(typeof v!=='string'||! /^-?(?:0|[1-9]\d{0,12})(?:\.\d{1,2})?$/.test(v))throw Error('Exact signed decimal MAD required');
 const neg=v.startsWith('-'),[whole,fraction='']=v.replace(/^-/,'').split('.'),n=Number(whole)*100+Number(fraction.padEnd(2,'0'));
 if(!Number.isSafeInteger(n))throw Error('Amount overflow');return neg&&n!==0?-n:n;
}
export function reconcileSignedExport({tenantId,storeId,date,allowedStoreIds,manifest,rows,control}){
 if(!id(tenantId)||!id(storeId)||!day(date)||!Array.isArray(allowedStoreIds)||!allowedStoreIds.includes(storeId)||!Array.isArray(rows)||rows.length>200000)throw Error('Invalid export scope');
 const scope={tenantId,storeId,date},same=x=>x?.tenantId===tenantId&&x.storeId===storeId&&x.date===date;
 const issues=[];
 const blocked=()=>({report:{...scope,status:'BLOCKED',issues:[...new Set(issues)],activationEnabled:false},verifiedDay:null});
 if(!same(manifest)||!same(control))issues.push('PARTITION_MISMATCH');
 if(manifest?.currency!=='MAD'||control?.currency!=='MAD'||manifest?.amountBasis!=='signed-ttc-after-discounts'||control?.amountBasis!==manifest?.amountBasis)issues.push('AMOUNT_BASIS_UNVERIFIED');
 if(manifest?.closed!==true||manifest?.coverageComplete!==true||manifest?.truncated!==false||control?.closed!==true)issues.push('DAY_NOT_COMPLETE');
 if(!id(manifest?.sourceRef)||!id(control?.sourceRef)||!id(manifest?.lineage)||!id(control?.lineage)||manifest.sourceRef===control.sourceRef||manifest.lineage===control.lineage||control?.independenceVerified!==true)issues.push('INDEPENDENT_CONTROL_REQUIRED');
 if(manifest?.identityVerified!==true||manifest?.statusMappingVerified!==true||manifest?.signMappingVerified!==true)issues.push('MAPPING_NOT_VERIFIED');
 if(issues.length)return blocked();
 const seen=new Map(),tickets=new Map();let positiveLineMinor=0,refundLineMinor=0,voidLines=0,duplicateLines=0;
 for(const r of rows){
  if(!same(r)||!id(r.company)||!id(r.registerId)||!id(r.transactionId)||!id(r.lineId)||!['posted','voided'].includes(r.status)||!(r.customerToken===null||id(r.customerToken))||!id(r.productId)||!id(r.category)){issues.push('INVALID_SOURCE_ROW');continue}
  let netMinor;try{netMinor=decimalMadToMinor(r.signedTtcMad)}catch{issues.push('INVALID_DECIMAL');continue}
  const ticketId=JSON.stringify([r.company,r.registerId,r.transactionId]),key=JSON.stringify([ticketId,r.lineId]),sig=JSON.stringify([r.status,r.customerToken,r.productId,r.category,netMinor]);
  if(seen.has(key)){duplicateLines++;if(seen.get(key)!==sig)issues.push('CONFLICTING_LINE_DUPLICATE');continue}seen.set(key,sig);
  if(r.status==='voided'){voidLines++;continue}
  let t=tickets.get(ticketId);if(!t){t={...scope,ticketId,customerToken:r.customerToken,netMinor:0,items:[]};tickets.set(ticketId,t)}
  if(t.customerToken!==r.customerToken){issues.push('IDENTITY_CONFLICT');continue}
  t.netMinor=add(t.netMinor,netMinor);t.items.push({lineId:r.lineId,productId:r.productId,category:r.category,netMinor});
  if(netMinor>0)positiveLineMinor=add(positiveLineMinor,netMinor);if(netMinor<0)refundLineMinor=add(refundLineMinor,-netMinor);
 }
 const lineMetrics={positiveLineMinor,refundLineMinor,postedLines:[...tickets.values()].reduce((n,t)=>n+t.items.length,0),voidLines,duplicateLines};
 for(const k of ['positiveLineMinor','refundLineMinor','postedLines'])if(!Number.isSafeInteger(control[k])||control[k]!==lineMetrics[k])issues.push('LINE_CONTROL_MISMATCH_'+k);
 if(issues.length)return {...blocked(),lineMetrics};
 const result=reconcileStoreDay({...scope,batch:{...scope,source:manifest.sourceRef,currency:'MAD',closed:true,coverageComplete:true,basis:'signed-retail-net',rejectedIdentity:0,itemEvidenceComplete:true,tickets:[...tickets.values()]},control:{...scope,source:control.sourceRef,currency:'MAD',closed:true,basis:'signed-retail-net',tickets:control.tickets,positiveMinor:control.positiveMinor,refundMinor:control.refundMinor,netMinor:control.netMinor}});
 return {...result,lineMetrics};
}
