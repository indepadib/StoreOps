import {parseObservedPilotStores} from './one-crm-observed-sales.mjs';
const SOURCE='D365/CustTableCDREntities';
const clean=v=>String(v??'').trim();
const id=v=>typeof v==='string'&&v.length>0&&v.length<=160&&v===v.trim()&&!/[\x00-\x1f]/.test(v);
const unavailable=reason=>({status:'UNAVAILABLE',reason,activationEnabled:false});
const SIZE=50;
// Complete company-level Retail account master, not a transaction-derived cohort.
export function normalizeCustomerMaster(rows,{company,checkedAt}){
 if(!id(company)||!Array.isArray(rows)||rows.length>=100000||typeof checkedAt!=='string'||!Number.isFinite(Date.parse(checkedAt)))throw Error('Invalid account master');
 const seen=new Map();
 for(const r of rows){
  const account=clean(r.AccountNum),area=clean(r.SysDataAreaId),created=clean(r.SysCreatedDateTime),group=clean(r.CustGroup);
  if(!id(account)||area!==company||group!=='Retail'||!Number.isFinite(Date.parse(created)))throw Error('Invalid account partition');
  const createdAt=new Date(created).toISOString(),old=seen.get(account);
  if(old&&old.createdAt!==createdAt)throw Error('Conflicting account duplicate');
  seen.set(account,{accountRef:account,createdAt});
 }
 return {source:SOURCE,scope:'LEGAL_ENTITY_RETAIL',checkedAt,rows:[...seen.values()].sort((a,b)=>a.accountRef<b.accountRef?-1:a.accountRef>b.accountRef?1:0)};
}
export function projectCustomerMaster(master,page){
 if(master?.source!==SOURCE||master.scope!=='LEGAL_ENTITY_RETAIL'||!Array.isArray(master.rows)||!Number.isSafeInteger(page)||page<1||page>Math.max(1,Math.ceil(master.rows.length/SIZE)))return unavailable('DIRECTORY_PAGE_UNAVAILABLE');
 return {status:'READY',source:SOURCE,scope:master.scope,checkedAt:master.checkedAt,totalAccounts:master.rows.length,page,pageSize:SIZE,rows:master.rows.slice((page-1)*SIZE,page*SIZE),identityBasis:'D365_LEGAL_ENTITY_ACCOUNT',historyStatus:'NOT_CONNECTED',activationEnabled:false};
}
export function makeCustomerDirectoryGateway({listStores,canAccessStore,readMaster,pilotStores=''}){
 if([listStores,canAccessStore,readMaster].some(f=>typeof f!=='function'))throw Error('Missing dependencies');
 return async({session,dynamicsMode,method,query})=>{
  const u=session?.user;
  if(!['entra','local'].includes(session?.mode)||!u||!(u.role==='ops_director'||u.permissions_profile==='platform_admin'))return {status:403,data:{error:'Accès professionnel requis.'}};
  if(method!=='GET')return {status:405,data:{error:'Lecture uniquement.'}};
  if(dynamicsMode!=='live')return {status:503,data:unavailable('LIVE_SOURCE_REQUIRED')};
  const keys=[...query.keys()],p=query.get('page')||'1';
  if(keys.length>1||keys.some(k=>k!=='page')||!/^\d{1,5}$/.test(p)||Number(p)<1)return {status:400,data:unavailable('INVALID_SELECTION')};
  // Unattributed accounts cannot be safely released to a store-restricted principal.
  // Require authorization for the entire active StoreOps network. The pilot store list
  // is a transaction scope, not the complete network or the legal-entity customer master.
  const scope=parseObservedPilotStores(pilotStores),stores=await listStores();
  if(!scope.size||!Array.isArray(stores)||!stores.length||new Set(stores.map(s=>s.id)).size!==stores.length||[...scope].some(id=>!stores.some(s=>s.id===id))||stores.some(s=>!canAccessStore(u,s.id)))return {status:403,data:{code:'CRM_NETWORK_ACCESS_REQUIRED',error:'Accès réseau complet requis pour le référentiel.'}};
  try{return {status:200,data:projectCustomerMaster(await readMaster(),Number(p))}}catch{return {status:503,data:{...unavailable('CUSTOMER_MASTER_READ_FAILED'),code:'CUSTOMER_MASTER_READ_FAILED'}}}
 };
}
