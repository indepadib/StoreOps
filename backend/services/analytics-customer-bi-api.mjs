import {prepareReceiptHistory,readReceiptHistory} from './analytics-receipt-history.mjs';
import {prepareAnalyticsStock} from './dynamics-stock.mjs';
import {readArticleReference} from './analytics-article-reference.mjs';
import {db} from '../db.mjs';
import {canAccessStore} from './permissions.mjs';
import {readStoreBasketEvidence,salesIntegrationConfig} from './dynamics-sales.mjs';
import {combineBasketEvidence,compareBasketEvidence} from './customer-product-intelligence.mjs';
import {readDetentionPage} from './analytics-detention.mjs';
import {analyticsCacheKey,readAnalyticsCache,writeAnalyticsCache} from './analytics-persistent-cache.mjs';
import {buildCustomerRetentionResearch} from './analytics-customer-research.mjs';
import {readStoreLoyaltyEnrollments} from './dynamics-loyalty.mjs';
const day=v=>{const x=String(v||''),d=new Date(x+'T12:00:00Z');return /^\d{4}-\d{2}-\d{2}$/.test(x)&&Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===x?x:null};
export function intelligenceScope(user,requested,stores){
 const allowed=stores.filter(s=>canAccessStore(user,s.id));
 if(!requested||requested==='ALL')return allowed;
 const found=allowed.filter(s=>s.id===requested);if(!found.length)throw Object.assign(new Error('Magasin interdit ou inconnu.'),{status:403});return found;
}
export async function handleCustomerBiApi({req,url,user}){
 if(req.method!=='GET'||!['/api/analytics/customer-intelligence','/api/analytics/detention','/api/analytics/detention/prepare','/api/analytics/detention/history','/api/analytics/detention/history/prepare','/api/analytics/article-reference','/api/analytics/intelligence-scope','/api/analytics/customer-intelligence/prepare','/api/analytics/customer-research','/api/analytics/customer-base'].includes(url.pathname))return null;
 const all=db.prepare('SELECT id,name,code FROM stores WHERE active=1 ORDER BY name').all();let stores=intelligenceScope(user,url.searchParams.get('storeId'),all);
 const requestedIds=(url.searchParams.get('storeIds')||'').split(',').filter(Boolean);
 if(requestedIds.length){if(requestedIds.some(id=>!stores.some(s=>s.id===id)))return{status:403,data:{error:'Périmètre magasin interdit.'}};stores=stores.filter(s=>requestedIds.includes(s.id))}
 const excludedStores=stores.filter(s=>!salesIntegrationConfig(s.id).ready).map(s=>({...s,reason:'Connexion ventes non configurée'}));
 if(url.pathname.endsWith('/intelligence-scope'))return{status:200,data:{stores:stores.filter(s=>salesIntegrationConfig(s.id).ready),excludedStores}};
 if(url.pathname.includes('customer-intelligence')||url.pathname==='/api/analytics/customer-research'||url.pathname==='/api/analytics/customer-base'){
  if(url.searchParams.get('storeId')&&url.searchParams.get('storeId')!=='ALL'&&excludedStores.length)return{status:422,data:{error:'Ce magasin ne dispose pas de connexion ventes configurée.'}};
  stores=stores.filter(s=>salesIntegrationConfig(s.id).ready);
 }
 // Cohort research is cache-first. It never launches dozens of Dynamics reads
 // inside a synchronous Netlify request. Missing days are prepared separately.
 if(url.pathname==='/api/analytics/customer-research'){
  const start=day(url.searchParams.get('start')),end=day(url.searchParams.get('end')),compareStart=day(url.searchParams.get('compareStart')),compareEnd=day(url.searchParams.get('compareEnd'));
  const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Africa/Casablanca'}).format(new Date());
  const span=(a,b)=>Math.round((Date.parse(b)-Date.parse(a))/86400000)+1;
  if(!start||!end||!compareStart||!compareEnd||start>end||compareStart>compareEnd||compareEnd>=start||end>=today||span(start,end)>31||span(compareStart,compareEnd)>31)
   return{status:400,data:{error:'Fenêtres terminées, non chevauchantes, de 31 jours maximum. La journée en cours est exclue.'}};
  if(!stores.length||excludedStores.length)return{status:422,data:{status:'UNAVAILABLE',error:'Source tickets manquante sur au moins un magasin du périmètre.',excludedStores}};
  const scope=stores.map(x=>x.id).sort().join(','),cacheKey=analyticsCacheKey('customer-research-v1',[scope,start,end,compareStart,compareEnd]);
  const cached=await readAnalyticsCache(cacheKey);
  if(cached)return{status:200,data:cached};
  const missing=[];const windows=[[compareStart,compareEnd],[start,end]];
  for(const store of stores)for(const [a,b] of windows){
   let cursor=a;
   for(let i=0;i<31&&cursor<=b;i++){
    const present=await readAnalyticsCache(analyticsCacheKey('basket-evidence-v3',[store.id,cursor,cursor]));
    if(!present)missing.push({storeId:store.id,date:cursor});
    const d=new Date(cursor+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+1);cursor=d.toISOString().slice(0,10)
   }
  }
  if(missing.length)return{status:200,data:{status:'PREPARATION_REQUIRED',tasks:missing.slice(0,12),missingDays:missing.length,
   message:'Les journées manquantes se préparent par petits lots pour éviter les erreurs 504.'}};
  const perStore=await Promise.all(stores.map(async s=>{
   const [previous,current]=await Promise.all([
    readStoreBasketEvidence(s.id,{startDate:compareStart,endDate:compareEnd}),
    readStoreBasketEvidence(s.id,{startDate:start,endDate:end})
   ]);return{previous,current}
  }));
  const products=db.prepare("SELECT product_number AS productNumber,product_name AS productName FROM product_identity_cache WHERE product_name LIKE '%orange%' OR product_name LIKE '%ORANGE%' OR product_name LIKE '%poulet%' OR product_name LIKE '%POULET%' OR product_name LIKE '%chicken%' OR product_name LIKE '%CHICKEN%'").all();
  const productNames=Object.fromEntries(products.filter(x=>x.productNumber&&x.productName).map(x=>[x.productNumber,x.productName]));
  const report=buildCustomerRetentionResearch({
   previousEvidence:combineBasketEvidence(perStore.map(x=>x.previous)),
   currentEvidence:combineBasketEvidence(perStore.map(x=>x.current)),
   productNames,storeIds:stores.map(x=>x.id),period:{start,end},comparison:{start:compareStart,end:compareEnd}
  });
  const data={...report,selectedStores:stores.map(s=>({id:s.id,name:s.name})),checkedAt:new Date().toISOString()};
  await writeAnalyticsCache(cacheKey,'customer-research-v1',data,600);
  return{status:200,data}
 }
 // A true recruitment count comes from D365 enrollment records, not first
 // observed tickets. The caller must supply a known opening/historical start.
 if(url.pathname==='/api/analytics/customer-base'){
  const start=day(url.searchParams.get('historyStart')),end=day(url.searchParams.get('end'));
  const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Africa/Casablanca'}).format(new Date());
  if(!start||!end||start>end||end>today||Date.parse(end)-Date.parse(start)>2*366*86400000)
   return{status:400,data:{error:'Date de départ historique vérifiée et date de fin requises (deux années maximum).'}};
  if(!stores.length)return{status:422,data:{error:'Aucun magasin avec fidélité configurée.'}};
  const scope=stores.map(x=>x.id).sort().join(','),key=analyticsCacheKey('customer-base-lifetime-v1',[scope,start,end]);
  const cached=await readAnalyticsCache(key);if(cached)return{status:200,data:cached};
  const readings=await Promise.all(stores.map(async s=>{
   try{return{store:s,reading:await readStoreLoyaltyEnrollments(s.id,{startDate:start,endDate:end})}}
   catch(error){return{store:s,reading:{status:'UNAVAILABLE',error:{code:error.code||'SOURCE_FAILED',message:error.message}}}}
  }));
  const safe=readings.map(({store,reading})=>({storeId:store.id,storeName:store.name,
   status:reading.status,source:reading.source||null,enrollments:reading.status==='READY'&&!reading.truncated?reading.total:null,
   identityBasis:reading.identityBasis||null,truncated:!!reading.truncated,error:reading.error||null}));
  const complete=safe.every(x=>x.status==='READY'&&!x.truncated),distinctPossible=complete&&safe.every(x=>x.identityBasis==='CUSTOMER_ACCOUNT');
  const identities=new Set();
  if(distinctPossible)for(const x of readings)for(const row of x.reading.items||[])if(row.customerAccount)identities.add(row.customerAccount);
  const out={status:complete?'READY':'PARTIAL',historyStart:start,end,
   openingDateCertified:false,
   note:'Cumul depuis la date de départ historique choisie ; cette date ne prouve pas la date officielle d’ouverture.',
   enrollments:complete?safe.reduce((n,x)=>n+x.enrollments,0):null,
   distinctRegisteredCustomers:distinctPossible?identities.size:null,
   distinctIdentityCoverage:distinctPossible?'ALL_STORES_CUSTOMER_ACCOUNT':'MISSING_CUSTOMER_ID_OR_PARTIAL',
   stores:safe,provenance:'D365 Loyalty Card enrollment dates',checkedAt:new Date().toISOString()};
  await writeAnalyticsCache(key,'customer-base-lifetime-v1',out,1800);
  return{status:200,data:out};
 }
 if(url.pathname==='/api/analytics/customer-intelligence/prepare'){
  const date=day(url.searchParams.get('date')),today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Africa/Casablanca'}).format(new Date());
  if(!date||date>today||stores.length!==1)return{status:400,data:{error:'Une journée et un magasin connecté sont requis.'}};
  const evidence=await readStoreBasketEvidence(stores[0].id,{startDate:date,endDate:date});
  return{status:200,data:{status:'READY',storeId:stores[0].id,date,tickets:evidence.baskets.length}};
 }
 if(!stores.length&&!url.pathname.includes('customer-intelligence'))return{status:403,data:{error:'Aucun magasin accessible.'}};
 if(url.pathname.startsWith('/api/analytics/detention/history')){if(stores.length!==1)return{status:400,data:{error:'Un magasin requis.'}};const kind=url.searchParams.get('kind')==='supply'?'supply':'store';return{status:200,data:url.pathname.endsWith('/prepare')?await prepareReceiptHistory(stores[0].id,{kind,cursor:Math.max(0,Math.floor(Number(url.searchParams.get('cursor'))||0)),snapshot:url.searchParams.get('snapshot')}):await readReceiptHistory(stores[0].id,kind)}}
 if(url.pathname==='/api/analytics/detention/prepare'){if(stores.length!==1)return{status:400,data:{error:'Un magasin requis.'}};const kind=url.searchParams.get('kind')==='supply'?'supply':'store';return{status:200,data:await prepareAnalyticsStock(stores[0].id,{kind,offset:Math.max(0,Math.floor(Number(url.searchParams.get('offset'))||0)),snapshot:url.searchParams.get('snapshot'),force:url.searchParams.get('force')==='1'})}}
 if(url.pathname.endsWith('/article-reference'))return{status:200,data:await readArticleReference({offset:Math.max(0,Math.floor(Number(url.searchParams.get('offset'))||0)),limit:Math.max(1,Math.min(40,Math.floor(Number(url.searchParams.get('limit'))||40))),expectedSnapshot:url.searchParams.get('snapshot')})};
 if(url.pathname.endsWith('/detention')){
  if(stores.length!==1)return{status:400,data:{error:'Choisir un magasin par lecture de détention.'}};
  const offset=Math.max(0,Math.floor(Number(url.searchParams.get('offset'))||0)),limit=Math.max(1,Math.min(240,Math.floor(Number(url.searchParams.get('limit'))||120)));
  return{status:200,data:await readDetentionPage(stores[0],{offset,limit,expectedSnapshot:url.searchParams.get('snapshot'),force:url.searchParams.get('force')==='1'&&offset===0})};
 }
 const start=day(url.searchParams.get('start')),end=day(url.searchParams.get('end')),beforeStart=day(url.searchParams.get('compareStart')),beforeEnd=day(url.searchParams.get('compareEnd'));
 if(!start||!end||!beforeStart||!beforeEnd||start>end||beforeStart>beforeEnd||beforeEnd>=start)return{status:400,data:{error:'Deux périodes valides et sans chevauchement sont requises (comparaison avant analyse).'}};
 const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Africa/Casablanca'}).format(new Date());
 if(end>today)return{status:400,data:{error:'Une période future ne peut pas être analysée comme des ventes réalisées.'}};
 const span=(a,b)=>Math.round((Date.parse(b)-Date.parse(a))/86400000)+1,currentDays=span(start,end),previousDays=span(beforeStart,beforeEnd);
 if(currentDays>31||previousDays>31)return{status:400,data:{error:'31 jours maximum par fenêtre.'}};
 if(!stores.length)return{status:422,data:{error:'Aucun magasin du périmètre ne dispose de connexion ventes configurée.',excludedStores}};
 const includeNonreturn=url.searchParams.get('nonreturn')==='1', cacheVersion=includeNonreturn?'customer-bi-nonreturn-v1':'customer-bi-v4';
 const key=analyticsCacheKey(cacheVersion,[stores.map(s=>s.id).sort().join(','),start,end,beforeStart,beforeEnd]);const cached=await readAnalyticsCache(key);if(cached)return{status:200,data:cached};
 if(url.searchParams.get('preparedOnly')==='1'){
  const tasks=[];for(const store of stores)for(const [a,b] of [[start,end],[beforeStart,beforeEnd]]){const exact=await readAnalyticsCache(analyticsCacheKey('basket-evidence-v3',[store.id,a,b]));if(exact)continue;for(let date=a;date<=b;){if(!await readAnalyticsCache(analyticsCacheKey('basket-evidence-v3',[store.id,date,date])))tasks.push({storeId:store.id,date});const d=new Date(date+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+1);date=d.toISOString().slice(0,10)}}
  if(tasks.length)return{status:202,data:{status:'PREPARATION_REQUIRED',tasks}};
 }
 const current=[],previous=[];for(const store of stores){const [c,p]=await Promise.all([readStoreBasketEvidence(store.id,{startDate:start,endDate:end}),readStoreBasketEvidence(store.id,{startDate:beforeStart,endDate:beforeEnd})]);current.push(c);previous.push(p)}
 const report=compareBasketEvidence(combineBasketEvidence(current),combineBasketEvidence(previous),{currentEndDate:end,includeNonreturn,comparable:currentDays===previousDays&&end<today});
 report.quality.currentDayIncomplete=end===today;
 const data={...report,period:{start,end,days:currentDays},comparison:{start:beforeStart,end:beforeEnd,days:previousDays},stores,excludedStores,evidenceReadAt:current.concat(previous).map(x=>({storeId:x.storeId,checkedAt:x.checkedAt||null})),checkedAt:new Date().toISOString()};
 await writeAnalyticsCache(key,cacheVersion,data,300);return{status:200,data};
}
