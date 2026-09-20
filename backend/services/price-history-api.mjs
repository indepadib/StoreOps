import { canAccessStore } from './permissions.mjs';
import { itemPriceHistory } from './price-history.mjs';
import { ensureD365PriceHistoryAutoConnected,clearD365PriceHistoryAutoConnectCache } from './d365-price-history-autoconnect.mjs';

function route(path,pattern){const a=path.split('/').filter(Boolean),b=pattern.split('/').filter(Boolean);if(a.length!==b.length)return null;const p={};for(let i=0;i<a.length;i++){if(b[i].startsWith(':'))p[b[i].slice(1)]=decodeURIComponent(a[i]);else if(a[i]!==b[i])return null}return p}

export async function handlePriceHistoryApi({req,url,user}){
 let p=route(url.pathname,'/api/stores/:storeId/items/:productNumber/price-history/auto-connect');
 if(p&&req.method==='POST'){
  if(!canAccessStore(user,p.storeId))throw Object.assign(new Error('Accès interdit à ce magasin.'),{status:403});
  const days=Math.max(7,Math.min(365,Number(url.searchParams.get('days'))||90));
  clearD365PriceHistoryAutoConnectCache(p.productNumber);
  const autoConnect=await ensureD365PriceHistoryAutoConnected(p.productNumber);
  const history=await itemPriceHistory({storeId:p.storeId,productNumber:p.productNumber,businessDate:url.searchParams.get('date')||null,days});
  return{status:200,data:{autoConnect,history}}
 }
 if(req.method!=='GET')return null;
 p=route(url.pathname,'/api/stores/:storeId/items/:productNumber/price-history');if(!p)return null;
 if(!canAccessStore(user,p.storeId))throw Object.assign(new Error('Accès interdit à ce magasin.'),{status:403});
 const days=Math.max(7,Math.min(365,Number(url.searchParams.get('days'))||90));
 return{status:200,data:await itemPriceHistory({storeId:p.storeId,productNumber:p.productNumber,businessDate:url.searchParams.get('date')||null,days})}
}
