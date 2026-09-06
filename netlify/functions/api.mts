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
    'STOREOPS_STAFFING_SOURCE','STOREOPS_CASH_OPENING_SOURCE',
    'D365_MODE','D365_BASE_URL','D365_TENANT_ID','D365_CLIENT_ID','D365_CLIENT_SECRET','D365_OAUTH_VERSION','D365_DATA_AREA_ID','D365_DATA_AREA_FIELD',
    'D365_BARCODE_ENTITY','D365_PRODUCT_ENTITY','D365_BARCODE_FIELD','D365_BARCODE_PRODUCT_FIELD','D365_BARCODE_DESCRIPTION_FIELD','D365_BARCODE_UNIT_FIELD','D365_PRODUCT_NUMBER_FIELD','D365_PRODUCT_NAME_FIELD',
    'D365_DEFAULT_PRICE_GROUP','D365_STORE_PRICE_GROUPS','D365_STOCK_ENTITY','D365_STOCK_PRODUCT_FIELD','D365_STOCK_NAME_FIELD','D365_STOCK_EAN_FIELD','D365_STOCK_WAREHOUSE_FIELD','D365_STOCK_AVAILABLE_FIELD','D365_STOCK_PHYSICAL_FIELD','D365_STORE_WAREHOUSES',
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

async function callLocalApi(request: Request){
  const incoming=new URL(request.url);
  const headers=new Headers(request.headers);
  for(const name of ['host','connection','content-length','transfer-encoding','origin'])headers.delete(name);
  const init: RequestInit={method:request.method,headers,cache:'no-store'};
  if(!['GET','HEAD'].includes(request.method))init.body=Buffer.from(await request.arrayBuffer());
  const upstream=await fetch(`http://127.0.0.1:${LOCAL_PORT}${incoming.pathname}${incoming.search}`,init);
  const responseHeaders=new Headers(upstream.headers);
  for(const name of ['content-length','transfer-encoding','content-encoding','connection'])responseHeaders.delete(name);
  return new Response(await upstream.arrayBuffer(),{status:upstream.status,statusText:upstream.statusText,headers:responseHeaders});
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

    const response=await callLocalApi(request);
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
