import {randomUUID} from 'node:crypto';
import {db} from '../db.mjs';
import {canAccessStore,canAccessWarehouse} from './permissions.mjs';
import {storeOperationalSettings} from './store-settings.mjs';
import {analyticsCacheKey,readAnalyticsCacheFresh,writeAnalyticsCache} from './analytics-persistent-cache.mjs';

export const replenishmentKey=id=>analyticsCacheKey('replenishment-job-v1',[id]);
export const replenishmentPage=(id,index)=>analyticsCacheKey('replenishment-page-v1',[id,index]);
const response=(status,data)=>({status,data});
const failure=(status,error)=>response(status,{error});
const expiry=3600;
const alive=job=>Date.now()-Date.parse(job.updatedAt)<16*60_000;

export async function handleReplenishmentApi({req,url,user}){
 const prefix='/api/analytics/replenishment';
 if(url.pathname!==prefix&&!url.pathname.startsWith(prefix+'/'))return null;
 const path=url.pathname.slice(prefix.length);
 const stores=db.prepare('SELECT id,name FROM stores WHERE active=1 ORDER BY name').all().flatMap(store=>{
  const settings=storeOperationalSettings(store.id);
  return settings.storeWarehouseId&&settings.supplyWarehouseId?[{...store,warehouse:settings.supplyWarehouseId,destination:settings.storeWarehouseId}]:[];
 });
 const allowed=stores.filter(s=>s.warehouse&&canAccessStore(user,s.id));
 const warehouses=canAccessWarehouse(user)?[...new Set(stores.map(s=>s.warehouse).filter(Boolean))]:[];
 if(req.method==='GET'&&path==='/scopes')return response(200,{stores:allowed,warehouses});
 if(req.method==='POST'&&path==='/jobs'){
  const mode=url.searchParams.get('mode'),scope=url.searchParams.get('scope');
  if(!['TO','PO'].includes(mode)||!scope)return failure(400,'Choisis un flux et un périmètre.');
  const selected=mode==='TO'?allowed.filter(s=>s.id===scope):warehouses.includes(scope)?stores.filter(s=>s.warehouse===scope):[];
  if(!selected.length)return failure(403,'Périmètre non autorisé ou sans entrepôt associé.');
  const warehouse=mode==='PO'?scope:selected[0].warehouse;
  const active=analyticsCacheKey('replenishment-active-v1',[user.id,mode,scope]);
  const previous=await readAnalyticsCacheFresh(active,{strict:true});
  if(previous?.jobId){
   const job=await readAnalyticsCacheFresh(replenishmentKey(previous.jobId),{strict:true});
   if(job&&['QUEUED','RUNNING'].includes(job.status)&&alive(job))return response(202,{jobId:job.id});
  }
  const id=randomUUID(),updatedAt=new Date().toISOString(),job={id,userId:user.id,input:{mode,warehouse,stores:selected},status:'QUEUED',updatedAt,revision:1};
  if(!await writeAnalyticsCache(replenishmentKey(id),'replenishment-job-v1',job,expiry))return failure(503,'La préparation est momentanément indisponible.');
  await writeAnalyticsCache(active,'replenishment-active-v1',{jobId:id},expiry);
  const origin=(process.env.DEPLOY_PRIME_URL||process.env.URL||'https://storeops.ma').replace(/\/$/,'');
  try{
   const started=await fetch(origin+'/.netlify/functions/analytics-replenishment-background',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jobId:id}),signal:AbortSignal.timeout(8000)});
   if(!started.ok)throw new Error('Worker indisponible');
  }catch{
   await writeAnalyticsCache(replenishmentKey(id),'replenishment-job-v1',{...job,status:'FAILED',message:'La préparation a échoué au démarrage.'},expiry);
   return failure(503,'La préparation a échoué au démarrage.');
  }
  return response(202,{jobId:id});
 }
 const match=path.match(/^\/jobs\/([a-f0-9-]{36})(?:\/pages\/(\d+))?$/i);
 if(req.method!=='GET'||!match)return failure(404,'Ressource introuvable.');
 const [,id,page]=match,job=await readAnalyticsCacheFresh(replenishmentKey(id),{strict:true});
 if(!job||job.userId!==user.id)return failure(404,'Proposition introuvable ou expirée.');
 if(job.input.mode==='PO'?!canAccessWarehouse(user):!allowed.some(s=>s.id===job.input.stores[0].id))return failure(403,'Périmètre non autorisé.');
 if(page===undefined){
  if(['QUEUED','RUNNING'].includes(job.status)&&!alive(job))return response(200,{status:'FAILED',message:'La préparation a expiré. Relance la génération.'});
  return response(200,{status:job.status,message:job.message,progress:job.progress,summary:job.summary,pages:job.pages});
 }
 if(job.status!=='READY'||Number(page)>=job.pages)return failure(404,'Page de proposition indisponible.');
 const rows=await readAnalyticsCacheFresh(replenishmentPage(id,Number(page)),{strict:true});
 return Array.isArray(rows)?response(200,{rows}):failure(404,'Cette page de proposition a expiré.');
}
