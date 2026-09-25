import { api } from './api.js';

export async function labelPrintingConfig(storeId){
 return api(`/api/stores/${encodeURIComponent(storeId)}/label-printing/config`)
}

export async function printProductLabel({storeId,productNumber,ean=null,quantity=1}={}){
 const cfg=await labelPrintingConfig(storeId);
 if(!cfg?.printer)throw Object.assign(new Error('Aucune imprimante balisage active n’est associée à ce magasin dans Dynamics.'),{code:'LABEL_PRINT_PRINTER_NOT_FOUND',details:cfg});
 if(!cfg.canPrint){
  const e=new Error(`Imprimante ${cfg.printer.name} reconnue. Le connecteur D365 « Print custom labels » doit encore être déployé pour déclencher l’impression depuis StoreOps.`);
  e.code=cfg.reason||'LABEL_PRINT_D365_CONNECTOR_REQUIRED';e.details=cfg;throw e
 }
 return api(`/api/stores/${encodeURIComponent(storeId)}/label-printing/print`,{method:'POST',body:JSON.stringify({productNumber,ean,quantity})})
}
