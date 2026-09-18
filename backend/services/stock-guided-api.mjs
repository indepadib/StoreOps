import { canAccessStore,canManageStore } from './permissions.mjs';
import { getStockGuidedFlow,readStockGuidedFlow,completeStockGuidedReview,stockGuidedConfig } from './stock-guided.mjs';

function route(path,pattern){const a=path.split('/').filter(Boolean),b=pattern.split('/').filter(Boolean);if(a.length!==b.length)return null;const p={};for(let i=0;i<a.length;i++){if(b[i].startsWith(':'))p[b[i].slice(1)]=decodeURIComponent(a[i]);else if(a[i]!==b[i])return null}return p}
async function body(req){let raw='';for await(const c of req)raw+=c;try{return raw?JSON.parse(raw):{}}catch{throw Object.assign(new Error('JSON invalide'),{status:400})}}
function requireStore(user,storeId){if(!canAccessStore(user,storeId))throw Object.assign(new Error('Accès interdit à ce magasin.'),{status:403})}
function requireManage(user,storeId){if(!canManageStore(user,storeId))throw Object.assign(new Error('Réservé au Responsable magasin ou Directeur d’exploitation.'),{status:403})}

export async function handleStockGuidedApi({req,url,user}){
 const path=url.pathname;if(!path.includes('/stock-guided'))return null;
 if(path==='/api/stock-guided/config'&&req.method==='GET')return{status:200,data:stockGuidedConfig()};
 let p=route(path,'/api/stores/:storeId/stock-guided/:type/start');
 if(p&&req.method==='POST'){requireStore(user,p.storeId);requireManage(user,p.storeId);const b=await body(req);return{status:200,data:await getStockGuidedFlow(p.storeId,p.type,{businessDate:b.businessDate||url.searchParams.get('date')||undefined,force:b.force===true})}}
 p=route(path,'/api/stores/:storeId/stock-guided/:type');
 if(p&&req.method==='GET'){requireStore(user,p.storeId);return{status:200,data:readStockGuidedFlow(p.storeId,p.type,{businessDate:url.searchParams.get('date')||undefined})}}
 p=route(path,'/api/stores/:storeId/stock-guided/:type/:reviewId');
 if(p&&req.method==='POST'){requireStore(user,p.storeId);requireManage(user,p.storeId);const b=await body(req);return{status:200,data:await completeStockGuidedReview({storeId:p.storeId,type:p.type,reviewId:p.reviewId,user,outcome:b.outcome,note:b.note||'',businessDate:b.businessDate||url.searchParams.get('date')||undefined})}}
 return null
}
