// Authenticated, aggregate-only observation of existing StoreOps sales evidence.
// It is not the independently reconciled signed CRM ledger.
const SOURCE='D365/RetailTransactionSalesTransBIEntities';
const day=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(Date.parse(v)).toISOString().slice(0,10)===v;
const unavailable=reason=>({status:'UNAVAILABLE',reason,activationEnabled:false});
export function summarizeObservedSales(evidence,{storeId,date}){
 if(evidence?.source!==SOURCE||evidence.storeId!==storeId||evidence.startDate!==date||evidence.endDate!==date||typeof evidence.checkedAt!=='string'||!Number.isFinite(Date.parse(evidence.checkedAt))||evidence.rejectedIdentity!==0||!Array.isArray(evidence.baskets)||evidence.baskets.length>200000)return unavailable('SOURCE_EVIDENCE_INCOMPLETE');
 const seen=new Set(),customers=new Set();let tickets=0,identified=0,sales=0,identifiedSales=0;
 for(const b of evidence.baskets){
  if(b?.storeId!==storeId||b.date!==date||typeof b.key!=='string'||!b.key||seen.has(b.key)||!(b.customerToken===null||typeof b.customerToken==='string'&&b.customerToken.length>0)||!Array.isArray(b.items)||!b.items.length)return unavailable('INVALID_BASKET');
  seen.add(b.key);let amount=0;
  for(const i of b.items){if(typeof i?.sales!=='number'||!Number.isFinite(i.sales)||i.sales<0)return unavailable('INVALID_SALES_AMOUNT');amount+=i.sales}
  if(!Number.isFinite(amount)||amount<=0)return unavailable('INVALID_BASKET_AMOUNT');
  tickets++;sales+=amount;if(b.customerToken!==null){identified++;customers.add(b.customerToken);identifiedSales+=amount}
 }
 if(customers.size<10)return {status:'SUPPRESSED',reason:'MINIMUM_COHORT',activationEnabled:false};
 const money=n=>Math.round(n*100)/100;
 if(!Number.isSafeInteger(Math.round(sales*100))||!Number.isSafeInteger(Math.round(identifiedSales*100)))return unavailable('AMOUNT_OVERFLOW');
 return {status:'READY',storeId,date,source:SOURCE,checkedAt:evidence.checkedAt,basis:'POSITIVE_SALES_TTC_OBSERVED_EXCLUDES_RETURNS',financialReconciliation:'NOT_VERIFIED',currency:'MAD',tickets,identifiedTickets:identified,identifiedCustomers:customers.size,positiveSales:money(sales),identifiedPositiveSales:money(identifiedSales),averagePositiveBasket:money(sales/tickets),identifiedTicketSharePct:money(100*identified/tickets),activationEnabled:false};
}
// A pilot scope is an explicit server-side release boundary, independent of broad StoreOps roles.
export function parseObservedPilotStores(value){
 if(typeof value!=='string'||!value.trim())return new Set();
 const ids=value.split(',').map(x=>x.trim());
 if(ids.length>2||ids.some(x=>!(/^[A-Za-z0-9_-]{1,64}$/).test(x))||new Set(ids).size!==ids.length)return new Set();
 return new Set(ids);
}
export function makeObservedSalesGateway({listStores,canAccessStore,sourceReady,readDay,today,pilotStores=''}){
 if([listStores,canAccessStore,sourceReady,readDay,today].some(f=>typeof f!=='function'))throw Error('Missing CRM dependencies');
 return async ({session,dynamicsMode,method,query})=>{
  const u=session?.user;
  if(!['entra','local'].includes(session?.mode)||!u||!(u.role==='ops_director'||u.permissions_profile==='platform_admin'))return {status:403,data:{error:'Accès CRM professionnel requis.'}};
  if(method!=='GET')return {status:405,data:{error:'Lecture uniquement.'}};
  if(dynamicsMode!=='live')return {status:503,data:unavailable('LIVE_SOURCE_REQUIRED')};
  const keys=[...query.keys()];if(keys.some(k=>!['storeId','date'].includes(k))||new Set(keys).size!==keys.length)return {status:400,data:{error:'Paramètres invalides.'}};
  const scope=parseObservedPilotStores(pilotStores);
  if(!scope.size)return {status:503,data:unavailable('PILOT_SCOPE_NOT_CONFIGURED')};
  const stores=(await listStores()).filter(s=>scope.has(s.id)&&canAccessStore(u,s.id)&&sourceReady(s.id)).map(s=>({id:s.id,name:s.name}));
  if(!keys.length)return {status:200,data:{status:'READY',stores,activationEnabled:false}};
  const storeId=query.get('storeId'),date=query.get('date'),now=today();
  if(!day(now)||!day(date)||date>=now||Date.parse(now)-Date.parse(date)>31*86400000)return {status:400,data:{error:'Choisir une journée passée parmi les 31 derniers jours.'}};
  if(!stores.some(s=>s.id===storeId))return {status:403,data:{error:'Magasin non autorisé ou non connecté.'}};
  try{const evidence=await readDay(storeId,date);return {status:200,data:summarizeObservedSales(evidence,{storeId,date})}}catch{return {status:503,data:unavailable('SOURCE_READ_FAILED')}}
 };
}
