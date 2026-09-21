import { config } from '../config.mjs';
import { storeOperationalSettings } from './store-settings.mjs';

const PRODUCTS = {
  '3017620422003': {ean:'3017620422003',name:'Nutella 750g',price:64.90,stock:17,category:'Épicerie',productNumber:'NUT750',unit:'pièce'},
  '6111040001111': {ean:'6111040001111',name:'Lait frais entier 1L',price:12.90,stock:24,category:'Frais',productNumber:'LAIT1L',unit:'pièce'},
  '3274080005003': {ean:'3274080005003',name:'Yaourt nature 4x110g',price:18.50,stock:36,category:'Frais',productNumber:'YAOURT4',unit:'pièce'}
};

let tokenCache={token:null,expiresAt:0};
const priceGroupCache=new Map();
const now=()=>new Date().toISOString();
function escapeOData(v){ return String(v).replaceAll("'","''"); }
export function isD365ReadLive(domain){return config.dynamics.mode==='live'&&config.dynamics.read?.[domain]==='live'}
function configured(){
  const c=config.dynamics;
  return {
    baseUrl:{configured:!!c.baseUrl,value:c.baseUrl||null},
    tenantId:{configured:!!c.tenantId,value:c.tenantId||null},
    clientId:{configured:!!c.clientId,value:c.clientId||null},
    clientSecret:{configured:!!c.clientSecret},
    oauthVersion:c.oauthVersion,
    dataAreaId:c.dataAreaId||null,
    readModes:{...c.read},
    mappings:{
      barcodeEntity:c.barcodeEntity||null,
      productEntity:c.productEntity||null,
      stockEntity:c.stock?.entity||null,
      basePriceEntity:c.entities?.basePrice||null,
      salesPriceEntity:c.entities?.salesPrice||null,
      retailDiscountEntity:c.entities?.retailDiscount||null,
      retailDiscountLineEntity:c.entities?.retailDiscountLine||null,
      retailDiscountPriceGroupEntity:c.entities?.retailDiscountPriceGroup||null,
      mixMatchLineGroupEntity:c.entities?.mixMatchLineGroup||null,
      purchaseOrderHeaderEntity:c.receiving?.headerEntity||null,
      purchaseOrderLineEntity:c.receiving?.lineEntity||null,
      assortmentEntity:process.env.D365_ASSORTMENT_ENTITY||null,
      categoryEntity:process.env.D365_CATEGORY_ENTITY||'ProcurementProductCategories',
      productCategoryAssignmentEntity:process.env.D365_PRODUCT_CATEGORY_ASSIGNMENT_ENTITY||'ProductCategoryAssignments',
      salesEntity:process.env.D365_SALES_ENTITY||'RetailTransactionSalesTransBIEntities',
      stockBatchField:c.stock?.batchField||null,
      stockLocationField:c.stock?.locationField||null,
      stockStatusField:c.stock?.statusField||null,
      storeSupplyWarehouses:c.stock?.supplyWarehouses||{},
      dataAreaField:c.dataAreaField,
      barcodeField:c.barcodeField,
      barcodeProductField:c.barcodeProductField,
      barcodeDescriptionField:c.barcodeDescriptionField,
      barcodeUnitField:c.barcodeUnitField,
      productNumberField:c.productNumberField,
      productNameField:c.productNameField
    }
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
  const timeoutMs=Math.max(1500,Math.min(15000,Number(process.env.D365_REQUEST_TIMEOUT_MS)||6500)),controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);
  let r;
  try{r=await fetch(url,{method,headers:{authorization:`Bearer ${token}`,accept:'application/json','content-type':'application/json',...headers},body:body?JSON.stringify(body):undefined,signal:controller.signal})}
  catch(error){if(error?.name==='AbortError')throw Object.assign(new Error(`Dynamics n’a pas répondu en ${timeoutMs} ms.`),{status:504,code:'D365_REQUEST_TIMEOUT',details:{path,timeoutMs}});throw error}
  finally{clearTimeout(timer)}
  if(!r.ok){const text=await r.text();throw Object.assign(new Error(`Dynamics ${r.status}: ${text.slice(0,500)}`),{status:502,code:'D365_REQUEST_FAILED',details:{httpStatus:r.status,path}})}
  if(r.status===204) return null;
  return r.json();
}

export async function getDynamicsDiagnostics({forceToken=false}={}){
  const base={checkedAt:now(),mode:config.dynamics.mode.toUpperCase(),configuration:configured(),expectedAudience:config.dynamics.baseUrl||null,checks:{config:{ok:false},token:{ok:false,skipped:true},metadata:{ok:false,skipped:true}}};
  if(config.dynamics.mode!=='live')return{...base,connected:false,mode:'SIMULATED',checks:{...base.checks,config:{ok:true,simulated:true}},nextAction:'La connexion Dynamics est désactivée. Activer D365_MODE uniquement quand les domaines READ sont prêts à être testés.'};
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
    return{...base,connected:true,mode:'LIVE',nextAction:'Connexion F&O établie. Les domaines READ restent activés séparément et ne sont LIVE qu’après leur test métier.'};
  }catch(e){base.checks.metadata={ok:false,skipped:false,latencyMs:Date.now()-metaStart,error:e.message,code:e.code||'D365_METADATA_FAILED'};return{...base,connected:false,mode:'LIVE_METADATA_FAILED',nextAction:'Le token fonctionne mais F&O refuse ou ne répond pas sur Metadata/DataEntities. Vérifier le compte de service et ses rôles Dynamics.'}}
}

export async function getDynamicsHealth(){const d=await getDynamicsDiagnostics();return{connected:d.connected,mode:d.mode,readModes:d.configuration.readModes||{},checkedAt:d.checkedAt,baseUrl:d.configuration.baseUrl.value,missing:d.checks.config.missing||[],latencyMs:d.checks.metadata.latencyMs||d.checks.token.latencyMs||null,error:d.checks.metadata.error||d.checks.token.error||null,configuredEntities:{productEntity:config.dynamics.productEntity||null,barcodeEntity:config.dynamics.barcodeEntity||null,stockEntity:config.dynamics.stock?.entity||null,purchaseOrderHeaderEntity:config.dynamics.receiving?.headerEntity||null,purchaseOrderLineEntity:config.dynamics.receiving?.lineEntity||null}}}

export async function listDataEntities(search=''){
  if(config.dynamics.mode!=='live') return [];
  const payload=await d365Fetch('/Metadata/DataEntities');
  const rows=payload?.value||payload||[];
  const q=String(search||'').toLowerCase();
  return rows.filter(x=>!q || JSON.stringify(x).toLowerCase().includes(q)).slice(0,100);
}

export async function probeDataEntity(entity,{top=1,filter='',extra=''}={}){
  const name=String(entity||'').trim();if(!/^[A-Za-z0-9_]+$/.test(name))throw Object.assign(new Error('Nom de Data Entity invalide.'),{status:400,code:'D365_ENTITY_NAME_INVALID'});
  const safeTop=Math.max(1,Math.min(20,Number(top)||1));
  const appliedFilter=String(filter||'').trim(),appliedExtra=String(extra||'').trim();
  if(config.dynamics.mode!=='live')return{ok:false,mode:'SIMULATED',entity:name,filter:appliedFilter||null,rows:[],message:'Le probe OData réel est disponible uniquement avec D365_MODE=live.'};
  const qs=new URLSearchParams();qs.set('$top',String(safeTop));if(appliedFilter)qs.set('$filter',appliedFilter);
  const suffix=[qs.toString(),appliedExtra].filter(Boolean).join('&');
  const started=Date.now(),payload=await d365Fetch(`/data/${encodeURIComponent(name)}?${suffix}`),rows=payload?.value||[];
  return{ok:true,entity:name,filter:appliedFilter||null,latencyMs:Date.now()-started,rowCount:Array.isArray(rows)?rows.length:0,rows:Array.isArray(rows)?rows.slice(0,safeTop):[]};
}

export async function odataGet(entity,{filter='',select='',top=50,extra=''}={}){
  const qs=new URLSearchParams(); if(filter)qs.set('$filter',filter); if(select)qs.set('$select',select); if(top)qs.set('$top',String(top));
  const suffix=[qs.toString(),extra].filter(Boolean).join('&');
  return d365Fetch(`/data/${encodeURIComponent(entity)}${suffix?'?'+suffix:''}`);
}

export async function odataGetAll(entity,{filter='',select='',extra='',pageSize=null,maxRows=null}={}){
  const size=Math.max(1,Math.min(2000,Number(pageSize)||config.dynamics.odataPageSize||500));
  const cap=Math.max(size,Math.min(100000,Number(maxRows)||config.dynamics.odataMaxRows||25000));
  const rows=[];let skip=0,pages=0;
  while(rows.length<cap){
    const top=Math.min(size,cap-rows.length),pageExtra=[String(extra||'').trim(),`$skip=${skip}`].filter(Boolean).join('&');
    const payload=await odataGet(entity,{filter,select,top,extra:pageExtra}),page=Array.isArray(payload?.value)?payload.value:[];
    pages+=1;if(!page.length)break;
    rows.push(...page.slice(0,cap-rows.length));skip+=page.length;
    if(page.length<top)break;
  }
  return{value:rows,rowCount:rows.length,pages,truncated:rows.length>=cap};
}

function cleanList(values=[]){return[...new Set((values||[]).map(v=>String(v||'').trim()).filter(Boolean))]}
export async function resolveStorePriceGroups(storeId,{force=false}={}){
  const configured=cleanList([config.dynamics.storePriceGroups?.[storeId],config.dynamics.defaultPriceGroup||'Franprix']);
  const store=storeOperationalSettings(storeId),retailChannelId=String(store?.d365?.retailChannelId||'').trim()||null;
  if(!isD365ReadLive('promotion')||!retailChannelId)return{groups:configured,retailChannelId,source:retailChannelId?'CONFIG_ONLY':'NO_RETAIL_CHANNEL',entity:null,error:null};
  const cacheKey=`${storeId}|${retailChannelId}`,ttl=Math.max(5,Math.min(300,Number(process.env.STOREOPS_PRICE_GROUP_CACHE_SECONDS)||15)),cached=priceGroupCache.get(cacheKey);
  if(!force&&cached&&Date.now()<cached.expiresAt)return cached.value;
  const explicit=String(process.env.D365_CHANNEL_PRICE_GROUP_ENTITY||'').trim(),candidates=cleanList(explicit?[explicit]:['RetailChannelPriceGroups','RetailChannelPriceGroupEntity']);
  const channelField=String(process.env.D365_CHANNEL_PRICE_GROUP_CHANNEL_FIELD||'RetailChannelId').trim()||'RetailChannelId',groupField=String(process.env.D365_CHANNEL_PRICE_GROUP_CODE_FIELD||'GroupCode').trim()||'GroupCode';
  let lastError=null;
  for(const entityName of candidates){
    try{
      const payload=await odataGetAll(entityName,{filter:`${channelField} eq '${escapeOData(retailChannelId)}'`,select:`${channelField},${groupField}`,extra:config.dynamics.dataAreaId?'cross-company=true':'',pageSize:100,maxRows:1000});
      const rows=(payload.value||[]).filter(row=>String(row?.[channelField]||'').trim()===retailChannelId),channelGroups=cleanList(rows.map(row=>row?.[groupField])),groups=cleanList([...configured,...channelGroups]);
      const value={groups,retailChannelId,source:'D365_RETAIL_CHANNEL',entity:entityName,channelField,groupField,rowCount:rows.length,truncated:!!payload.truncated,error:null};
      priceGroupCache.set(cacheKey,{value,expiresAt:Date.now()+ttl*1000});return value;
    }catch(error){lastError={code:error?.code||'D365_CHANNEL_PRICE_GROUP_READ_FAILED',message:error?.message||String(error),entity:entityName}}
  }
  const value={groups:configured,retailChannelId,source:'CONFIG_FALLBACK',entity:null,error:lastError};
  priceGroupCache.set(cacheKey,{value,expiresAt:Date.now()+Math.min(ttl,15)*1000});return value;
}

export async function getProductByEan(ean){
  if(!isD365ReadLive('product')) return PRODUCTS[ean] || null;
  const c=config.dynamics;
  if(!c.barcodeEntity) throw Object.assign(new Error('D365_BARCODE_ENTITY non configuré'),{status:503,code:'D365_MAPPING_REQUIRED'});

  const filters=[`${c.barcodeField} eq '${escapeOData(ean)}'`];
  if(c.dataAreaId) filters.push(`${c.dataAreaField} eq '${escapeOData(c.dataAreaId)}'`);
  const barcodePayload=await odataGet(c.barcodeEntity,{
    filter:filters.join(' and '),
    top:1,
    extra:c.dataAreaId?'cross-company=true':''
  });
  const barcodeRow=barcodePayload?.value?.[0]; if(!barcodeRow) return null;
  const productNumber=barcodeRow[c.barcodeProductField];
  const barcodeName=barcodeRow[c.barcodeDescriptionField]||barcodeRow.Description||barcodeRow.description||productNumber||ean;
  const unit=barcodeRow[c.barcodeUnitField]||barcodeRow.UnitID||barcodeRow.UnitId||null;
  const dataAreaId=barcodeRow[c.dataAreaField]||barcodeRow.dataAreaId||c.dataAreaId||null;
  const barcodeProduct={ean,name:barcodeName,price:null,stock:null,category:barcodeRow.Category||'Autre',productNumber:productNumber||null,unit,dataAreaId,source:'D365'};

  if(!c.productEntity || !productNumber)return barcodeProduct;
  try{
    const inventoryUnitField=c.productEntity==='ReleasedProductsV2'?'InventoryUnitSymbol':null,select=[c.productNumberField,c.productNameField,inventoryUnitField].filter(Boolean).join(','),productPayload=await odataGet(c.productEntity,{filter:`${c.productNumberField} eq '${escapeOData(productNumber)}'`,select,top:1,extra:c.dataAreaId?'cross-company=true':''}),p=productPayload?.value?.[0]||{};
    return {...barcodeProduct,name:p[c.productNameField]||barcodeName||productNumber,category:p.Category||barcodeRow.Category||'Autre',inventoryUnit:inventoryUnitField?(p[inventoryUnitField]||unit||null):(unit||null)};
  }catch(e){
    return {...barcodeProduct,productEnrichment:'FAILED',productEnrichmentMessage:e.message};
  }
}

export async function postReceiptToDynamics(poNumber,payload={}){if(config.dynamics.mode!=='live') return {ok:true,simulated:true,poNumber,postedAt:now()};throw Object.assign(new Error('Posting réception Dynamics live non configuré : mapper le service de réception F&O avant activation.'),{status:501,code:'D365_RECEIPT_WRITE_NOT_MAPPED',details:{poNumber,payload}})}
export async function postInventoryAdjustmentToDynamics(sessionId,payload={}){if(config.dynamics.mode!=='live') return {ok:true,simulated:true,sessionId,postedAt:now(),lines:payload.lines?.length||0};throw Object.assign(new Error('Posting ajustement stock Dynamics live non configuré : mapper le journal d’inventaire / ajustement F&O avant activation.'),{status:501,code:'D365_INVENTORY_WRITE_NOT_MAPPED',details:{sessionId,payload}})}
export async function postLossToDynamics(lossId,payload={}){if(config.dynamics.mode!=='live') return {ok:true,simulated:true,lossId,postedAt:now(),quantity:payload.quantity||0};throw Object.assign(new Error('Posting démarque/perte Dynamics live non configuré : mapper le journal de mouvement ou ajustement stock F&O avant activation.'),{status:501,code:'D365_LOSS_WRITE_NOT_MAPPED',details:{lossId,payload}})}

function dateOnly(v){const s=String(v||'');return /^\d{4}-\d{2}-\d{2}/.test(s)?s.slice(0,10):null}
function openBoundary(v){const d=dateOnly(v);return !d||d==='1900-01-01'||d==='1900-01-02'}
function activeOffer(h,day){if(h?.Status!=='Enabled'||h?.ProcessingStatus!=='Processed')return false;const from=dateOnly(h.ValidFrom),to=dateOnly(h.ValidTo);return (openBoundary(from)||from<=day)&&(openBoundary(to)||to>=day)}
export function previousBusinessDay(day){const d=new Date(`${dateOnly(day)||day}T00:00:00Z`);if(Number.isNaN(d.getTime()))return null;d.setUTCDate(d.getUTCDate()-1);return d.toISOString().slice(0,10)}
export function offerEndedYesterday(h,day){if(h?.ProcessingStatus!=='Processed')return false;const to=dateOnly(h.ValidTo),prev=previousBusinessDay(day);return !!to&&!openBoundary(to)&&!!prev&&to===prev}
export function offerStartedYesterday(h,day){if(h?.Status!=='Enabled'||h?.ProcessingStatus!=='Processed')return false;const from=dateOnly(h.ValidFrom),prev=previousBusinessDay(day);return !!from&&!openBoundary(from)&&!!prev&&from===prev}
export function resolveStorePriceGroup(storeId){return String(config.dynamics.storePriceGroups?.[storeId]||config.dynamics.defaultPriceGroup||'Franprix').trim()||'Franprix'}
function mixQty(line){return Number(line?.MixAndMatchNumberOfItemsNeeded||0)||null}
function promoPresentation(header,line){
  const name=String(header?.Name||'').trim(),type=header?.PeriodicDiscountType;
  if(type==='MixAndMatch'){
    if(header.MixAndMatchDiscountType==='DealPrice'){
      const qty=mixQty(line),deal=Number(header.MixAndMatchDealPrice||0)||null;
      return{label:qty&&deal?`${qty} article(s) éligible(s) pour ${deal.toFixed(2)} DH`:`Offre Mix & Match · prix de lot`,warning:/50\s*%/i.test(name)?'Libellé marketing en pourcentage : le contrôle StoreOps suit le DealPrice Dynamics, pas le texte de l’offre.':null};
    }
    if(header.MixAndMatchDiscountType==='LeastExpensive'){
      const qty=mixQty(line),count=Number(header.MixAndMatchNoOfLeastExpensiveLines||0)||1,pct=Number(header.DiscountPercentValue||0)||100;
      let warning=null;
      if(/buy\s*2.*get\s*1\s*free|2\s*\+\s*1/i.test(name)&&qty&&qty<3)warning='⚠️ Libellé "2+1" potentiellement incohérent avec la mécanique Dynamics : seulement 2 articles requis.';
      return{label:`Sur ${qty||'N'} article(s) éligible(s), ${count} moins cher(s) remisé(s) à ${pct}%`,warning};
    }
    return{label:`Mix & Match · ${header.MixAndMatchDiscountType||'mécanique spéciale'}`,warning:null};
  }
  if(line?.OfferDiscountMethod==='PercentOff')return{label:`Remise ${Number(line.OfferDiscountPercentage||header?.DiscountPercentValue||0)}%`,warning:null};
  if(Number(line?.OfferDiscountAmount||0))return{label:`Remise ${Number(line.OfferDiscountAmount).toFixed(2)} DH`,warning:null};
  if(Number(line?.OfferPrice||0))return{label:`Prix promo ${Number(line.OfferPrice).toFixed(2)} DH`,warning:null};
  return{label:name||type||'Promotion',warning:null};
}
function promoExpectedPrice(base,header,line){if(Number(line?.OfferPrice||0))return Number(line.OfferPrice);const b=base==null||base===''?null:Number(base);if(!Number.isFinite(b))return null;if(header?.PeriodicDiscountType==='MixAndMatch')return b;if(line?.OfferDiscountMethod==='PercentOff'){const p=Number(line.OfferDiscountPercentage||header?.DiscountPercentValue||0);return Number((b*(1-p/100)).toFixed(2))}if(Number(line?.OfferDiscountAmount||0))return Number(Math.max(0,b-Number(line.OfferDiscountAmount)).toFixed(2));return b}

export function commercialOfferFilter(field,values=[]){const rows=[...new Set((values||[]).map(x=>String(x||'').trim()).filter(Boolean))];return rows.length?`(${rows.map(v=>`${field} eq '${escapeOData(v)}'`).join(' or ')})`:''}
function commercialChunks(values,size=12){const out=[];for(let i=0;i<values.length;i+=size)out.push(values.slice(i,i+size));return out}
function commercialLimits(){return{pageSize:Math.max(50,Math.min(500,Number(process.env.D365_COMMERCIAL_PAGE_SIZE)||200)),maxGroups:Math.max(200,Math.min(5000,Number(process.env.D365_COMMERCIAL_MAX_GROUPS)||2000)),maxLines:Math.max(500,Math.min(15000,Number(process.env.D365_COMMERCIAL_MAX_LINES)||6000))}}

export async function getCommercialChanges(storeId,businessDate){
  if(!(isD365ReadLive('price')&&isD365ReadLive('promotion')))return[{sourceKey:`PROMO-NUT750-${businessDate}`,actionType:'PROMO_START',ean:'3017620422003',productNumber:'NUT750',productName:'Nutella 750g',category:'Épicerie',oldPrice:64.90,expectedPrice:59.90,promoLabel:'Promo lancement · 59,90 DH',signageAction:'INSTALL',priority:'HIGH',blockingOpening:true},{sourceKey:`PRICE-LAIT1L-${businessDate}`,actionType:'PRICE_CHANGE',ean:'6111040001111',productNumber:'LAIT1L',productName:'Lait frais entier 1L',category:'Frais',oldPrice:11.90,expectedPrice:12.90,promoLabel:null,signageAction:'VERIFY',priority:'HIGH',blockingOpening:true},{sourceKey:`PROMOEND-YAOURT4-${businessDate}`,actionType:'PROMO_END',ean:'3274080005003',productNumber:'YAOURT4',productName:'Yaourt nature 4x110g',category:'Frais',oldPrice:15.90,expectedPrice:18.50,promoLabel:'Fin promo 15,90 DH',signageAction:'REMOVE',priority:'HIGH',blockingOpening:true}].map(x=>({...x,storeId,source:'SIMULATED_D365'}));

  const day=dateOnly(businessDate)||new Date().toISOString().slice(0,10),company=config.dynamics.dataAreaId,companyFilter=company?`${config.dynamics.dataAreaField} eq '${escapeOData(company)}'`:'',extra=company?'cross-company=true':'',priceGroupContext=await resolveStorePriceGroups(storeId),priceGroups=priceGroupContext.groups?.length?priceGroupContext.groups:[resolveStorePriceGroup(storeId)],limits=commercialLimits();
  const groupEntity=config.dynamics.entities?.retailDiscountPriceGroup||'RetailDiscountPriceGroups',headerEntity=config.dynamics.entities?.retailDiscount||'RetailDiscounts',lineEntity=config.dynamics.entities?.retailDiscountLine||'RetailDiscountLines';
  const groupFilter=[companyFilter,commercialOfferFilter('PriceGroupId',priceGroups)].filter(Boolean).join(' and ');
  const groupsPayload=await odataGetAll(groupEntity,{filter:groupFilter,select:'OfferId,PriceGroupId',extra,pageSize:limits.pageSize,maxRows:limits.maxGroups});
  if(groupsPayload.truncated)throw Object.assign(new Error(`La liste d’offres des groupes prix ${priceGroups.join(', ')} dépasse la limite de sécurité StoreOps.`),{status:503,code:'D365_COMMERCIAL_GROUPS_TRUNCATED',details:{priceGroups,rowCount:groupsPayload.rowCount,retailChannelId:priceGroupContext.retailChannelId}});
  const groupSet=new Set(priceGroups),offerGroups=new Map(),offerIds=[];
  for(const row of (groupsPayload.value||[])){
    const group=String(row.PriceGroupId||'').trim(),offerId=String(row.OfferId||'').trim();if(!offerId||!groupSet.has(group))continue;
    if(!offerGroups.has(offerId))offerGroups.set(offerId,new Set());offerGroups.get(offerId).add(group);offerIds.push(offerId);
  }
  const uniqueOfferIds=[...new Set(offerIds)];
  if(!uniqueOfferIds.length)return[];

  const headers=[];
  for(const batch of commercialChunks(uniqueOfferIds,20)){
    const offerFilter=commercialOfferFilter('OfferId',batch),filter=[companyFilter,offerFilter].filter(Boolean).join(' and ');
    const payload=await odataGet(headerEntity,{filter,select:'OfferId,Name,Status,ProcessingStatus,ValidFrom,ValidTo,PeriodicDiscountType,MixAndMatchDiscountType,MixAndMatchDealPrice,MixAndMatchNoOfLeastExpensiveLines,DiscountPercentValue',top:500,extra});
    headers.push(...(Array.isArray(payload?.value)?payload.value:[]));
  }
  const pendingDiagnostics=headers.filter(h=>{
    if(h?.Status!=='Enabled'||h?.ProcessingStatus==='Processed')return false;
    const from=dateOnly(h.ValidFrom),to=dateOnly(h.ValidTo);
    return (openBoundary(from)||from<=day)&&(openBoundary(to)||to>=day)
  }).map(h=>({sourceKey:`D365-PROMO-PROCESSING-${h.OfferId}-${day}`,actionType:'VERIFY',ean:`OFFER:${h.OfferId}`,productNumber:null,productName:h.Name||`Promotion ${h.OfferId}`,category:null,oldPrice:null,expectedPrice:null,promoLabel:`Promotion rattachée à Val Fleuri mais pas encore traitée par Commerce · ProcessingStatus: ${h.ProcessingStatus||'UNKNOWN'}`,signageAction:'VERIFY',priority:'HIGH',blockingOpening:false,storeId,priceGroups:[...(offerGroups.get(String(h.OfferId))||[])],retailChannelId:priceGroupContext.retailChannelId,source:'D365_RETAIL_PRICING_DIAGNOSTIC'}));
  const eligibleHeaders=headers.filter(h=>activeOffer(h,day)||offerEndedYesterday(h,day)),eligibleIds=[...new Set(eligibleHeaders.map(h=>String(h.OfferId||'').trim()).filter(Boolean))];
  if(!eligibleIds.length)return pendingDiagnostics;
  const headerById=new Map(eligibleHeaders.map(h=>[String(h.OfferId),h]));

  const linePayloads=await Promise.all(commercialChunks(eligibleIds,6).map(batch=>{
    const offerFilter=commercialOfferFilter('OfferId',batch),filter=[companyFilter,offerFilter].filter(Boolean).join(' and ');
    return odataGetAll(lineEntity,{filter,select:'OfferId,LineNum,LineType,ItemId,Name,CategoryName,OfferDiscountMethod,OfferDiscountPercentage,OfferDiscountAmount,OfferPrice,MixAndMatchNumberOfItemsNeeded',extra,pageSize:limits.pageSize,maxRows:limits.maxLines});
  }));
  if(linePayloads.some(x=>x.truncated))throw Object.assign(new Error('Les lignes promotionnelles actives dépassent la limite de sécurité StoreOps.'),{status:503,code:'D365_COMMERCIAL_LINES_TRUNCATED',details:{offerCount:eligibleIds.length,maxLines:limits.maxLines}});

  const changes=[],categorySeen=new Set();
  for(const payload of linePayloads)for(const line of (payload.value||[])){
    const offerId=String(line.OfferId||''),header=headerById.get(offerId);if(!header||line.LineType==='Exclude')continue;
    const item=String(line.ItemId||'').trim(),category=String(line.CategoryName||'').trim()||null,presentation=promoPresentation(header,line),ended=offerEndedYesterday(header,day),startsToday=!ended&&dateOnly(header.ValidFrom)===day,startedYesterday=!ended&&offerStartedYesterday(header,day),catchUp=startedYesterday&&!startsToday,promoPrice=promoExpectedPrice(null,header,line);
    if(item){
      const promoLabel=ended?['Fin de promotion',header.Name||null,presentation.label,'Retirer la signalétique promotionnelle'].filter(Boolean).join(' · '):[catchUp?'Contrôle de rattrapage · promotion démarrée hier':null,header.Name||null,presentation.label,presentation.warning].filter(Boolean).join(' · ');
      changes.push({sourceKey:ended?`D365-PROMO-END-${offerId}-${line.LineNum}-${day}`:`D365-PROMO-${offerId}-${line.LineNum}-${day}`,actionType:ended?'PROMO_END':(startsToday||startedYesterday)?'PROMO_START':'VERIFY',ean:`ITEM:${item}`,productNumber:item,productName:line.Name||item,category,oldPrice:ended&&Number.isFinite(promoPrice)?promoPrice:null,expectedPrice:ended?null:(Number.isFinite(promoPrice)?promoPrice:null),promoLabel,signageAction:ended?'REMOVE':(startsToday||startedYesterday)?'INSTALL':'VERIFY',priority:ended?'HIGH':presentation.warning?'CRITICAL':'HIGH',blockingOpening:true,storeId,priceGroup:[...(offerGroups.get(offerId)||[])][0]||priceGroups[0]||null,priceGroups:[...(offerGroups.get(offerId)||[])],retailChannelId:priceGroupContext.retailChannelId,validFrom:header.ValidFrom||null,validTo:header.ValidTo||null,source:'D365_RETAIL_PRICING'});
    }else if(category){
      const key=`${offerId}|${category}`;if(categorySeen.has(key))continue;categorySeen.add(key);
      const promoLabel=ended?['Fin de promotion',header.Name||null,presentation.label,'Retirer la signalétique promotionnelle de la catégorie'].filter(Boolean).join(' · '):[catchUp?'Contrôle de rattrapage · promotion démarrée hier':null,header.Name||null,presentation.label,presentation.warning,'Contrôle catégorie : vérifier la signalétique et la mécanique en rayon'].filter(Boolean).join(' · ');
      changes.push({sourceKey:ended?`D365-PROMO-END-CAT-${offerId}-${category}-${day}`:`D365-PROMO-CAT-${offerId}-${category}-${day}`,actionType:ended?'PROMO_END':(startsToday||startedYesterday)?'PROMO_START':'VERIFY',ean:`CATEGORY:${category}`,productNumber:null,productName:`Catégorie ${category}`,category,oldPrice:null,expectedPrice:null,promoLabel,signageAction:ended?'REMOVE':(startsToday||startedYesterday)?'INSTALL':'VERIFY',priority:ended?'HIGH':presentation.warning?'CRITICAL':'HIGH',blockingOpening:true,storeId,priceGroup:[...(offerGroups.get(offerId)||[])][0]||priceGroups[0]||null,priceGroups:[...(offerGroups.get(offerId)||[])],retailChannelId:priceGroupContext.retailChannelId,validFrom:header.ValidFrom||null,validTo:header.ValidTo||null,source:'D365_RETAIL_PRICING'});
    }
  }
  return [...pendingDiagnostics,...changes];
}

export async function getCashClosingSnapshot(storeId,businessDate){if(config.dynamics.mode!=='live')return{sourceKey:`CASH-CLOSING-${storeId}-${businessDate}`,storeId,businessDate,source:'SIMULATED_D365',lines:[{tillCode:'C01',shiftId:`${storeId.toUpperCase()}-C01-${businessDate}`,cashierName:'Caissier 1',expectedSales:4200,expectedCash:1600,expectedCard:2400,expectedOther:200},{tillCode:'C02',shiftId:`${storeId.toUpperCase()}-C02-${businessDate}`,cashierName:'Caissier 2',expectedSales:3500,expectedCash:1400,expectedCard:2000,expectedOther:100},{tillCode:'C03',shiftId:`${storeId.toUpperCase()}-C03-${businessDate}`,cashierName:'Caissier 3',expectedSales:2800,expectedCash:900,expectedCard:1800,expectedOther:100}]};throw Object.assign(new Error('Flux clôture caisses Dynamics live non configuré : mapper shifts, statements, modes de paiement et remises TPE avant activation.'),{status:503,code:'D365_CASH_CLOSING_MAPPING_REQUIRED',details:{storeId,businessDate}})}