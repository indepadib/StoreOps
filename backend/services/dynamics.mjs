import { config } from '../config.mjs';

const PRODUCTS = {
  '3017620422003': {ean:'3017620422003',name:'Nutella 750g',price:64.90,stock:17,category:'Épicerie',productNumber:'NUT750'},
  '6111040001111': {ean:'6111040001111',name:'Lait frais entier 1L',price:12.90,stock:24,category:'Frais',productNumber:'LAIT1L'},
  '3274080005003': {ean:'3274080005003',name:'Yaourt nature 4x110g',price:18.50,stock:36,category:'Frais',productNumber:'YAOURT4'}
};

let tokenCache={token:null,expiresAt:0};
const now=()=>new Date().toISOString();
function escapeOData(v){ return String(v).replaceAll("'","''"); }
function configured(){
  const c=config.dynamics;
  return {
    baseUrl:{configured:!!c.baseUrl,value:c.baseUrl||null},
    tenantId:{configured:!!c.tenantId,value:c.tenantId||null},
    clientId:{configured:!!c.clientId,value:c.clientId||null},
    clientSecret:{configured:!!c.clientSecret},
    oauthVersion:c.oauthVersion,
    mappings:{barcodeEntity:c.barcodeEntity||null,productEntity:c.productEntity||null,barcodeField:c.barcodeField,barcodeProductField:c.barcodeProductField,productNumberField:c.productNumberField,productNameField:c.productNameField}
  };
}
function missingConfig(){const c=config.dynamics,rows={D365_BASE_URL:c.baseUrl,D365_TENANT_ID:c.tenantId,D365_CLIENT_ID:c.clientId,D365_CLIENT_SECRET:c.clientSecret};return Object.entries(rows).filter(([,v])=>!v).map(([k])=>k)}

async function acquireToken({force=false}={}){
  if(config.dynamics.mode!=='live') return null;
  if(!force&&tokenCache.token && Date.now()<tokenCache.expiresAt-60_000) return tokenCache.token;
  const missing=missingConfig();if(missing.length)throw Object.assign(new Error(`Configuration Dynamics incomplète : ${missing.join(', ')}`),{status:503,code:'D365_CONFIG_INCOMPLETE',details:{missing}});
  const tenant=encodeURIComponent(config.dynamics.tenantId);
  const params=new URLSearchParams({client_id:config.dynamics.clientId,client_secret:config.dynamics.clientSecret,grant_type:'client_credentials'});
  let url;
  if(config.dynamics.oauthVersion==='v1'){
    url=`https://login.microsoftonline.com/${tenant}/oauth2/token`;
    params.set('resource',config.dynamics.baseUrl);
  } else {
    url=`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`;
    params.set('scope',`${config.dynamics.baseUrl}/.default`);
  }
  const r=await fetch(url,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:params});
  const j=await r.json().catch(()=>({}));
  if(!r.ok) throw Object.assign(new Error(j.error_description||j.error||`Token Dynamics refusé (${r.status})`),{status:502,code:'D365_AUTH_FAILED'});
  if(!j.access_token)throw Object.assign(new Error('Microsoft Entra n’a pas retourné de jeton d’accès.'),{status:502,code:'D365_AUTH_NO_TOKEN'});
  tokenCache={token:j.access_token,expiresAt:Date.now()+Number(j.expires_in||3600)*1000};
  return tokenCache.token;
}

async function d365Fetch(path,{method='GET',body=null,headers={},forceToken=false}={}){
  if(config.dynamics.mode!=='live') throw Object.assign(new Error('Dynamics est en mode simulé'),{status:409,code:'D365_SIMULATED'});
  const token=await acquireToken({force:forceToken});
  const url=path.startsWith('http')?path:`${config.dynamics.baseUrl}${path.startsWith('/')?'':'/'}${path}`;
  const r=await fetch(url,{method,headers:{authorization:`Bearer ${token}`,accept:'application/json','content-type':'application/json',...headers},body:body?JSON.stringify(body):undefined});
  if(!r.ok){const text=await r.text();throw Object.assign(new Error(`Dynamics ${r.status}: ${text.slice(0,500)}`),{status:502,code:'D365_REQUEST_FAILED',details:{httpStatus:r.status,path}})}
  if(r.status===204) return null;
  return r.json();
}

export async function getDynamicsDiagnostics({forceToken=false}={}){
  const base={checkedAt:now(),mode:config.dynamics.mode.toUpperCase(),configuration:configured(),expectedAudience:config.dynamics.baseUrl||null,checks:{config:{ok:false},token:{ok:false,skipped:true},metadata:{ok:false,skipped:true}}};
  if(config.dynamics.mode!=='live')return{...base,connected:false,mode:'SIMULATED',checks:{...base.checks,config:{ok:true,simulated:true}},nextAction:'Passer D365_MODE=live après création de l’application Entra et du compte de service Dynamics.'};
  const missing=missingConfig();base.checks.config={ok:missing.length===0,missing};
  if(missing.length)return{...base,connected:false,mode:'LIVE_CONFIG_INCOMPLETE',nextAction:`Configurer ${missing.join(', ')} dans l’environnement sécurisé du backend.`};
  const tokenStart=Date.now();
  try{
    await acquireToken({force:forceToken});
    base.checks.token={ok:true,skipped:false,latencyMs:Date.now()-tokenStart};
  }catch(e){base.checks.token={ok:false,skipped:false,latencyMs:Date.now()-tokenStart,error:e.message,code:e.code||'D365_AUTH_FAILED'};return{...base,connected:false,mode:'LIVE_AUTH_FAILED',nextAction:'Vérifier Tenant ID, Client ID, secret, URL de l’environnement et mapping Microsoft Entra applications dans F&O.'}}
  const metaStart=Date.now();
  try{
    const payload=await d365Fetch('/Metadata/DataEntities');const rows=payload?.value||payload||[];
    base.checks.metadata={ok:true,skipped:false,latencyMs:Date.now()-metaStart,entityCount:Array.isArray(rows)?rows.length:null};
    return{...base,connected:true,mode:'LIVE',nextAction:'Connexion établie. Rechercher les Data Entities réelles puis mapper article/EAN en premier.'};
  }catch(e){base.checks.metadata={ok:false,skipped:false,latencyMs:Date.now()-metaStart,error:e.message,code:e.code||'D365_METADATA_FAILED'};return{...base,connected:false,mode:'LIVE_METADATA_FAILED',nextAction:'Le token fonctionne mais F&O refuse ou ne répond pas sur Metadata/DataEntities. Vérifier le compte de service et ses rôles Dynamics.'}}
}

export async function getDynamicsHealth(){const d=await getDynamicsDiagnostics();return{connected:d.connected,mode:d.mode,checkedAt:d.checkedAt,baseUrl:d.configuration.baseUrl.value,missing:d.checks.config.missing||[],latencyMs:d.checks.metadata.latencyMs||d.checks.token.latencyMs||null,error:d.checks.metadata.error||d.checks.token.error||null,configuredEntities:{productEntity:config.dynamics.productEntity||null,barcodeEntity:config.dynamics.barcodeEntity||null}}}

export async function listDataEntities(search=''){
  if(config.dynamics.mode!=='live') return [];
  const payload=await d365Fetch('/Metadata/DataEntities');
  const rows=payload?.value||payload||[];
  const q=String(search||'').toLowerCase();
  return rows.filter(x=>!q || JSON.stringify(x).toLowerCase().includes(q)).slice(0,100);
}

export async function probeDataEntity(entity,{top=1}={}){
  if(config.dynamics.mode!=='live')return{ok:false,mode:'SIMULATED',entity,rows:[],message:'Le probe OData réel est disponible uniquement avec D365_MODE=live.'};
  const name=String(entity||'').trim();if(!/^[A-Za-z0-9_]+$/.test(name))throw Object.assign(new Error('Nom de Data Entity invalide.'),{status:400,code:'D365_ENTITY_NAME_INVALID'});
  const started=Date.now(),payload=await d365Fetch(`/data/${encodeURIComponent(name)}?$top=${Math.max(1,Math.min(5,Number(top)||1))}`),rows=payload?.value||[];
  return{ok:true,entity:name,latencyMs:Date.now()-started,rowCount:Array.isArray(rows)?rows.length:0,rows:Array.isArray(rows)?rows.slice(0,5):[]};
}

export async function odataGet(entity,{filter='',select='',top=50,extra=''}={}){
  const qs=new URLSearchParams(); if(filter)qs.set('$filter',filter); if(select)qs.set('$select',select); if(top)qs.set('$top',String(top));
  const suffix=[qs.toString(),extra].filter(Boolean).join('&');
  return d365Fetch(`/data/${encodeURIComponent(entity)}${suffix?'?'+suffix:''}`);
}

export async function getProductByEan(ean){
  if(config.dynamics.mode!=='live') return PRODUCTS[ean] || null;
  const c=config.dynamics;
  if(!c.barcodeEntity) throw Object.assign(new Error('D365_BARCODE_ENTITY non configuré'),{status:503,code:'D365_MAPPING_REQUIRED'});
  const barcodePayload=await odataGet(c.barcodeEntity,{filter:`${c.barcodeField} eq '${escapeOData(ean)}'`,top:1});
  const barcodeRow=barcodePayload?.value?.[0]; if(!barcodeRow) return null;
  const productNumber=barcodeRow[c.barcodeProductField];
  if(!c.productEntity || !productNumber)return {ean,name:barcodeRow.Description||productNumber||ean,price:null,stock:null,category:barcodeRow.Category||'Autre',productNumber:productNumber||null,source:'D365'};
  const select=[c.productNumberField,c.productNameField].join(','),productPayload=await odataGet(c.productEntity,{filter:`${c.productNumberField} eq '${escapeOData(productNumber)}'`,select,top:1}),p=productPayload?.value?.[0]||{};
  return {ean,name:p[c.productNameField]||barcodeRow.Description||productNumber,price:null,stock:null,category:p.Category||barcodeRow.Category||'Autre',productNumber,source:'D365'};
}

export async function postReceiptToDynamics(poNumber,payload={}){if(config.dynamics.mode!=='live') return {ok:true,simulated:true,poNumber,postedAt:now()};throw Object.assign(new Error('Posting réception Dynamics live non configuré : mapper le service de réception F&O avant activation.'),{status:501,code:'D365_RECEIPT_WRITE_NOT_MAPPED',details:{poNumber,payload}})}
export async function postInventoryAdjustmentToDynamics(sessionId,payload={}){if(config.dynamics.mode!=='live') return {ok:true,simulated:true,sessionId,postedAt:now(),lines:payload.lines?.length||0};throw Object.assign(new Error('Posting ajustement stock Dynamics live non configuré : mapper le journal d’inventaire / ajustement F&O avant activation.'),{status:501,code:'D365_INVENTORY_WRITE_NOT_MAPPED',details:{sessionId,payload}})}
export async function postLossToDynamics(lossId,payload={}){if(config.dynamics.mode!=='live') return {ok:true,simulated:true,lossId,postedAt:now(),quantity:payload.quantity||0};throw Object.assign(new Error('Posting démarque/perte Dynamics live non configuré : mapper le journal de mouvement ou ajustement stock F&O avant activation.'),{status:501,code:'D365_LOSS_WRITE_NOT_MAPPED',details:{lossId,payload}})}

export async function getCommercialChanges(storeId,businessDate){if(config.dynamics.mode!=='live')return[{sourceKey:`PROMO-NUT750-${businessDate}`,actionType:'PROMO_START',ean:'3017620422003',productNumber:'NUT750',productName:'Nutella 750g',category:'Épicerie',oldPrice:64.90,expectedPrice:59.90,promoLabel:'Promo lancement · 59,90 DH',signageAction:'INSTALL',priority:'HIGH',blockingOpening:true},{sourceKey:`PRICE-LAIT1L-${businessDate}`,actionType:'PRICE_CHANGE',ean:'6111040001111',productNumber:'LAIT1L',productName:'Lait frais entier 1L',category:'Frais',oldPrice:11.90,expectedPrice:12.90,promoLabel:null,signageAction:'VERIFY',priority:'HIGH',blockingOpening:true},{sourceKey:`PROMOEND-YAOURT4-${businessDate}`,actionType:'PROMO_END',ean:'3274080005003',productNumber:'YAOURT4',productName:'Yaourt nature 4x110g',category:'Frais',oldPrice:15.90,expectedPrice:18.50,promoLabel:'Fin promo 15,90 DH',signageAction:'REMOVE',priority:'HIGH',blockingOpening:true}].map(x=>({...x,storeId,source:'SIMULATED_D365'}));throw Object.assign(new Error('Flux prix/promotions Dynamics live non configuré : mapper les entités prix, remises et promotions F&O/Commerce avant activation.'),{status:503,code:'D365_COMMERCIAL_MAPPING_REQUIRED',details:{storeId,businessDate}})}

export async function getCashClosingSnapshot(storeId,businessDate){if(config.dynamics.mode!=='live')return{sourceKey:`CASH-CLOSING-${storeId}-${businessDate}`,storeId,businessDate,source:'SIMULATED_D365',lines:[{tillCode:'C01',shiftId:`${storeId.toUpperCase()}-C01-${businessDate}`,cashierName:'Caissier 1',expectedSales:4200,expectedCash:1600,expectedCard:2400,expectedOther:200},{tillCode:'C02',shiftId:`${storeId.toUpperCase()}-C02-${businessDate}`,cashierName:'Caissier 2',expectedSales:3500,expectedCash:1400,expectedCard:2000,expectedOther:100},{tillCode:'C03',shiftId:`${storeId.toUpperCase()}-C03-${businessDate}`,cashierName:'Caissier 3',expectedSales:2800,expectedCash:900,expectedCard:1800,expectedOther:100}]};throw Object.assign(new Error('Flux clôture caisses Dynamics live non configuré : mapper shifts, statements, modes de paiement et remises TPE avant activation.'),{status:503,code:'D365_CASH_CLOSING_MAPPING_REQUIRED',details:{storeId,businessDate}})}
