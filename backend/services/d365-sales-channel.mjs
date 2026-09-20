import { storeOperationalSettings } from './store-settings.mjs';

const clean=v=>String(v??'').trim();
function parseMap(raw=''){
 const s=clean(raw);if(!s)return{};
 if(s.startsWith('{')){try{const x=JSON.parse(s);return x&&typeof x==='object'?x:{}}catch{return{}}}
 return Object.fromEntries(s.split(',').map(x=>x.trim()).filter(Boolean).map(x=>{const i=x.indexOf('=');return i>0?[x.slice(0,i).trim(),x.slice(i+1).trim()]:null}).filter(Boolean));
}
export function salesChannelFieldKind(field=''){
 const key=clean(field).replace(/[^A-Za-z0-9]/g,'').toLowerCase();
 if(!key)return'UNKNOWN';
 if(key.includes('retailchannel'))return'RETAIL_CHANNEL';
 if(['channel','channelid'].includes(key))return'RETAIL_CHANNEL';
 if(['store','storenumber','storeid','retailstore','retailstoreid'].includes(key))return'STORE_NUMBER';
 if(key.includes('storenumber'))return'STORE_NUMBER';
 return'UNKNOWN';
}
export function resolveStoreSalesChannel(storeId,{channelField='',envMapRaw=process.env.D365_STORE_RETAIL_IDS||''}={}){
 const id=clean(storeId),settings=storeOperationalSettings(id),kind=salesChannelFieldKind(channelField),envMap=parseMap(envMapRaw),explicit=clean(envMap[id]);
 if(kind==='STORE_NUMBER'){
  const value=clean(settings?.d365?.storeNumber)||clean(settings?.storeWarehouseId)||null;
  return{storeId:id,field:clean(channelField)||null,kind,value,source:value?(settings?.d365?.storeNumber?'STORE_SETTINGS':'WAREHOUSE_MAPPING'):null};
 }
 if(kind==='RETAIL_CHANNEL'){
  const value=explicit||clean(settings?.d365?.retailChannelId)||null;
  return{storeId:id,field:clean(channelField)||null,kind,value,source:explicit?'ENV_CONFIG':value?'STORE_SETTINGS':null};
 }
 return{storeId:id,field:clean(channelField)||null,kind,value:null,source:null};
}
