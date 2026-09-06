import { getDatabase } from '@netlify/database';
import type { Config } from '@netlify/functions';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

// Netlify exposes this global at runtime. We deliberately read deployment
// configuration through Netlify.env and only bridge the values required by
// the existing StoreOps Node backend after the Function starts.
declare const Netlify: {
  env: { get(key: string): string | undefined };
};

const SQLITE_PATH='/tmp/storeops-pilot.db';
const MEDIA_PATH='/tmp/storeops-media';
const LOCAL_PORT='48787';
const STATE_ID='primary';
const ADVISORY_LOCK_KEY=63876143;

let runtimePromise: Promise<{dbModule: typeof import('../../backend/db.mjs')}> | null=null;
let localRevision: string | null=null;

function bridgeBackendEnvironment(){
  const keys=[
    'AUTH_MODE','ENTRA_TENANT_ID','ENTRA_ALLOWED_TENANT_ID','ENTRA_CLIENT_ID','ENTRA_API_CLIENT_ID','ENTRA_REQUIRED_SCOPE',
    'STOREOPS_VERSION','STOREOPS_VF_MANAGER_EMAIL','STOREOPS_VF_D365_EMAIL','STOREOPS_OPS_DIRECTOR_NAME','STOREOPS_OPS_DIRECTOR_EMAIL','STOREOPS_OPS_DIRECTOR_D365_EMAIL',
    'STOREOPS_ADMIN_NAME','STOREOPS_ADMIN_MICROSOFT_EMAIL','STOREOPS_ADMIN_D365_EMAIL',
    'STOREOPS_QUALITY_AUDIT_NAME','STOREOPS_QUALITY_AUDIT_EMAIL','STOREOPS_QUALITY_AUDIT_MICROSOFT_EMAIL',
    'STOREOPS_STAFFING_SOURCE','STOREOPS_CASH_OPENING_SOURCE',
    'D365_MODE','D365_PRODUCT_READ_MODE','D365_STOCK_READ_MODE','D365_PRICE_READ_MODE','D365_PROMOTION_READ_MODE',
    'D365_BASE_URL','D365_TENANT_ID','D365_CLIENT_ID','D365_CLIENT_SECRET','D365_OAUTH_VERSION','D365_DATA_AREA_ID','D365_DATA_AREA_FIELD',
    'D365_BARCODE_ENTITY','D365_PRODUCT_ENTITY','D365_BARCODE_FIELD','D365_BARCODE_PRODUCT_FIELD','D365_BARCODE_DESCRIPTION_FIELD','D365_BARCODE_UNIT_FIELD','D365_PRODUCT_NUMBER_FIELD','D365_PRODUCT_NAME_FIELD',
    'D365_DEFAULT_PRICE_GROUP','D365_STORE_PRICE_GROUPS',
    'D365_BASE_PRICE_ENTITY','D365_SALES_PRICE_ENTITY','D365_RETAIL_DISCOUNT_ENTITY','D365_RETAIL_DISCOUNT_LINE_ENTITY','D365_RETAIL_DISCOUNT_PRICE_GROUP_ENTITY','D365_MIX_MATCH_LINE_GROUP_ENTITY',
    'D365_STOCK_ENTITY','D365_STOCK_PRODUCT_FIELD','D365_STOCK_NAME_FIELD','D365_STOCK_EAN_FIELD','D365_STOCK_WAREHOUSE_FIELD','D365_STOCK_AVAILABLE_FIELD','D365_STOCK_PHYSICAL_FIELD','D365_STORE_WAREHOUSES',
    'D365_STOCK_MAX_OUT_OF_STOCK','D365_STOCK_PAGE_SIZE','D365_STOCK_MAX_ROWS','D365_ODATA_PAGE_SIZE','D365_ODATA_MAX_ROWS','CLOSING_VARIANCE_TOLERANCE_DH'
  ];
  for(const key of keys){
    const value=Netlify.env.get(key);
    if(value!==undefined)process.env[key]=value;
  }
  process.env.PORT=LOCAL_PORT;
  process.env.NODE_ENV='production';
  process.env.STOREOPS_DB=SQLITE_PATH;
  process.env.STOREOPS_MEDIA_DIR=MEDIA_PATH;
}

async function replaceLocalDatabase(bytes: Buffer | null){
  await mkdir(dirname(SQLITE_PATH),{recursive:true});
  await Promise.all([
    rm(SQLITE_PATH,{force:true}),
    rm(`${SQLITE_PATH}-wal`,{force:true}),
    rm(`${SQLITE_PATH}-shm`,{force:true})
  ]);
  if(bytes)await writeFile(SQLITE_PATH,bytes);
}

async function waitForLocalApi(){
  const deadline=Date.now()+5000;
  let lastError: unknown=null;
  while(Date.now()<deadline){
    try{
      const response=await fetch(`http://127.0.0.1:${LOCAL_PORT}/api/health`,{cache:'no-store'});
      if(response.ok)return;
      lastError=new Error(`Health local ${response.status}`);
    }catch(error){lastError=error;}
    await new Promise(resolve=>setTimeout(resolve,75));
  }
  throw lastError instanceof Error?lastError:new Error('Le serveur StoreOps local ne démarre pas.');
}

async function loadRuntime(){
  if(!runtimePromise){
    bridgeBackendEnvironment();
    runtimePromise=(async()=>{
      await import('../../backend/server.mjs');
      const dbModule=await import('../../backend/db.mjs');
      await waitForLocalApi();
      return{dbModule};
    })();
  }
  return runtimePromise;
}

async function refreshOpenDatabase(dbModule: typeof import('../../backend/db.mjs'),bytes: Buffer){
  try{dbModule.db.exec('PRAGMA wal_checkpoint(TRUNCATE);')}catch{}
  try{dbModule.db.close()}catch{}
  await replaceLocalDatabase(bytes);
  dbModule.db.open();
  dbModule.db.exec('PRAGMA foreign_keys = ON;');
  dbModule.db.exec('PRAGMA journal_mode = WAL;');
}

function forwardedHeaders(request:Request){
  const headers=new Headers(request.headers);
  for(const name of ['host','connection','content-length','transfer-encoding','origin'])headers.delete(name);
  return headers;
}

async function callLocalPath(request:Request,path:string,{method='GET',body}: {method?:string,body?:BodyInit}={}){
  const init:RequestInit={method,headers:forwardedHeaders(request),cache:'no-store'};
  if(body!==undefined)init.body=body;
  return fetch(`http://127.0.0.1:${LOCAL_PORT}${path}`,init);
}

async function callLocalApi(request: Request){
  const incoming=new URL(request.url);
  const body=!['GET','HEAD'].includes(request.method)?Buffer.from(await request.arrayBuffer()):undefined;
  const upstream=await callLocalPath(request,`${incoming.pathname}${incoming.search}`,{method:request.method,body});
  const responseHeaders=new Headers(upstream.headers);
  for(const name of ['content-length','transfer-encoding','content-encoding','connection'])responseHeaders.delete(name);
  return new Response(await upstream.arrayBuffer(),{status:upstream.status,statusText:upstream.statusText,headers:responseHeaders});
}

async function authenticatedUser(request:Request,runtime:{dbModule:typeof import('../../backend/db.mjs')}){
  const response=await callLocalPath(request,'/api/session');
  if(!response.ok)return{response:new Response(await response.arrayBuffer(),{status:response.status,headers:{'content-type':'application/json'}}),user:null};
  const session:any=await response.json();
  const user=runtime.dbModule.db.prepare(`SELECT * FROM users WHERE id=? AND active=1`).get(session?.user?.id);
  return{response:null,user};
}

async function handleV168Route(request:Request,runtime:{dbModule:typeof import('../../backend/db.mjs')}){
  const url=new URL(request.url),path=url.pathname;

  // Existing frontend diagnostics routes were missing from server.mjs in V1.67.
  if(request.method==='GET'&&(path==='/api/dynamics/diagnostics'||path==='/api/dynamics/probe')){
    const auth=await authenticatedUser(request,runtime);if(auth.response)return auth.response;
    if(auth.user?.role!=='ops_director')return Response.json({error:'Réservé à la Direction StoreOps'},{status:403});
    const dynamics=await import('../../backend/services/dynamics.mjs');
    if(path==='/api/dynamics/diagnostics')return Response.json(await dynamics.getDynamicsDiagnostics({forceToken:url.searchParams.get('force')==='1'}));
    return Response.json(await dynamics.probeDataEntity(url.searchParams.get('entity')||'',{top:Number(url.searchParams.get('top')||1),filter:url.searchParams.get('filter')||''}));
  }

  // Mohammed Amine / Qualité & Audit sees the whole network selector but keeps
  // operational writes blocked by backend permissions.mjs.
  if(request.method==='GET'&&path==='/api/stores'){
    const auth=await authenticatedUser(request,runtime);if(auth.response)return auth.response;
    if(auth.user?.permissions_profile==='quality_audit'){
      return Response.json(runtime.dbModule.db.prepare(`SELECT * FROM stores WHERE active=1 ORDER BY name`).all());
    }
  }

  // Inventory LIVE must snapshot the store stock, not only the article master.
  const inventoryLineMatch=path.match(/^\/api\/inventory\/([^/]+)\/lines$/);
  if(request.method==='POST'&&inventoryLineMatch){
    const auth=await authenticatedUser(request,runtime);if(auth.response)return auth.response;
    const inventory=await import('../../backend/services/inventory.mjs');
    const permissions=await import('../../backend/services/permissions.mjs');
    const stock=await import('../../backend/services/dynamics-stock.mjs');
    const sessionId=decodeURIComponent(inventoryLineMatch[1]),session=inventory.inventorySession(sessionId);
    if(!session)return Response.json({error:'Inventaire introuvable'},{status:404});
    if(!permissions.canManageStore(auth.user,session.store_id))return Response.json({error:'Réservé au Responsable magasin ou Directeur d’exploitation'},{status:403});
    const payload:any=await request.clone().json().catch(()=>({}));
    const product=await stock.getStoreProductByEan(session.store_id,String(payload.ean||'').trim());
    if(!product)return Response.json({error:'Article introuvable Dynamics'},{status:404});
    return Response.json(inventory.addInventoryLine({sessionId,user:auth.user,product}),{status:201});
  }

  return null;
}

async function persistSnapshot(client: any,dbModule: typeof import('../../backend/db.mjs')){
  dbModule.db.exec('PRAGMA wal_checkpoint(TRUNCATE);');
  const bytes=await readFile(SQLITE_PATH);
  const result=await client.query(
    `INSERT INTO storeops_sqlite_state(id,db_bytes,revision,updated_at)
     VALUES($1,$2,1,NOW())
     ON CONFLICT(id) DO UPDATE
       SET db_bytes=EXCLUDED.db_bytes,
           revision=storeops_sqlite_state.revision+1,
           updated_at=NOW()
     RETURNING revision`,
    [STATE_ID,bytes]
  );
  return String(result.rows[0].revision);
}

export default async (request: Request)=>{
  const database=getDatabase();
  const client=await database.pool.connect();
  let committed=false;
  try{
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock($1)',[ADVISORY_LOCK_KEY]);
    const state=await client.query('SELECT db_bytes,revision FROM storeops_sqlite_state WHERE id=$1',[STATE_ID]);
    const row=state.rows[0]||null;
    const revision=row?String(row.revision):'0';
    const bytes=row?.db_bytes?Buffer.from(row.db_bytes):null;

    if(!runtimePromise){
      await replaceLocalDatabase(bytes);
    }
    const runtime=await loadRuntime();

    if(localRevision!==null&&revision!==localRevision){
      if(!bytes)throw new Error('État StoreOps central absent après initialisation.');
      await refreshOpenDatabase(runtime.dbModule,bytes);
    }
    if(localRevision===null)localRevision=revision;

    const response=await handleV168Route(request.clone(),runtime)||await callLocalApi(request);
    const nextRevision=await persistSnapshot(client,runtime.dbModule);
    await client.query('COMMIT');
    committed=true;
    localRevision=nextRevision;
    return response;
  }catch(error){
    localRevision=null;
    if(!committed)await client.query('ROLLBACK').catch(()=>{});
    console.error('StoreOps public API failure',error);
    return Response.json({
      error:'Backend StoreOps indisponible',
      code:'STOREOPS_PUBLIC_BACKEND_FAILED',
      details:error instanceof Error?error.message:String(error)
    },{status:503});
  }finally{
    client.release();
  }
};

export const config: Config={
  path:'/api/*'
};
