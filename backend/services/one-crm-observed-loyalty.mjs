import {parseObservedPilotStores} from './one-crm-observed-sales.mjs';
const unavailable=reason=>({status:'UNAVAILABLE',reason,activationEnabled:false});
const day=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(Date.parse(v)).toISOString().slice(0,10)===v;
const count=v=>Number.isSafeInteger(v)&&v>=0;
const money=v=>typeof v==='number'&&Number.isFinite(v)&&Number.isSafeInteger(Math.round(v*100));
export function makeObservedLoyaltyGateway({listStores,canAccessStore,readRange,today,pilotStores=''}) {
 if([listStores,canAccessStore,readRange,today].some(f=>typeof f!=='function'))throw Error('Missing loyalty dependencies');
 return async ({session,dynamicsMode,method,query})=>{
  const u=session?.user;
  if(!['entra','local'].includes(session?.mode)||!u||!(u.role==='ops_director'||u.permissions_profile==='platform_admin'))return {status:403,data:{error:'Accès CRM professionnel requis.'}};
  if(method!=='GET')return {status:405,data:{error:'Lecture uniquement.'}};
  if(dynamicsMode!=='live')return {status:503,data:unavailable('LIVE_SOURCE_REQUIRED')};
  const keys=[...query.keys()],storeId=query.get('storeId'),date=query.get('date'),now=today();
  if(keys.length!==2||new Set(keys).size!==2||keys.some(k=>!['storeId','date'].includes(k))||!day(date)||!day(now)||date>=now||Date.parse(now)-Date.parse(date)>31*86400000)return {status:400,data:{error:'Sélectionner un magasin et une journée passée parmi les 31 derniers jours.'}};
  const scope=parseObservedPilotStores(pilotStores);
  if(!scope.size)return {status:503,data:unavailable('PILOT_SCOPE_NOT_CONFIGURED')};
  const stores=(await listStores()).filter(s=>s.id===storeId&&scope.has(s.id)&&canAccessStore(u,s.id));
  if(stores.length!==1)return {status:403,data:{error:'Magasin non autorisé.'}};
  try{
   const x=await readRange(stores,{startDate:date,endDate:date,includeStaff:false,networkScope:false});
   const r=x?.stores?.[0],e=x?.accountCreationEvidence;
   if(x?.startDate!==date||x?.endDate!==date||x?.stores?.length!==1||r?.storeId!==storeId||!Number.isFinite(Date.parse(x.generatedAt))||e?.scope!=='SELECTED_STORES')return {status:503,data:unavailable('SOURCE_EVIDENCE_INCOMPLETE')};
   const accounts=['READY','PARTIAL'].includes(r.accountCreationStatus)&&e.source==='D365/CustTableCDREntities'&&e.dateField==='SysCreatedDateTime'&&e.attribution==='EARLIEST_LOYALTY_CARD_OPERATING_UNIT'&&count(r.accountCreations)?r.accountCreations:null;
   const cards=r.status==='READY'&&r.source==='D365/RetailLoyaltyCards'&&r.enrollmentIdentityBasis==='LOYALTY_CARD'&&count(r.enrollments)?r.enrollments:null;
   const earn=r.earnStatus==='READY'&&r.earnSource==='D365/RetailLoyaltyCardRewardPointTransactionV2'&&money(r.earn)?r.earn:null;
   // Operational counts and monetary totals are already available to these authorized
   // roles through Store Analytics. No customer-level or staff records are released.
   return {status:200,data:{status:accounts!==null||cards!==null||earn!==null?'READY':'UNAVAILABLE',storeId,date,checkedAt:x.generatedAt,currency:'MAD',accountCreations:accounts,cardEnrollments:cards,accountStatus:accounts===null?'UNAVAILABLE':r.accountCreationStatus,cardStatus:cards===null?'UNAVAILABLE':'READY',walletEarn:earn,walletEarnStatus:earn===null?'UNAVAILABLE':'READY',attribution:'EARLIEST_LOYALTY_CARD_OPERATING_UNIT',activationEnabled:false}};
  }catch{return {status:503,data:unavailable('LOYALTY_READ_FAILED')}}
 };
}
