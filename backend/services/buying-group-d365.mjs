import {config} from '../config.mjs';
import {isD365ReadLive,odataGetAll} from './dynamics.mjs';

// Strictly read-only. Never query other D365 legal entities from this StoreOps connector.
const clean=(x,max=160)=>String(x??'').trim().slice(0,max);
const validName=x=>/^[A-Za-z][A-Za-z0-9_]{0,89}$/.test(String(x??''));
const json=(payload,status=200)=>Response.json(payload,{status,headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
const field=(r,keys)=>keys.map(k=>r?.[k]).find(x=>x!==undefined&&x!==null&&String(x).trim()!=='');
const date=v=>{const s=clean(v,40);return /^\d{4}-\d{2}-\d{2}/.test(s)?s.slice(0,10):null};
const sqlEsc=s=>String(s).replaceAll("'","''");

export function projectPurchaseHeaders(raw,company,settings){
  const area=clean(company,30).toLowerCase(),areaField=settings.dataAreaField;
  const result=[],seen=new Set();
  for(const row of raw||[]){
    if(!row||typeof row!=='object')continue;
    // Defense in depth: the OData filter must not be the sole company boundary.
    if(clean(row[areaField],30).toLowerCase()!==area)continue;
    const po=clean(field(row,[settings.purchaseOrderField,'PurchaseOrderNumber']),100);
    if(!po||seen.has(po))continue;
    seen.add(po);
    result.push({
      purchaseOrderNumber:po,
      supplierAccount:clean(field(row,[settings.vendorField,'OrderVendorAccountNumber','InvoiceVendorAccountNumber']),75)||null,
      supplierName:clean(field(row,[settings.vendorNameField,'PurchaseOrderName','VendorName']),160)||null,
      status:clean(field(row,[settings.headerStatusField,'PurchaseOrderStatus']),50)||null,
      creationDate:date(field(row,[settings.creationDateField,'AccountingDate','CreatedDateTime','PurchaseOrderCreationDate'])),
      deliveryDate:date(field(row,[settings.headerDateField,'RequestedDeliveryDate','ConfirmedDeliveryDate'])),
      warehouse:clean(field(row,[settings.headerWarehouseField,'DefaultReceivingWarehouseId']),50)||null,
      dataAreaId:clean(row[areaField],30)
    });
  }
  return result;
}
export async function readConfiguredPurchaseOrders(){
  const cfg=config.dynamics,company=clean(cfg.dataAreaId,30),r=cfg.receiving||{},pageSize=60;
  const base={source:'STOREOPS_D365_CONFIGURED_COMPANY',company:company||null,headerEntity:r.headerEntity||null,writeEnabled:false,
    isFinancialLedger:false,crossCompany:false,
    warning:'Lecture de commandes uniquement : les PO ne sont pas des factures comptabilisées et ne doivent pas servir de base aux RFA encaissées.'};
  if(!isD365ReadLive('receiving'))return{...base,status:'READ_NOT_ENABLED',items:[],nextAction:'Activer et valider D365_RECEIVING_READ_MODE=live avec les rôles D365 requis.'};
  if(!company)return{...base,status:'LEGAL_ENTITY_REQUIRED',items:[],nextAction:'Configurer D365_DATA_AREA_ID sur le connecteur StoreOps.'};
  if(!validName(r.headerEntity)||!validName(cfg.dataAreaField))return{...base,status:'ENTITY_MAPPING_INVALID',items:[],nextAction:'Valider les champs PO et dataAreaId dans la configuration Dynamics.'};
  try{
    const filter=cfg.dataAreaField+" eq '"+sqlEsc(company)+"'";
    const payload=await odataGetAll(r.headerEntity,{filter,extra:'cross-company=true',pageSize,maxRows:pageSize});
    const rows=projectPurchaseHeaders(payload.value,company,{dataAreaField:cfg.dataAreaField,...r});
    return{...base,status:'LIVE_READ',items:rows,returned:rows.length,truncated:!!payload.truncated,
      omittedByCompanyGuard:(payload.value||[]).length-rows.length,
      nextAction:'Pour les autres enseignes, valider les sociétés D365 et permissions correspondantes avant ouverture cross-company.'};
  }catch(error){
    console.error('H&S D365 bounded PO read failed',error);
    return{...base,status:'READ_FAILED',items:[],errorCode:clean(error?.code||'D365_READ_FAILED',90),
      nextAction:'Vérifier la disponibilité de PurchaseOrderHeadersV2, le compte de service et les autorisations de la société configurée.'};
  }
}
export async function serveBuyingD365(req){
  if(req.method!=='GET')return json({error:'Méthode non autorisée.'},405);
  const snapshot=await readConfiguredPurchaseOrders();
  return json(snapshot,snapshot.status==='READ_FAILED'?503:200);
}
