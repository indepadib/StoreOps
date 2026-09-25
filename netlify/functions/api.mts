import { getDatabase } from '@netlify/database';
import type { Config } from '@netlify/functions';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

declare const Netlify: {
  env: { get(key: string): string | undefined };
};

const SQLITE_PATH='/tmp/storeops-pilot.db';
const MEDIA_PATH='/tmp/storeops-media';
const LOCAL_PORT='48787';
const STATE_ID='primary';
const ADVISORY_LOCK_KEY=63876143;
const READ_METHODS=new Set(['GET','HEAD','OPTIONS']);
const REVISION_CACHE_MS=750;

type DbRuntime={dbModule:typeof import('../../backend/db.mjs')};
let dbRuntimePromise:Promise<DbRuntime>|null=null;
let runtimePromise:Promise<DbRuntime>|null=null;
let localRevision:string|null=null;
let readSyncPromise:Promise<DbRuntime>|null=null;
let revisionProbePromise:Promise<string>|null=null;
let revisionCache:{value:string|null,checkedAt:number}={value:null,checkedAt:0};

function envValue(key:string){return Netlify.env.get(key)??process.env[key]}
function bridgeBackendEnvironment(){
  const keys=[
    'AUTH_MODE','ENTRA_TENANT_ID','ENTRA_ALLOWED_TENANT_ID','ENTRA_CLIENT_ID','ENTRA_API_CLIENT_ID','ENTRA_REQUIRED_SCOPE',
    'STOREOPS_VERSION','STOREOPS_REAL_ONLY','STOREOPS_VF_MANAGER_EMAIL','STOREOPS_VF_D365_EMAIL','STOREOPS_OPS_DIRECTOR_NAME','STOREOPS_OPS_DIRECTOR_EMAIL','STOREOPS_OPS_DIRECTOR_D365_EMAIL',
    'STOREOPS_ADMIN_NAME','STOREOPS_ADMIN_MICROSOFT_EMAIL','STOREOPS_ADMIN_D365_EMAIL',
    'STOREOPS_QUALITY_AUDIT_NAME','STOREOPS_QUALITY_AUDIT_EMAIL','STOREOPS_QUALITY_AUDIT_MICROSOFT_EMAIL',
    'STOREOPS_STAFFING_SOURCE','STOREOPS_CASH_OPENING_SOURCE','STOREOPS_STOCK_SIGNALS_CACHE_SECONDS','STOREOPS_RECEIVING_HEALTH_MAX_AGE_MINUTES',
    'D365_MODE','D365_PRODUCT_READ_MODE','D365_STOCK_READ_MODE','D365_PRICE_READ_MODE','D365_PROMOTION_READ_MODE','D365_RECEIVING_READ_MODE','D365_ASSORTMENT_READ_MODE','D365_TAXONOMY_READ_MODE',
    'D365_BASE_URL','D365_TENANT_ID','D365_CLIENT_ID','D365_CLIENT_SECRET','D365_OAUTH_VERSION','D365_DATA_AREA_ID','D365_DATA_AREA_FIELD',
    'D365_BARCODE_ENTITY','D365_PRODUCT_ENTITY','D365_BARCODE_FIELD','D365_BARCODE_PRODUCT_FIELD','D365_BARCODE_DESCRIPTION_FIELD','D365_BARCODE_UNIT_FIELD','D365_PRODUCT_NUMBER_FIELD','D365_PRODUCT_NAME_FIELD',
    'D365_DEFAULT_PRICE_GROUP','D365_STORE_PRICE_GROUPS',
    'D365_BASE_PRICE_ENTITY','D365_SALES_PRICE_ENTITY','D365_RETAIL_DISCOUNT_ENTITY','D365_RETAIL_DISCOUNT_LINE_ENTITY','D365_RETAIL_DISCOUNT_PRICE_GROUP_ENTITY','D365_MIX_MATCH_LINE_GROUP_ENTITY',
    'D365_STOCK_ENTITY','D365_STOCK_PRODUCT_FIELD','D365_STOCK_NAME_FIELD','D365_STOCK_EAN_FIELD','D365_STOCK_WAREHOUSE_FIELD','D365_STOCK_AVAILABLE_FIELD','D365_STOCK_PHYSICAL_FIELD','D365_STORE_WAREHOUSES','D365_STORE_SUPPLY_WAREHOUSES','D365_DEFAULT_SUPPLY_WAREHOUSE',
    'D365_WAREHOUSE_DIRECTORY_ENTITY','D365_WAREHOUSE_DIRECTORY_ID_FIELD','D365_WAREHOUSE_DIRECTORY_NAME_FIELD','D365_WAREHOUSE_DIRECTORY_PAGE_SIZE','D365_WAREHOUSE_DIRECTORY_MAX_ROWS',
    'D365_STOCK_MAX_OUT_OF_STOCK','D365_STOCK_PAGE_SIZE','D365_STOCK_MAX_ROWS',
    'D365_PO_HEADER_ENTITY','D365_PO_LINE_ENTITY','D365_PO_NUMBER_FIELD','D365_PO_VENDOR_FIELD','D365_PO_HEADER_DATE_FIELD','D365_PO_STATUS_FIELD','D365_PO_HEADER_WAREHOUSE_FIELD',
    'D365_PO_LINE_NUMBER_FIELD','D365_PO_PRODUCT_FIELD','D365_PO_DESCRIPTION_FIELD','D365_PO_BARCODE_FIELD','D365_PO_CATEGORY_FIELD','D365_PO_ORDERED_QTY_FIELD','D365_PO_RECEIVED_QTY_FIELD','D365_PO_REMAINING_QTY_FIELD','D365_PO_UNIT_FIELD','D365_PO_LINE_DATE_FIELD','D365_PO_WAREHOUSE_FIELD','D365_PO_PAGE_SIZE','D365_PO_MAX_ROWS','D365_PO_SYNC_TOP','D365_PO_HEADER_ENRICH_LIMIT','D365_PO_SYNC_TIMEOUT_MS',
    'D365_TO_HEADER_ENTITY','D365_TO_LINE_ENTITY','D365_TO_NUMBER_FIELD','D365_TO_STATUS_FIELD','D365_TO_FROM_WAREHOUSE_FIELD','D365_TO_TO_WAREHOUSE_FIELD','D365_TO_RECEIPT_DATE_FIELD','D365_TO_LINE_NUMBER_FIELD','D365_TO_PRODUCT_FIELD','D365_TO_TRANSFER_QTY_FIELD','D365_TO_RECEIVED_QTY_FIELD','D365_TO_REMAINING_QTY_FIELD','D365_TO_UNIT_FIELD','D365_TO_LINE_DATE_FIELD','D365_TO_PAGE_SIZE','D365_TO_MAX_ROWS',
    'STOREOPS_ASSORTMENT_MAX_AGE_HOURS',
    'D365_CATEGORY_ENTITY','D365_PRODUCT_CATEGORY_ASSIGNMENT_ENTITY','D365_CATEGORY_HIERARCHY_KEY','D365_CATEGORY_ID_FIELD','D365_CATEGORY_NAME_FIELD','D365_CATEGORY_PARENT_FIELD','D365_CATEGORY_LEVEL_FIELD','D365_CATEGORY_PATH_FIELD','D365_CATEGORY_HIERARCHY_FIELD','D365_PRODUCT_CATEGORY_PRODUCT_FIELD','D365_PRODUCT_CATEGORY_CATEGORY_FIELD','D365_PRODUCT_CATEGORY_HIERARCHY_FIELD','D365_PRODUCT_CATEGORY_NAME_FIELD','D365_MERCH_PAGE_SIZE','D365_MERCH_MAX_ROWS',
    'D365_ASSORTMENT_ENTITY','D365_ASSORTMENT_STORE_FIELD','D365_ASSORTMENT_PRODUCT_FIELD','D365_ASSORTMENT_ID_FIELD','D365_ASSORTMENT_NAME_FIELD','D365_ASSORTMENT_INCLUDED_FIELD','D365_ASSORTMENT_VALID_FROM_FIELD','D365_ASSORTMENT_VALID_TO_FIELD','D365_STORE_CHANNELS','D365_ASSORTMENT_PAGE_SIZE','D365_ASSORTMENT_MAX_ROWS',
    'STOREOPS_BUSINESS_PULSE_CACHE_SECONDS','D365_SALES_READ_MODE','D365_SALES_ENTITY','D365_STORE_RETAIL_IDS','D365_SALES_STORE_FIELD','D365_SALES_DATE_FIELD','D365_SALES_DATE_FILTER_MODE','D365_SALES_TRANSACTION_FIELD','D365_SALES_NET_FIELD','D365_SALES_QTY_FIELD','D365_SALES_PRODUCT_FIELD','D365_SALES_PRODUCT_NAME_FIELD','D365_SALES_COST_FIELD','D365_SALES_TIME_FIELD','D365_SALES_DEPARTMENT_FIELD','D365_SALES_CATEGORY_FIELD','D365_SALES_SIGN','D365_SALES_COST_SIGN','D365_SALES_PAGE_SIZE','D365_SALES_MAX_ROWS',
    'D365_STOCK_BATCH_FIELD','D365_STOCK_LOCATION_FIELD','D365_STOCK_STATUS_FIELD',
    'D365_SALES_QTY_SIGN','STOREOPS_SALES_VELOCITY_CACHE_SECONDS','STOREOPS_REPLENISHMENT_LEAD_TIME_DAYS','STOREOPS_REPLENISHMENT_SAFETY_DAYS','STOREOPS_REPLENISHMENT_PACK_SIZE','STOREOPS_REPLENISHMENT_MIN_ORDER_QTY','STOREOPS_REPLENISHMENT_PROMO_FACTOR','STOREOPS_REPLENISHMENT_DAY_FACTOR','STOREOPS_LOSS_EXPORT_TEMPLATE_JSON',
    'D365_ODATA_PAGE_SIZE','D365_ODATA_MAX_ROWS','D365_REQUEST_TIMEOUT_MS','D365_COMMERCIAL_PAGE_SIZE','D365_COMMERCIAL_MAX_GROUPS','D365_COMMERCIAL_MAX_LINES','CLOSING_VARIANCE_TOLERANCE_DH'
  ];
  for(const key of keys){const value=Netlify.env.get(key);if(value!==undefined)process.env[key]=value}
  process.env.PORT=LOCAL_PORT;
  process.env.NODE_ENV='production';
  process.env.STOREOPS_DB=SQLITE_PATH;
  process.env.STOREOPS_MEDIA_DIR=MEDIA_PATH;
}

async function replaceLocalDatabase(bytes:Buffer|null){
  await mkdir(dirname(SQLITE_PATH),{recursive:true});
  await Promise.all([rm(SQLITE_PATH,{force:true}),rm(`${SQLITE_PATH}-wal`,{force:true}),rm(`${SQLITE_PATH}-shm`,{force:true})]);
  if(bytes)await writeFile(SQLITE_PATH,bytes)
}

async function waitForLocalApi(){
  const deadline=Date.now()+5000;let lastError:unknown=null;
  while(Date.now()<deadline){
    try{const response=await fetch(`http://127.0.0.1:${LOCAL_PORT}/api/health`,{cache:'no-store'});if(response.ok)return;lastError=new Error(`Health local ${response.status}`)}catch(error){lastError=error}
    await new Promise(resolve=>setTimeout(resolve,75))
  }
  throw lastError instanceof Error?lastError:new Error('Le serveur StoreOps local ne démarre pas.')
}

async function loadDbRuntime(){
  if(!dbRuntimePromise){
    bridgeBackendEnvironment();
    dbRuntimePromise=(async()=>({dbModule:await import('../../backend/db.mjs')}))()
  }
  return dbRuntimePromise
}
async function loadRuntime(){
  if(!runtimePromise){
    runtimePromise=(async()=>{
      const runtime=await loadDbRuntime();
      await import('../../backend/server.mjs');
      await waitForLocalApi();
      return runtime
    })()
  }
  return runtimePromise
}

async function refreshOpenDatabase(dbModule:typeof import('../../backend/db.mjs'),bytes:Buffer|null){
  try{dbModule.db.exec('PRAGMA wal_checkpoint(TRUNCATE);')}catch{}
  try{dbModule.db.close()}catch{}
  await replaceLocalDatabase(bytes);
  dbModule.db.open();
  dbModule.db.exec('PRAGMA foreign_keys = ON;');
  dbModule.db.exec('PRAGMA journal_mode = WAL;')
}

function forwardedHeaders(request:Request){
  const headers=new Headers(request.headers);
  for(const name of ['host','connection','content-length','transfer-encoding','origin'])headers.delete(name);
  return headers
}
async function callLocalPath(request:Request,path:string,{method='GET',body}:{method?:string,body?:BodyInit}={}){
  const init:RequestInit={method,headers:forwardedHeaders(request),cache:'no-store'};if(body!==undefined)init.body=body;
  return fetch(`http://127.0.0.1:${LOCAL_PORT}${path}`,init)
}
async function callLocalApi(request:Request){
  const incoming=new URL(request.url),body=!READ_METHODS.has(request.method)?Buffer.from(await request.arrayBuffer()):undefined;
  const upstream=await callLocalPath(request,`${incoming.pathname}${incoming.search}`,{method:request.method,body});
  const responseHeaders=new Headers(upstream.headers);for(const name of ['content-length','transfer-encoding','content-encoding','connection'])responseHeaders.delete(name);
  return new Response(await upstream.arrayBuffer(),{status:upstream.status,statusText:upstream.statusText,headers:responseHeaders})
}

function statelessHealth(request:Request){
  if(request.method!=='GET'||new URL(request.url).pathname!=='/api/health')return null;
  const startedAt=Date.now();
  const response=Response.json({ok:true,service:'StoreOps API',version:envValue('STOREOPS_VERSION')||'2.31.2',authMode:envValue('AUTH_MODE')||'entra',dynamicsMode:envValue('D365_MODE')||'simulated',configurationIssues:[],diagnostics:{source:'NETLIFY_STATELESS_HEALTH'}});
  const headers=new Headers(response.headers);headers.set('Server-Timing',`total;dur=${Math.max(0,Date.now()-startedAt)}`);headers.set('X-StoreOps-Bridge','stateless');
  return new Response(response.body,{status:response.status,headers})
}

async function lightSession(request:Request){
  const authMode=String(envValue('AUTH_MODE')||'entra').toLowerCase();
  if(authMode==='local')return null;
  const {readOnlySessionFromRequest}=await import('../../backend/auth/session-readonly.mjs');
  return readOnlySessionFromRequest(request)
}
async function handleLightRoute(request:Request,runtime:DbRuntime){
  if(request.method!=='GET')return null;
  const url=new URL(request.url),path=url.pathname;
  if(path!=='/api/bootstrap'&&path!=='/api/session'&&path!=='/api/stores'&&!/^\/api\/stores\/[^/]+\/(manager-home-fast|manager-inbox-batch|business-pulse|business-pulse\/stockouts)$/.test(path))return null;
  const session=await lightSession(request);if(!session)return null;
  const user=session.user;
  if(path==='/api/bootstrap'){
    const {runtimeBootstrap}=await import('../../backend/services/runtime-bootstrap-api.mjs');
    return Response.json(runtimeBootstrap(user),{headers:{'X-StoreOps-Fast-Path':'bootstrap'}})
  }
  if(path==='/api/session'){
    const availableDemoUsers=session.mode==='demo'?runtime.dbModule.db.prepare(`SELECT id,name,role,store_id FROM users WHERE active=1 ORDER BY role,name`).all():[];
    return Response.json({user:{id:user.id,name:user.name,email:user.email,role:user.role,store_id:user.store_id,permissions_profile:user.permissions_profile||null},authMode:session.mode,availableDemoUsers},{headers:{'X-StoreOps-Fast-Path':'session'}})
  }
  const {canAccessStore}=await import('../../backend/services/permissions.mjs');
  if(path==='/api/stores'){
    const stores=runtime.dbModule.db.prepare(`SELECT * FROM stores WHERE active=1 ORDER BY name`).all().filter((s:any)=>canAccessStore(user,s.id));
    return Response.json(stores,{headers:{'X-StoreOps-Fast-Path':'stores'}})
  }
  const match=path.match(/^\/api\/stores\/([^/]+)\/(manager-home-fast|manager-inbox-batch|business-pulse|business-pulse\/stockouts)$/);
  if(match){
    const storeId=decodeURIComponent(match[1]),resource=match[2];
    if(!canAccessStore(user,storeId))return Response.json({error:'Accès interdit à ce magasin.'},{status:403});
    const businessDate=url.searchParams.get('date')||new Date().toISOString().slice(0,10),force=url.searchParams.get('force')==='1';
    if(resource==='manager-home-fast'){
      const {getManagerHomeFast}=await import('../../backend/services/manager-home-fast.mjs');
      return Response.json(getManagerHomeFast(storeId,businessDate,{force}),{headers:{'X-StoreOps-Fast-Path':'manager-home'}})
    }
    if(resource==='manager-inbox-batch'){
      const {getManagerInboxBatch}=await import('../../backend/services/manager-inbox-batch.mjs');
      return Response.json(await getManagerInboxBatch(storeId,businessDate,{force}),{headers:{'X-StoreOps-Fast-Path':'manager-inbox'}})
    }
    if(resource==='business-pulse/stockouts'){
      const {getStockSignals}=await import('../../backend/services/stock-signals.mjs');
      const data=await getStockSignals(storeId,{businessDate,force});
      return Response.json({status:data?.summary?.ruptureReady?'READY':'UNAVAILABLE',storeId,businessDate,checkedAt:data.checkedAt||null,source:data.source||null,summary:data.summary||{},cache:data.cache||null},{headers:{'X-StoreOps-Fast-Path':'business-pulse-stockouts'}})
    }
    const {getBusinessPulse,clearBusinessPulseCache}=await import('../../backend/services/business-pulse.mjs');
    let pulse=await getBusinessPulse(storeId,businessDate,{force});
    if(pulse?.status==='UNAVAILABLE'){
      const {ensureD365SalesAutoConnected}=await import('../../backend/services/d365-sales-autoconnect.mjs');
      const autoConnect=await ensureD365SalesAutoConnected(storeId);
      if(autoConnect?.connected){
        clearBusinessPulseCache(storeId);
        pulse=await getBusinessPulse(storeId,businessDate,{force:true});
        pulse={...pulse,autoConnected:true};
      }else pulse={...pulse,autoConnect:{status:autoConnect?.status||'UNAVAILABLE',reason:autoConnect?.reason||null,diagnostics:autoConnect?.diagnostics||null}};
    }
    return Response.json(pulse,{headers:{'X-StoreOps-Fast-Path':'business-pulse'}})
  }
  return null
}

async function authenticatedUser(request:Request,runtime:DbRuntime){
  const response=await callLocalPath(request,'/api/session');
  if(!response.ok)return{response:new Response(await response.arrayBuffer(),{status:response.status,headers:{'content-type':'application/json'}}),user:null};
  const session:any=await response.json(),user=runtime.dbModule.db.prepare(`SELECT * FROM users WHERE id=? AND active=1`).get(session?.user?.id);
  return{response:null,user}
}
async function handleV168Route(request:Request,runtime:DbRuntime){
  const url=new URL(request.url),path=url.pathname;
  if(request.method==='GET'&&(path==='/api/dynamics/diagnostics'||path==='/api/dynamics/probe')){
    const auth=await authenticatedUser(request,runtime);if(auth.response)return auth.response;
    if(auth.user?.role!=='ops_director')return Response.json({error:'Réservé à la Direction StoreOps'},{status:403});
    const dynamics=await import('../../backend/services/dynamics.mjs');
    if(path==='/api/dynamics/diagnostics')return Response.json(await dynamics.getDynamicsDiagnostics({forceToken:url.searchParams.get('force')==='1'}));
    return Response.json(await dynamics.probeDataEntity(url.searchParams.get('entity')||'',{top:Number(url.searchParams.get('top')||1),filter:url.searchParams.get('filter')||''}))
  }
  if(request.method==='GET'&&path==='/api/stores'){
    const auth=await authenticatedUser(request,runtime);if(auth.response)return auth.response;
    if(auth.user?.permissions_profile==='quality_audit')return Response.json(runtime.dbModule.db.prepare(`SELECT * FROM stores WHERE active=1 ORDER BY name`).all())
  }
  return null
}

async function persistSnapshot(client:any,dbModule:typeof import('../../backend/db.mjs')){
  dbModule.db.exec('PRAGMA wal_checkpoint(TRUNCATE);');
  const bytes=await readFile(SQLITE_PATH);
  const result=await client.query(`INSERT INTO storeops_sqlite_state(id,db_bytes,revision,updated_at) VALUES($1,$2,1,NOW()) ON CONFLICT(id) DO UPDATE SET db_bytes=EXCLUDED.db_bytes,revision=storeops_sqlite_state.revision+1,updated_at=NOW() RETURNING revision`,[STATE_ID,bytes]);
  return String(result.rows[0].revision)
}
function rememberRevision(revision:string){localRevision=revision;revisionCache={value:revision,checkedAt:Date.now()}}
async function probeCentralRevision(database:any){
  const now=Date.now();if(revisionCache.value!==null&&now-revisionCache.checkedAt<REVISION_CACHE_MS)return revisionCache.value;if(revisionProbePromise)return revisionProbePromise;
  revisionProbePromise=(async()=>{const client=await database.pool.connect();try{const state=await client.query('SELECT revision FROM storeops_sqlite_state WHERE id=$1',[STATE_ID]);const revision=state.rows[0]?String(state.rows[0].revision):'0';revisionCache={value:revision,checkedAt:Date.now()};return revision}finally{client.release()}})();
  try{return await revisionProbePromise}finally{revisionProbePromise=null}
}
async function initializeCentralRuntime(database:any){
  const client=await database.pool.connect();let committed=false;
  try{
    await client.query('BEGIN');await client.query('SELECT pg_advisory_xact_lock($1)',[ADVISORY_LOCK_KEY]);
    const state=await client.query('SELECT db_bytes,revision FROM storeops_sqlite_state WHERE id=$1',[STATE_ID]),row=state.rows[0]||null,revision=row?String(row.revision):'0',bytes=row?.db_bytes?Buffer.from(row.db_bytes):null;
    if(!dbRuntimePromise)await replaceLocalDatabase(bytes);
    const runtime=await loadRuntime();if(localRevision!==null&&revision!==localRevision)await refreshOpenDatabase(runtime.dbModule,bytes);
    if(row)rememberRevision(revision);else rememberRevision(await persistSnapshot(client,runtime.dbModule));
    await client.query('COMMIT');committed=true;return runtime
  }catch(error){localRevision=null;revisionCache={value:null,checkedAt:0};if(!committed)await client.query('ROLLBACK').catch(()=>{});throw error}finally{client.release()}
}
async function syncReadRuntime(database:any){
  if(dbRuntimePromise&&localRevision!==null){
    const targetRevision=await probeCentralRevision(database);
    if(localRevision===targetRevision)return loadDbRuntime()
  }
  if(readSyncPromise)return readSyncPromise;
  readSyncPromise=(async()=>{
    const client=await database.pool.connect();let row:any=null;
    try{const state=await client.query('SELECT db_bytes,revision FROM storeops_sqlite_state WHERE id=$1',[STATE_ID]);row=state.rows[0]||null}finally{client.release()}
    if(!row)return initializeCentralRuntime(database);
    const revision=String(row.revision),bytes=row.db_bytes?Buffer.from(row.db_bytes):null;
    if(!dbRuntimePromise)await replaceLocalDatabase(bytes);
    const runtime=await loadDbRuntime();
    if(localRevision!==null&&revision!==localRevision)await refreshOpenDatabase(runtime.dbModule,bytes);
    rememberRevision(revision);return runtime
  })();
  try{return await readSyncPromise}finally{readSyncPromise=null}
}

function withTiming(response:Response,mode:'read-light'|'read-fast'|'write-sync',startedAt:number,syncAt:number,runtimeAt:number,backendAt:number){
  const headers=new Headers(response.headers),now=Date.now(),state=Math.max(0,syncAt-startedAt),runtime=Math.max(0,runtimeAt-syncAt),backend=Math.max(0,backendAt-runtimeAt),total=Math.max(0,now-startedAt);
  headers.set('Server-Timing',`state;dur=${state}, runtime;dur=${runtime}, backend;dur=${backend}, total;dur=${total}`);headers.set('X-StoreOps-Bridge',mode);if(localRevision!==null)headers.set('X-StoreOps-Revision',localRevision);
  return new Response(response.body,{status:response.status,statusText:response.statusText,headers})
}
async function serveRead(request:Request,database:any){
  const startedAt=Date.now(),runtime=await syncReadRuntime(database),syncAt=Date.now();
  const light=await handleLightRoute(request.clone(),runtime),lightAt=Date.now();
  if(light)return withTiming(light,'read-light',startedAt,syncAt,lightAt,lightAt);
  const fullRuntime=await loadRuntime(),runtimeAt=Date.now();
  const response=await handleV168Route(request.clone(),fullRuntime)||await callLocalApi(request),backendAt=Date.now();
  return withTiming(response,'read-fast',startedAt,syncAt,runtimeAt,backendAt)
}
async function serveWrite(request:Request,database:any){
  const startedAt=Date.now(),client=await database.pool.connect();let committed=false;
  try{
    await client.query('BEGIN');await client.query('SELECT pg_advisory_xact_lock($1)',[ADVISORY_LOCK_KEY]);
    const state=await client.query('SELECT db_bytes,revision FROM storeops_sqlite_state WHERE id=$1',[STATE_ID]),row=state.rows[0]||null,revision=row?String(row.revision):'0',bytes=row?.db_bytes?Buffer.from(row.db_bytes):null;
    if(!dbRuntimePromise)await replaceLocalDatabase(bytes);
    const runtime=await loadRuntime();if(localRevision!==null&&revision!==localRevision)await refreshOpenDatabase(runtime.dbModule,bytes);if(localRevision===null)localRevision=revision;
    const syncAt=Date.now(),runtimeAt=syncAt,response=await handleV168Route(request.clone(),runtime)||await callLocalApi(request),backendAt=Date.now(),nextRevision=await persistSnapshot(client,runtime.dbModule);
    await client.query('COMMIT');committed=true;rememberRevision(nextRevision);return withTiming(response,'write-sync',startedAt,syncAt,runtimeAt,backendAt)
  }catch(error){localRevision=null;revisionCache={value:null,checkedAt:0};if(!committed)await client.query('ROLLBACK').catch(()=>{});throw error}finally{client.release()}
}

function errorResponse(error:unknown){
 const e=error as any,status=Number(e?.status)||503;
 return Response.json({error:status>=500?'Backend StoreOps indisponible':e?.message||'Requête refusée',code:e?.code||'STOREOPS_PUBLIC_BACKEND_FAILED',details:status>=500?(e instanceof Error?e.message:String(e)):undefined},{status})
}

export default async(request:Request)=>{
  const stateless=statelessHealth(request);if(stateless)return stateless;
  const database=getDatabase();
  try{return READ_METHODS.has(request.method)?await serveRead(request,database):await serveWrite(request,database)}catch(error){console.error('StoreOps public API failure',error);return errorResponse(error)}
};

export const config:Config={path:'/api/*'};
