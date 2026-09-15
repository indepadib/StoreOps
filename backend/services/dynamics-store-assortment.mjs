import { config } from '../config.mjs';
import { odataGetAll } from './dynamics.mjs';
import { storeOperationalSettings } from './store-settings.mjs';
import { listProductAssortmentCatalog } from './assortment-admin.mjs';
import { replaceStoreAssortmentAssignments } from './assortment-relations.mjs';
import { PRODUCT_ASSORTMENT_SOURCE } from './assortment-category-mapping.mjs';

const clean=v=>String(v??'').trim();
const validEntity=v=>/^[A-Za-z0-9_]+$/.test(clean(v));
const validField=v=>/^[A-Za-z_][A-Za-z0-9_]*$/.test(clean(v));
const esc=v=>String(v).replaceAll("'","''");

export function storeAssortmentLookupConfig(storeId=null){
  const settings=storeId?storeOperationalSettings(storeId):null;
  const entity=clean(process.env.D365_STORE_ASSORTMENT_LOOKUP_ENTITY)||'RetailAssortmentLookupChannelGroupEntity';
  const assortmentField=clean(process.env.D365_STORE_ASSORTMENT_LOOKUP_ASSORTMENT_FIELD)||'AssortmentId';
  const channelField=clean(process.env.D365_STORE_ASSORTMENT_LOOKUP_CHANNEL_FIELD)||'RetailChannelId';
  const mode=clean(process.env.D365_STORE_ASSORTMENT_READ_MODE||process.env.D365_ASSORTMENT_READ_MODE||'simulated').toLowerCase();
  const retailChannelId=clean(settings?.d365?.retailChannelId)||null;
  const mapped=validEntity(entity)&&validField(assortmentField)&&validField(channelField)&&(!storeId||!!retailChannelId);
  return{
    entity,assortmentField,channelField,mode,retailChannelId,mapped,
    standardCandidate:entity==='RetailAssortmentLookupChannelGroupEntity',
    source:'MICROSOFT_COMMERCE_CHANNEL_LOOKUP',
    productSource:PRODUCT_ASSORTMENT_SOURCE
  };
}

export function storeAssortmentLookupReadiness(storeId=null){
  const c=storeAssortmentLookupConfig(storeId);
  return{
    ...c,
    globalMode:config.dynamics.mode,
    live:config.dynamics.mode==='live'&&c.mode==='live'&&c.mapped,
    filterHint:c.retailChannelId?`${c.channelField} eq '${c.retailChannelId}'`:null
  };
}

function exactCatalogResolution(ids=[]){
  const catalog=listProductAssortmentCatalog({source:PRODUCT_ASSORTMENT_SOURCE});
  const byKey=new Map(catalog.map(x=>[clean(x.assortmentKey),x]));
  const resolved=[],unresolved=[];
  for(const raw of ids){
    const id=clean(raw);if(!id)continue;
    const hit=byKey.get(id);
    if(hit)resolved.push({assortmentKey:id,assortmentName:hit.assortmentName,included:true,brandScope:hit.brandScope,tier:hit.tier,rowCount:hit.rowCount});
    else unresolved.push(id);
  }
  return{catalogCount:catalog.length,resolved,unresolved};
}

export async function previewStoreAssortmentsFromDynamics(storeId){
  const c=storeAssortmentLookupConfig(storeId);
  if(config.dynamics.mode!=='live'||c.mode!=='live')return{status:'DISABLED',storeId,readiness:storeAssortmentLookupReadiness(storeId),ids:[],resolved:[],unresolved:[]};
  if(!c.mapped)throw Object.assign(new Error('Mapping canal → assortiment D365 incomplet.'),{status:503,code:'D365_STORE_ASSORTMENT_MAPPING_REQUIRED',details:storeAssortmentLookupReadiness(storeId)});
  const fetched=await odataGetAll(c.entity,{filter:`${c.channelField} eq '${esc(c.retailChannelId)}'`,select:`${c.assortmentField},${c.channelField}`,extra:config.dynamics.dataAreaId?'cross-company=true':'',pageSize:250,maxRows:5000});
  if(fetched.truncated)throw Object.assign(new Error('La liste des assortiments du canal est tronquée : aucun mapping magasin n’a été modifié.'),{status:409,code:'D365_STORE_ASSORTMENT_TRUNCATED',details:{entity:c.entity,rowsRead:fetched.rowCount}});
  const ids=[...new Set((fetched.value||[]).map(x=>clean(x?.[c.assortmentField])).filter(Boolean))];
  const resolution=exactCatalogResolution(ids);
  return{
    status:ids.length?(resolution.unresolved.length?'NEEDS_MAPPING':'READY'):'EMPTY',
    storeId,retailChannelId:c.retailChannelId,entity:c.entity,rowsRead:fetched.rowCount,pages:fetched.pages,ids,
    ...resolution,
    safeToPersist:ids.length>0&&resolution.unresolved.length===0&&resolution.resolved.length===ids.length,
    readiness:storeAssortmentLookupReadiness(storeId)
  };
}

export async function syncStoreAssortmentsFromDynamicsChannel(storeId){
  const preview=await previewStoreAssortmentsFromDynamics(storeId);
  if(preview.status==='DISABLED')throw Object.assign(new Error('Lecture canal → assortiment D365 non activée en LIVE.'),{status:409,code:'D365_STORE_ASSORTMENT_NOT_LIVE',details:preview.readiness});
  if(preview.status==='EMPTY')throw Object.assign(new Error('Aucun assortiment trouvé pour ce canal : ancien mapping magasin conservé.'),{status:409,code:'D365_STORE_ASSORTMENT_EMPTY',details:{storeId,retailChannelId:preview.retailChannelId,entity:preview.entity}});
  if(!preview.safeToPersist)throw Object.assign(new Error('Les AssortmentId du canal ne correspondent pas encore exactement au catalogue produit StoreOps : ancien mapping conservé.'),{status:409,code:'D365_STORE_ASSORTMENT_KEYS_UNRESOLVED',details:{storeId,retailChannelId:preview.retailChannelId,ids:preview.ids,resolved:preview.resolved.map(x=>x.assortmentKey),unresolved:preview.unresolved}});
  const saved=replaceStoreAssortmentAssignments({storeId,source:PRODUCT_ASSORTMENT_SOURCE,assignments:preview.resolved,complete:true});
  return{...preview,status:'SYNCED',persisted:true,rowCount:saved.rowCount,source:PRODUCT_ASSORTMENT_SOURCE};
}
