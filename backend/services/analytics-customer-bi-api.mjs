import {db} from '../db.mjs';
import {canAccessStore} from './permissions.mjs';
import {readStoreBasketEvidence} from './dynamics-sales.mjs';
import {combineBasketEvidence,compareBasketEvidence} from './customer-product-intelligence.mjs';
import {readDetentionPage} from './analytics-detention.mjs';
import {analyticsCacheKey,readAnalyticsCache,writeAnalyticsCache} from './analytics-persistent-cache.mjs';
const day=v=>{const x=String(v||''),d=new Date(x+'T12:00:00Z');return /^\d{4}-\d{2}-\d{2}$/.test(x)&&Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===x?x:null};
export function intelligenceScope(user,requested,stores){
 const allowed=stores.filter(s=>canAccessStore(user,s.id));
 if(!requested||requested==='ALL')return allowed;
 const found=allowed.filter(s=>s.id===requested);if(!found.length)throw Object.assign(new Error('Magasin interdit ou inconnu.'),{status:403});return found;
}
export async function handleCustomerBiApi({req,url,user}){
 if(req.method!=='GET'||!['/api/analytics/customer-intelligence','/api/analytics/detention'].includes(url.pathname))return null;
 const all=db.prepare('SELECT id,name,code FROM stores WHERE active=1 ORDER BY name').all(),stores=intelligenceScope(user,url.searchParams.get('storeId'),all);
 if(!stores.length)return{status:403,data:{error:'Aucun magasin accessible.'}};
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
 const key=analyticsCacheKey('customer-bi-v1',[stores.map(s=>s.id).sort().join(','),start,end,beforeStart,beforeEnd]);const cached=await readAnalyticsCache(key);if(cached)return{status:200,data:cached};
 const current=[],previous=[];for(const store of stores){const [c,p]=await Promise.all([readStoreBasketEvidence(store.id,{startDate:start,endDate:end}),readStoreBasketEvidence(store.id,{startDate:beforeStart,endDate:beforeEnd})]);current.push(c);previous.push(p)}
 const report=compareBasketEvidence(combineBasketEvidence(current),combineBasketEvidence(previous),{comparable:currentDays===previousDays&&end<today});
 report.quality.currentDayIncomplete=end===today;
 const data={...report,period:{start,end,days:currentDays},comparison:{start:beforeStart,end:beforeEnd,days:previousDays},stores,checkedAt:new Date().toISOString()};
 await writeAnalyticsCache(key,'customer-bi-v1',data,300);return{status:200,data};
}
