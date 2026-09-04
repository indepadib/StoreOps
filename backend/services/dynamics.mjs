import { config } from '../config.mjs';

const PRODUCTS = {
  '3017620422003': {ean:'3017620422003',name:'Nutella 750g',price:64.90,stock:17,category:'Épicerie',productNumber:'NUT750'},
  '6111040001111': {ean:'6111040001111',name:'Lait frais entier 1L',price:12.90,stock:24,category:'Frais',productNumber:'LAIT1L'},
  '3274080005003': {ean:'3274080005003',name:'Yaourt nature 4x110g',price:18.50,stock:36,category:'Frais',productNumber:'YAOURT4'}
};

let tokenCache={token:null,expiresAt:0};
function escapeOData(v){ return String(v).replaceAll("'","''"); }

async function acquireToken(){
  if(config.dynamics.mode!=='live') return null;
  if(tokenCache.token && Date.now()<tokenCache.expiresAt-60_000) return tokenCache.token;
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
  tokenCache={token:j.access_token,expiresAt:Date.now()+Number(j.expires_in||3600)*1000};
  return tokenCache.token;
}

async function d365Fetch(path,{method='GET',body=null,headers={}}={}){
  if(config.dynamics.mode!=='live') throw Object.assign(new Error('Dynamics est en mode simulé'),{status:409});
  const token=await acquireToken();
  const url=path.startsWith('http')?path:`${config.dynamics.baseUrl}${path.startsWith('/')?'':'/'}${path}`;
  const r=await fetch(url,{method,headers:{authorization:`Bearer ${token}`,accept:'application/json','content-type':'application/json',...headers},body:body?JSON.stringify(body):undefined});
  if(!r.ok){const text=await r.text();throw Object.assign(new Error(`Dynamics ${r.status}: ${text.slice(0,500)}`),{status:502,code:'D365_REQUEST_FAILED'})}
  if(r.status===204) return null;
  return r.json();
}

export async function getDynamicsHealth(){
  if(config.dynamics.mode!=='live') return {connected:false,mode:'SIMULATED',lastSync:new Date().toISOString(),missing:['D365_MODE=live']};
  const missing=[];
  for(const [k,v] of Object.entries({D365_BASE_URL:config.dynamics.baseUrl,D365_TENANT_ID:config.dynamics.tenantId,D365_CLIENT_ID:config.dynamics.clientId,D365_CLIENT_SECRET:config.dynamics.clientSecret})) if(!v) missing.push(k);
  if(missing.length) return {connected:false,mode:'LIVE_CONFIG_INCOMPLETE',missing};
  const started=Date.now();
  try{
    const token=await acquireToken();
    return {connected:!!token,mode:'LIVE',latencyMs:Date.now()-started,baseUrl:config.dynamics.baseUrl,configuredEntities:{productEntity:config.dynamics.productEntity||null,barcodeEntity:config.dynamics.barcodeEntity||null}};
  }catch(e){return {connected:false,mode:'LIVE',error:e.message,latencyMs:Date.now()-started};}
}

export async function listDataEntities(search=''){
  if(config.dynamics.mode!=='live') return [];
  const payload=await d365Fetch('/Metadata/DataEntities');
  const rows=payload?.value||payload||[];
  const q=String(search||'').toLowerCase();
  return rows.filter(x=>!q || JSON.stringify(x).toLowerCase().includes(q)).slice(0,100);
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
  if(!c.productEntity || !productNumber){
    return {ean,name:barcodeRow.Description||productNumber||ean,price:null,stock:null,category:barcodeRow.Category||'Autre',productNumber:productNumber||null,source:'D365'};
  }
  const select=[c.productNumberField,c.productNameField].join(',');
  const productPayload=await odataGet(c.productEntity,{filter:`${c.productNumberField} eq '${escapeOData(productNumber)}'`,select,top:1});
  const p=productPayload?.value?.[0]||{};
  return {ean,name:p[c.productNameField]||barcodeRow.Description||productNumber,price:null,stock:null,category:p.Category||barcodeRow.Category||'Autre',productNumber,source:'D365'};
}

export async function postReceiptToDynamics(poNumber,payload={}){
  if(config.dynamics.mode!=='live') return {ok:true,simulated:true,poNumber,postedAt:new Date().toISOString()};
  throw Object.assign(new Error('Posting réception Dynamics live non configuré : mapper le service de réception F&O avant activation.'),{status:501,code:'D365_RECEIPT_WRITE_NOT_MAPPED',details:{poNumber,payload}});
}

export async function postInventoryAdjustmentToDynamics(sessionId,payload={}){
  if(config.dynamics.mode!=='live') return {ok:true,simulated:true,sessionId,postedAt:new Date().toISOString(),lines:payload.lines?.length||0};
  throw Object.assign(new Error('Posting ajustement stock Dynamics live non configuré : mapper le journal d’inventaire / ajustement F&O avant activation.'),{status:501,code:'D365_INVENTORY_WRITE_NOT_MAPPED',details:{sessionId,payload}});
}

export async function getCommercialChanges(storeId,businessDate){
  if(config.dynamics.mode!=='live'){
    return [
      {sourceKey:`PROMO-NUT750-${businessDate}`,actionType:'PROMO_START',ean:'3017620422003',productNumber:'NUT750',productName:'Nutella 750g',category:'Épicerie',oldPrice:64.90,expectedPrice:59.90,promoLabel:'Promo lancement · 59,90 DH',signageAction:'INSTALL',priority:'HIGH',blockingOpening:true},
      {sourceKey:`PRICE-LAIT1L-${businessDate}`,actionType:'PRICE_CHANGE',ean:'6111040001111',productNumber:'LAIT1L',productName:'Lait frais entier 1L',category:'Frais',oldPrice:11.90,expectedPrice:12.90,promoLabel:null,signageAction:'VERIFY',priority:'HIGH',blockingOpening:true},
      {sourceKey:`PROMOEND-YAOURT4-${businessDate}`,actionType:'PROMO_END',ean:'3274080005003',productNumber:'YAOURT4',productName:'Yaourt nature 4x110g',category:'Frais',oldPrice:15.90,expectedPrice:18.50,promoLabel:'Fin promo 15,90 DH',signageAction:'REMOVE',priority:'HIGH',blockingOpening:true}
    ].map(x=>({...x,storeId,source:'SIMULATED_D365'}));
  }
  throw Object.assign(new Error('Flux prix/promotions Dynamics live non configuré : mapper les entités prix, remises et promotions F&O/Commerce avant activation.'),{status:503,code:'D365_COMMERCIAL_MAPPING_REQUIRED',details:{storeId,businessDate}});
}

export async function getCashClosingSnapshot(storeId,businessDate){
  if(config.dynamics.mode!=='live'){
    return {
      sourceKey:`CASH-CLOSING-${storeId}-${businessDate}`,
      storeId,businessDate,source:'SIMULATED_D365',
      lines:[
        {tillCode:'C01',shiftId:`${storeId.toUpperCase()}-C01-${businessDate}`,cashierName:'Caissier 1',expectedSales:4200,expectedCash:1600,expectedCard:2400,expectedOther:200},
        {tillCode:'C02',shiftId:`${storeId.toUpperCase()}-C02-${businessDate}`,cashierName:'Caissier 2',expectedSales:3500,expectedCash:1400,expectedCard:2000,expectedOther:100},
        {tillCode:'C03',shiftId:`${storeId.toUpperCase()}-C03-${businessDate}`,cashierName:'Caissier 3',expectedSales:2800,expectedCash:900,expectedCard:1800,expectedOther:100}
      ]
    };
  }
  throw Object.assign(new Error('Flux clôture caisses Dynamics live non configuré : mapper shifts, statements, modes de paiement et remises TPE avant activation.'),{status:503,code:'D365_CASH_CLOSING_MAPPING_REQUIRED',details:{storeId,businessDate}});
}
