import { config } from '../config.mjs';

const PRODUCTS = {
  '3017620422003': {ean:'3017620422003',name:'Nutella 750g',price:64.90,stock:17,category:'Épicerie',productNumber:'NUT750'},
  '6111040001111': {ean:'6111040001111',name:'Lait frais entier 1L',price:12.90,stock:24,category:'Frais',productNumber:'LAIT1L'},
  '3274080005003': {ean:'3274080005003',name:'Yaourt nature 4x110g',price:18.50,stock:36,category:'Frais',productNumber:'YAOURT4'}
};

let tokenCache={token:null,expiresAt:0};
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
  const r=await fetch(url,{method,headers:{authorization:`Bearer ${token}`,accept:'application/json','content-type':'application/json',...headers},body:body?JSON.stringify(body):undefined});
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

export async function getDynamicsHealth(){const d=await getDynamicsDiagnostics();return{connected:d.connected,mode:d.mode,readModes:d.configuration.readModes||{},checkedAt:d.checkedAt,baseUrl:d.configuration.baseUrl.value,missing:d.checks.config.missing||[],latencyMs:d.checks.metadata.latencyMs||d.checks.token.latencyMs||null,error:d.checks.metadata.error||d.checks.token.error||null,configuredEntities:{productEntity:config.dynamics.productEntity||null,barcodeEntity:config.dynamics.barcodeEntity||null,stockEntity:config.dynamics.stock?.entity||null}}}

export async function listDataEntities(search=''){
  if(config.dynamics.mode!=='live') return [];
  const payload=await d365Fetch('/Metadata/DataEntities');
  const rows=payload?.value||payload||[];
  const q=String(search||'').toLowerCase();
  return rows.filter(x=>!q || JSON.stringify(x).toLowerCase().includes(q)).slice(0,100);
}

export async function probeDataEntity(entity,{top=1,filter=''}={}){
  const name=String(entity||'').trim();if(!/^[A-Za-z0-9_]+$/.test(name))throw Object.assign(new Error('Nom de Data Entity invalide.'),{status:400,code:'D365_ENTITY_NAME_INVALID'});
  const safeTop=Math.max(1,Math.min(20,Number(top)||1));
  const appliedFilter=String(filter||'').trim();
  if(config.dynamics.mode!=='live')return{ok:false,mode:'SIMULATED',entity:name,filter:appliedFilter||null,rows:[],message:'Le probe OData réel est disponible uniquement avec D365_MODE=live.'};
  const qs=new URLSearchParams();qs.set('$top',String(safeTop));if(appliedFilter)qs.set('$filter',appliedFilter);
  const started=Date.now(),payload=await d365Fetch(`/data/${encodeURIComponent(name)}?${qs.toString()}`),rows=payload?.value||[];
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
    const select=[c.productNumberField,c.productNameField].join(','),productPayload=await odataGet(c.productEntity,{filter:`${c.productNumberField} eq '${escapeOData(productNumber)}'`,select,top:1,extra:c.dataAreaId?'cross-company=true':''}),p=productPayload?.value?.[0]||{};
    return {...barcodeProduct,name:p[c.productNameField]||barcodeName||productNumber,category:p.Category||barcodeRow.Category||'Autre'};
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
function promoExpectedPrice(base,header,line){const b=base==null||base===''?null:Number(base);if(!Number.isFinite(b))return null;if(header?.PeriodicDiscountType==='MixAndMatch')return b;if(line?.OfferDiscountMethod==='PercentOff'){const p=Number(line.OfferDiscountPercentage||header?.DiscountPercentValue||0);return Number((b*(1-p/100)).toFixed(2))}if(Number(line?.OfferDiscountAmount||0))return Number(Math.max(0,b-Number(line.OfferDiscountAmount)).toFixed(2));if(Number(line?.OfferPrice||0))return Number(line.OfferPrice);return b}

export async function getCommercialChanges(storeId,businessDate){
  if(!(isD365ReadLive('price')&&isD365ReadLive('promotion')))return[{sourceKey:`PROMO-NUT750-${businessDate}`,actionType:'PROMO_START',ean:'3017620422003',productNumber:'NUT750',productName:'Nutella 750g',category:'Épicerie',oldPrice:64.90,expectedPrice:59.90,promoLabel:'Promo lancement · 59,90 DH',signageAction:'INSTALL',priority:'HIGH',blockingOpening:true},{sourceKey:`PRICE-LAIT1L-${businessDate}`,actionType:'PRICE_CHANGE',ean:'6111040001111',productNumber:'LAIT1L',productName:'Lait frais entier 1L',category:'Frais',oldPrice:11.90,expectedPrice:12.90,promoLabel:null,signageAction:'VERIFY',priority:'HIGH',blockingOpening:true},{sourceKey:`PROMOEND-YAOURT4-${businessDate}`,actionType:'PROMO_END',ean:'3274080005003',productNumber:'YAOURT4',productName:'Yaourt nature 4x110g',category:'Frais',oldPrice:15.90,expectedPrice:18.50,promoLabel:'Fin promo 15,90 DH',signageAction:'REMOVE',priority:'HIGH',blockingOpening:true}].map(x=>({...x,storeId,source:'SIMULATED_D365'}));
  const day=dateOnly(businessDate)||new Date().toISOString().slice(0,10),company=config.dynamics.dataAreaId,companyFilter=company?`${config.dynamics.dataAreaField} eq '${escapeOData(company)}'`:'',extra=company?'cross-company=true':'',priceGroup=resolveStorePriceGroup(storeId);
  const [headersPayload,linesPayload,groupsPayload,productsPayload,barcodesPayload]=await Promise.all([
    odataGetAll(config.dynamics.entities?.retailDiscount||'RetailDiscounts',{filter:companyFilter,extra}),
    odataGetAll(config.dynamics.entities?.retailDiscountLine||'RetailDiscountLines',{filter:companyFilter,extra}),
    odataGetAll(config.dynamics.entities?.retailDiscountPriceGroup||'RetailDiscountPriceGroups',{filter:companyFilter,extra}),
    odataGetAll(config.dynamics.entities?.basePrice||'ReleasedProductsV2',{filter:companyFilter,extra}),
    config.dynamics.barcodeEntity?odataGetAll(config.dynamics.barcodeEntity,{filter:companyFilter,extra}):Promise.resolve({value:[],rowCount:0,pages:0,truncated:false})
  ]);
  const candidateHeaders=(headersPayload?.value||[]).filter(h=>activeOffer(h,day)||offerEndedYesterday(h,day));
  const eligibleIds=new Set((groupsPayload?.value||[]).filter(g=>g.PriceGroupId===priceGroup).map(g=>g.OfferId));
  const eligibleHeaders=candidateHeaders.filter(h=>eligibleIds.has(h.OfferId));
  const headerById=new Map(eligibleHeaders.map(h=>[h.OfferId,h]));
  const productById=new Map((productsPayload?.value||[]).map(p=>[p.ItemNumber||p.ProductNumber,p]));
  const barcodeByProduct=new Map();
  for(const b of (barcodesPayload?.value||[])){const pn=b[config.dynamics.barcodeProductField];const ean=b[config.dynamics.barcodeField];if(pn&&ean&&!barcodeByProduct.has(pn))barcodeByProduct.set(pn,String(ean))}
  const changes=[],categorySeen=new Set();
  for(const line of (linesPayload?.value||[])){
    const header=headerById.get(line.OfferId);if(!header||line.LineType==='Exclude')continue;
    const item=String(line.ItemId||'').trim(),category=String(line.CategoryName||'').trim()||null,presentation=promoPresentation(header,line),ended=offerEndedYesterday(header,day),startsToday=!ended&&dateOnly(header.ValidFrom)===day;
    if(item){
      const product=productById.get(item)||{},baseRaw=product.SalesPrice,base=baseRaw==null||baseRaw===''?null:Number(baseRaw),promoPrice=promoExpectedPrice(base,header,line),ean=barcodeByProduct.get(item)||`ITEM:${item}`;
      const promoLabel=ended
        ?['Fin de promotion',header.Name||null,presentation.label,'Retirer la signalétique promotionnelle'].filter(Boolean).join(' · ')
        :[header.Name||null,presentation.label,presentation.warning].filter(Boolean).join(' · ');
      changes.push({sourceKey:ended?`D365-PROMO-END-${line.OfferId}-${line.LineNum}-${day}`:`D365-PROMO-${line.OfferId}-${line.LineNum}-${day}`,actionType:ended?'PROMO_END':startsToday?'PROMO_START':'VERIFY',ean,productNumber:item,productName:line.Name||product.ProductName||product.SearchName||item,category,oldPrice:ended&&Number.isFinite(promoPrice)?promoPrice:Number.isFinite(base)?base:null,expectedPrice:Number.isFinite(ended?base:promoPrice)?(ended?base:promoPrice):null,promoLabel,signageAction:ended?'REMOVE':startsToday?'INSTALL':'VERIFY',priority:ended?'HIGH':presentation.warning?'CRITICAL':'HIGH',blockingOpening:true,storeId,priceGroup,source:'D365_RETAIL_PRICING'});
    }else if(category){
      const key=`${line.OfferId}|${category}`;if(categorySeen.has(key))continue;categorySeen.add(key);
      const promoLabel=ended
        ?['Fin de promotion',header.Name||null,presentation.label,'Retirer la signalétique promotionnelle de la catégorie'].filter(Boolean).join(' · ')
        :[header.Name||null,presentation.label,presentation.warning,'Contrôle catégorie : vérifier la signalétique et la mécanique en rayon'].filter(Boolean).join(' · ');
      changes.push({sourceKey:ended?`D365-PROMO-END-CAT-${line.OfferId}-${category}-${day}`:`D365-PROMO-CAT-${line.OfferId}-${category}-${day}`,actionType:ended?'PROMO_END':startsToday?'PROMO_START':'VERIFY',ean:`CATEGORY:${category}`,productNumber:null,productName:`Catégorie ${category}`,category,oldPrice:null,expectedPrice:null,promoLabel,signageAction:ended?'REMOVE':startsToday?'INSTALL':'VERIFY',priority:ended?'HIGH':presentation.warning?'CRITICAL':'HIGH',blockingOpening:true,storeId,priceGroup,source:'D365_RETAIL_PRICING'});
    }
  }
  for(const p of (productsPayload?.value||[])){
    const item=p.ItemNumber||p.ProductNumber;if(!item||dateOnly(p.SalesPriceDate)!==day)continue;
    const ean=barcodeByProduct.get(item)||`ITEM:${item}`,price=Number(p.SalesPrice);
    if(!Number.isFinite(price))continue;
    changes.push({sourceKey:`D365-PRICE-${item}-${day}`,actionType:'PRICE_CHANGE',ean,productNumber:item,productName:p.ProductName||p.SearchName||item,category:null,oldPrice:null,expectedPrice:price,promoLabel:`Prix fiche Dynamics applicable · ${price.toFixed(2)} DH`,signageAction:'VERIFY',priority:'HIGH',blockingOpening:true,storeId,priceGroup,source:'D365_RETAIL_PRICING'});
  }
  return changes;
}

export async function getCashClosingSnapshot(storeId,businessDate){if(config.dynamics.mode!=='live')return{sourceKey:`CASH-CLOSING-${storeId}-${businessDate}`,storeId,businessDate,source:'SIMULATED_D365',lines:[{tillCode:'C01',shiftId:`${storeId.toUpperCase()}-C01-${businessDate}`,cashierName:'Caissier 1',expectedSales:4200,expectedCash:1600,expectedCard:2400,expectedOther:200},{tillCode:'C02',shiftId:`${storeId.toUpperCase()}-C02-${businessDate}`,cashierName:'Caissier 2',expectedSales:3500,expectedCash:1400,expectedCard:2000,expectedOther:100},{tillCode:'C03',shiftId:`${storeId.toUpperCase()}-C03-${businessDate}`,cashierName:'Caissier 3',expectedSales:2800,expectedCash:900,expectedCard:1800,expectedOther:100}]};throw Object.assign(new Error('Flux clôture caisses Dynamics live non configuré : mapper shifts, statements, modes de paiement et remises TPE avant activation.'),{status:503,code:'D365_CASH_CLOSING_MAPPING_REQUIRED',details:{storeId,businessDate}})}