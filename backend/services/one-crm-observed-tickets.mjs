import {parseObservedPilotStores,summarizeObservedSales} from './one-crm-observed-sales.mjs';
const PAGE_SIZE=20,MAX_ITEMS=500;
const day=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(Date.parse(v)).toISOString().slice(0,10)===v;
const validText=v=>typeof v==='string'&&v.trim().length>0&&v.length<=160&&!/[\x00-\x1f]/.test(v);
const money=v=>typeof v==='number'&&Number.isFinite(v)&&v>=0&&Number.isSafeInteger(Math.round(v*100));
const round=v=>Math.round(v*100)/100;
const unavailable=reason=>({status:'UNAVAILABLE',reason,activationEnabled:false});
export function projectTicketPage(evidence,{storeId,date,page}){
 const summary=summarizeObservedSales(evidence,{storeId,date});
 if(summary.status!=='READY')return summary;
 if(!Number.isSafeInteger(page)||page<1||page>Math.ceil(summary.tickets/PAGE_SIZE))return unavailable('PAGE_OUT_OF_RANGE');
 const ordered=[...evidence.baskets].sort((a,b)=>a.key<b.key?-1:a.key>b.key?1:0),rows=[];
 for(const [i,b] of ordered.slice((page-1)*PAGE_SIZE,page*PAGE_SIZE).entries()){
  if(b.items.length>MAX_ITEMS)return unavailable('TICKET_TOO_LARGE');
  const items=[];
  for(const x of b.items){
   if(!validText(x.productNumber)||!money(x.sales))return unavailable('PRODUCT_EVIDENCE_INVALID');
   items.push({productNumber:x.productNumber,productName:validText(x.productName)?x.productName:null,unit:validText(x.unit)?x.unit:null,quantity:typeof x.units==='number'&&Number.isFinite(x.units)&&x.units>0?x.units:null,positiveTtc:round(x.sales),observedDiscount:money(x.discountAmount)?round(x.discountAmount):null});
  }
  // Display ordinal is scoped to this extraction, not a durable receipt/customer ID.
  rows.push({ordinal:(page-1)*PAGE_SIZE+i+1,positiveTtc:round(b.items.reduce((n,x)=>n+x.sales,0)),items});
 }
 return {status:'READY',storeId,date,source:summary.source,basis:summary.basis,financialReconciliation:'NOT_VERIFIED',checkedAt:summary.checkedAt,currency:'MAD',page,pageSize:PAGE_SIZE,totalTickets:summary.tickets,rows,activationEnabled:false};
}
export function makeObservedTicketsGateway({listStores,canAccessStore,sourceReady,readDay,today,pilotStores='',project=projectTicketPage}){
 if([listStores,canAccessStore,sourceReady,readDay,today,project].some(f=>typeof f!=='function'))throw Error('Missing dependencies');
 return async({session,dynamicsMode,method,query})=>{
  const u=session?.user;
  if(!['entra','local'].includes(session?.mode)||!u||!(u.role==='ops_director'||u.permissions_profile==='platform_admin'))return {status:403,data:{error:'Accès professionnel requis.'}};
  if(method!=='GET')return {status:405,data:{error:'Lecture uniquement.'}};
  if(dynamicsMode!=='live')return {status:503,data:unavailable('LIVE_SOURCE_REQUIRED')};
  const keys=[...query.keys()],storeId=query.get('storeId'),date=query.get('date'),p=query.get('page'),now=today();
  if(keys.length!==3||new Set(keys).size!==3||keys.some(k=>!['storeId','date','page'].includes(k))||!day(date)||!day(now)||date>=now||Date.parse(now)-Date.parse(date)>31*86400000||!/^\d{1,5}$/.test(p||'')||Number(p)<1)return {status:400,data:unavailable('INVALID_SELECTION')};
  const scope=parseObservedPilotStores(pilotStores);
  if(!scope.size)return {status:503,data:unavailable('PILOT_SCOPE_NOT_CONFIGURED')};
  if(!(await listStores()).some(s=>s.id===storeId&&scope.has(s.id)&&canAccessStore(u,s.id)&&sourceReady(s.id)))return {status:403,data:{error:'Magasin non autorisé ou non connecté.'}};
  try{return {status:200,data:project(await readDay(storeId,date),{storeId,date,page:Number(p)})}}catch{return {status:503,data:unavailable('SOURCE_READ_FAILED')}}
 };
}
