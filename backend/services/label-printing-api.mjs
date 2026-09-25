import { canAccessStore,canManageStore } from './permissions.mjs';
import { labelPrintingConfig,printProductLabel } from './label-printing.mjs';

function route(path,pattern){const a=path.split('/').filter(Boolean),b=pattern.split('/').filter(Boolean);if(a.length!==b.length)return null;const p={};for(let i=0;i<a.length;i++){if(b[i].startsWith(':'))p[b[i].slice(1)]=decodeURIComponent(a[i]);else if(a[i]!==b[i])return null}return p}
async function body(req){let raw='';for await(const c of req)raw+=c;try{return raw?JSON.parse(raw):{}}catch{throw Object.assign(new Error('JSON invalide'),{status:400,code:'API_INVALID_JSON_BODY'})}}
const forbidden=(message='Accès interdit')=>({status:403,data:{error:message}});

export async function handleLabelPrintingApi({req,url,user}){
 const path=url.pathname;let p;
 p=route(path,'/api/stores/:storeId/label-printing/config');
 if(p&&req.method==='GET'){
  if(!canAccessStore(user,p.storeId))return forbidden('Accès interdit à ce magasin.');
  return{status:200,data:await labelPrintingConfig(p.storeId)}
 }
 p=route(path,'/api/stores/:storeId/label-printing/print');
 if(p&&req.method==='POST'){
  if(!canManageStore(user,p.storeId))return forbidden('Impression balisage réservée au Responsable magasin ou à la Direction.');
  const b=await body(req);
  return{status:200,data:await printProductLabel({storeId:p.storeId,user,productNumber:b.productNumber,ean:b.ean,quantity:b.quantity,businessDate:b.businessDate})}
 }
 return null
}
