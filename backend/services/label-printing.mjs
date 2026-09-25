import { config } from '../config.mjs';
import { audit,todayISO } from '../db.mjs';
import { odataGetAll,callDynamicsService } from './dynamics.mjs';
import { storeOperationalSettings } from './store-settings.mjs';

const clean=v=>String(v??'').trim();
const PILOT_PRINTER_HINTS=Object.freeze({
 'val-fleuri':'ValFleuri',
 'trefle':'Trefel'
});

export function labelPrintContract(){
 return{
  servicePath:clean(process.env.D365_LABEL_PRINT_SERVICE_PATH)||null,
  dataSourceId:clean(process.env.D365_LABEL_DATA_SOURCE_ID)||'Promo Label',
  company:clean(process.env.D365_DATA_AREA_ID)||'5001',
  connectorConfigured:!!clean(process.env.D365_LABEL_PRINT_SERVICE_PATH),
  contractVersion:'STOREOPS_LABEL_PRINT_V1'
 }
}

export async function labelPrintingConfig(storeId,{force=false}={}){
 const store=storeOperationalSettings(storeId),contract=labelPrintContract(),hint=PILOT_PRINTER_HINTS[storeId]||clean(store?.name)||clean(store?.storeWarehouseId)||null;
 if(config.dynamics.mode!=='live'){
  return{status:'SIMULATED',storeId,storeNumber:store?.d365?.storeNumber||null,warehouseId:store?.storeWarehouseId||null,printer:null,dataSourceId:contract.dataSourceId,connectorConfigured:contract.connectorConfigured,canPrint:false,reason:'D365_MODE_NOT_LIVE'}
 }
 let rows=[];
 try{
  const payload=await odataGetAll('DocumentRoutingPrinters',{extra:contract.company?'cross-company=true':'',pageSize:100,maxRows:500});
  rows=payload.value||[];
 }catch(error){
  return{status:'UNAVAILABLE',storeId,printer:null,dataSourceId:contract.dataSourceId,connectorConfigured:contract.connectorConfigured,canPrint:false,reason:error?.code||'D365_PRINTER_READ_FAILED',error:error?.message||String(error)}
 }
 const active=rows.filter(r=>String(r.PrinterIsActive||'').toUpperCase()==='YES'&&(!contract.company||String(r.PrinterCompanyId||'')===contract.company));
 const printer=active.find(r=>hint&&String(r.PrinterName||'').toLowerCase().includes(String(hint).toLowerCase()))||null;
 const status=!printer?'PRINTER_NOT_FOUND':contract.connectorConfigured?'READY':'CONNECTOR_REQUIRED';
 return{
  status,storeId,
  storeNumber:store?.d365?.storeNumber||null,
  warehouseId:store?.storeWarehouseId||null,
  dataSourceId:contract.dataSourceId,
  printer:printer?{id:clean(printer.PrinterId),name:clean(printer.PrinterName),path:clean(printer.PrinterPath),company:clean(printer.PrinterCompanyId),clientApplicationId:clean(printer.ClientApplicationId)}:null,
  connectorConfigured:contract.connectorConfigured,
  canPrint:status==='READY',
  reason:status==='CONNECTOR_REQUIRED'?'D365_CUSTOM_LABEL_SERVICE_REQUIRED':status==='PRINTER_NOT_FOUND'?'STORE_PRINTER_NOT_FOUND':null,
  availablePrinters:active.map(r=>({id:clean(r.PrinterId),name:clean(r.PrinterName)}))
 }
}

export async function printProductLabel({storeId,user,productNumber,ean=null,quantity=1,businessDate=null}={}){
 const item=clean(productNumber),qty=Math.max(1,Math.min(100,Number(quantity)||1)),cfg=await labelPrintingConfig(storeId);
 if(!item)throw Object.assign(new Error('Code article obligatoire pour imprimer le balisage.'),{status:400,code:'LABEL_PRINT_ITEM_REQUIRED'});
 if(!cfg.printer)throw Object.assign(new Error('Aucune imprimante D365 active n’est associée à ce magasin.'),{status:409,code:'LABEL_PRINT_PRINTER_NOT_FOUND',details:cfg});
 const contract=labelPrintContract();
 if(!contract.connectorConfigured)throw Object.assign(new Error('Le service D365 de déclenchement des étiquettes doit encore être déployé. L’imprimante du magasin est déjà reconnue par StoreOps.'),{status:409,code:'LABEL_PRINT_D365_CONNECTOR_REQUIRED',details:{storeId,printer:cfg.printer,dataSourceId:cfg.dataSourceId,expectedServicePath:'/api/services/StoreOpsIntegration/LabelPrintService/printProductLabel'}});
 const store=storeOperationalSettings(storeId),payload={
  contractVersion:contract.contractVersion,
  company:contract.company,
  storeId,
  storeNumber:store?.d365?.storeNumber||null,
  warehouseId:store?.storeWarehouseId||null,
  itemNumber:item,
  ean:clean(ean)||null,
  labelLayoutDataSourceId:contract.dataSourceId,
  printerName:cfg.printer.name,
  printerId:cfg.printer.id,
  quantity:qty
 };
 const result=await callDynamicsService(contract.servicePath,payload);
 audit({storeId,businessDate:businessDate||todayISO(),userId:user?.id||null,action:'PRODUCT_LABEL_PRINT_REQUESTED',entityType:'PRODUCT',entityId:item,details:{printerName:cfg.printer.name,printerId:cfg.printer.id,dataSourceId:cfg.dataSourceId,quantity:qty}});
 return{status:'SENT',storeId,productNumber:item,printer:cfg.printer,dataSourceId:cfg.dataSourceId,quantity:qty,dynamics:result||null}
}
