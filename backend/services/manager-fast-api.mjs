import { todayISO } from '../db.mjs';
import { canAccessStore } from './permissions.mjs';
import { getManagerHomeFast } from './manager-home-fast.mjs';
import { getManagerInboxBatch } from './manager-inbox-batch.mjs';

function route(path,pattern){
  const a=path.split('/').filter(Boolean),b=pattern.split('/').filter(Boolean);
  if(a.length!==b.length)return null;
  const params={};
  for(let i=0;i<a.length;i++){
    if(b[i].startsWith(':'))params[b[i].slice(1)]=decodeURIComponent(a[i]);
    else if(a[i]!==b[i])return null;
  }
  return params;
}

function forbidden(){return{status:403,data:{error:'Accès interdit à ce magasin.'}}}

export async function handleManagerFastApi({req,url,user}){
  if(req.method!=='GET')return null;
  const force=url.searchParams.get('force')==='1';
  let p=route(url.pathname,'/api/stores/:storeId/manager-home-fast');
  if(p){
    if(!canAccessStore(user,p.storeId))return forbidden();
    const businessDate=url.searchParams.get('date')||todayISO();
    return{status:200,data:getManagerHomeFast(p.storeId,businessDate,{force})};
  }
  p=route(url.pathname,'/api/stores/:storeId/manager-inbox-batch');
  if(p){
    if(!canAccessStore(user,p.storeId))return forbidden();
    const businessDate=url.searchParams.get('date')||todayISO();
    return{status:200,data:await getManagerInboxBatch(p.storeId,businessDate,{force})};
  }
  return null;
}
