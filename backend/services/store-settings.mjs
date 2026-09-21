import { db,audit } from '../db.mjs';
import { config } from '../config.mjs';

const clean=v=>String(v??'').trim();
const LEGACY_STORE_WAREHOUSES=Object.freeze({'val-fleuri':'FRP0001'});
const CONFIRMED_ONE_RETAIL_PROFILE=Object.freeze({
 defaultSupplyWarehouseId:'LVE Lakhya',
 stores:{
  'val-fleuri':{storeNumber:'FRP0001',storeWarehouseId:'FRP0001',retailChannelId:'10001',operatingUnitNumber:'00000063',legalEntityId:'5001',assortmentProfile:'COMPLEMENTAIRE_PLUS'},
  'trefle':{storeNumber:'FRP0002',storeWarehouseId:'FRP0002',retailChannelId:'10002',operatingUnitNumber:'00000064',legalEntityId:'5001'}
 }
});

db.exec(`
CREATE TABLE IF NOT EXISTS network_operational_settings(
 id TEXT PRIMARY KEY,
 default_supply_warehouse_id TEXT NULL,
 updated_by TEXT NULL REFERENCES users(id),
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS network_operational_settings_history(
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 setting_key TEXT NOT NULL,
 value_text TEXT NULL,
 user_id TEXT NULL REFERENCES users(id),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS store_operational_settings(
 store_id TEXT PRIMARY KEY REFERENCES stores(id),
 store_warehouse_id TEXT NULL,
 supply_warehouse_id TEXT NULL,
 secondary_supply_warehouses_json TEXT NULL,
 updated_by TEXT NULL REFERENCES users(id),
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
`);
function ensureColumn(table,column,definition){const cols=db.prepare(`PRAGMA table_info(${table})`).all();if(!cols.some(c=>c.name===column))db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`)}
ensureColumn('store_operational_settings','d365_store_number','TEXT NULL');
ensureColumn('store_operational_settings','d365_retail_channel_id','TEXT NULL');
ensureColumn('store_operational_settings','d365_operating_unit_number','TEXT NULL');
ensureColumn('store_operational_settings','d365_legal_entity_id','TEXT NULL');
ensureColumn('store_operational_settings','assortment_profile','TEXT NULL');

const parseJsonList=v=>{try{const x=JSON.parse(v||'[]');return Array.isArray(x)?x.map(clean).filter(Boolean):[]}catch{return[]}};
const pilotHint=storeId=>CONFIRMED_ONE_RETAIL_PROFILE.stores[clean(storeId)]||null;

export function networkOperationalSettings(){
 const row=db.prepare(`SELECT * FROM network_operational_settings WHERE id='default'`).get(),envDefault=clean(process.env.D365_DEFAULT_SUPPLY_WAREHOUSE)||null;
 return {
  defaultSupplyWarehouseId:clean(row?.default_supply_warehouse_id)||envDefault||null,
  suggestedSupplyWarehouseId:CONFIRMED_ONE_RETAIL_PROFILE.defaultSupplyWarehouseId,
  suggestedSupplyWarehouseName:'LVE Lakhyayata entrepôt de distribution',
  source:row?'STOREOPS_CONFIG':envDefault?'ENV_CONFIG':'UNMAPPED',
  persisted:!!row,
  updatedAt:row?.updated_at||null
 }
}

export function saveNetworkOperationalSettings({user,defaultSupplyWarehouseId=null}={}){
 const value=clean(defaultSupplyWarehouseId)||null;
 db.prepare(`INSERT INTO network_operational_settings(id,default_supply_warehouse_id,updated_by,updated_at) VALUES('default',?,?,CURRENT_TIMESTAMP) ON CONFLICT(id) DO UPDATE SET default_supply_warehouse_id=excluded.default_supply_warehouse_id,updated_by=excluded.updated_by,updated_at=CURRENT_TIMESTAMP`).run(value,user?.id||null);
 db.prepare(`INSERT INTO network_operational_settings_history(setting_key,value_text,user_id,created_at) VALUES('default_supply_warehouse_id',?,?,CURRENT_TIMESTAMP)`).run(value,user?.id||null);
 return networkOperationalSettings()
}

export function storeOperationalSettings(storeId){
 const id=clean(storeId),row=db.prepare(`SELECT * FROM store_operational_settings WHERE store_id=?`).get(id),envStore=config.dynamics.stock.storeWarehouses?.[id]||null,envSupply=config.dynamics.stock.supplyWarehouses?.[id]||null,network=networkOperationalSettings(),hint=pilotHint(id);
 const explicitSupply=clean(row?.supply_warehouse_id)||null,effectiveSupply=explicitSupply||network.defaultSupplyWarehouseId||envSupply||null;
 return {
  storeId:id,
  storeWarehouseId:clean(row?.store_warehouse_id)||envStore||LEGACY_STORE_WAREHOUSES[id]||hint?.storeWarehouseId||null,
  supplyWarehouseId:effectiveSupply,
  supplyWarehouseOverrideId:explicitSupply,
  supplyWarehouseSource:explicitSupply?'STORE_OVERRIDE':network.defaultSupplyWarehouseId?'NETWORK_DEFAULT':envSupply?'ENV_CONFIG':'UNMAPPED',
  secondarySupplyWarehouseIds:parseJsonList(row?.secondary_supply_warehouses_json),
  assortmentProfile:clean(row?.assortment_profile)||hint?.assortmentProfile||null,
  assortmentProfileSource:clean(row?.assortment_profile)?'STOREOPS_CONFIG':hint?.assortmentProfile?'CONFIRMED_PILOT':'UNMAPPED',
  d365:{
   storeNumber:clean(row?.d365_store_number)||hint?.storeNumber||null,
   retailChannelId:clean(row?.d365_retail_channel_id)||hint?.retailChannelId||null,
   operatingUnitNumber:clean(row?.d365_operating_unit_number)||hint?.operatingUnitNumber||null,
   legalEntityId:clean(row?.d365_legal_entity_id)||hint?.legalEntityId||config.dynamics.dataAreaId||null,
   source:row&&(row.d365_store_number||row.d365_retail_channel_id||row.d365_operating_unit_number||row.d365_legal_entity_id)?'STOREOPS_CONFIG':hint?'CONFIRMED_PILOT':'UNMAPPED'
  },
  confirmedHint:hint?{...hint,defaultSupplyWarehouseId:CONFIRMED_ONE_RETAIL_PROFILE.defaultSupplyWarehouseId}:null,
  source:row?'STOREOPS_CONFIG':(envStore||envSupply?'ENV_CONFIG':LEGACY_STORE_WAREHOUSES[id]?'PILOT_FALLBACK':hint?'CONFIRMED_PILOT':'UNMAPPED'),
  persisted:!!row,
  updatedAt:row?.updated_at||null
 }
}

export function saveStoreOperationalSettings({storeId,user,storeWarehouseId=null,supplyWarehouseId=null,secondarySupplyWarehouseIds=[],d365StoreNumber=null,d365RetailChannelId=null,d365OperatingUnitNumber=null,d365LegalEntityId=null,assortmentProfile=null}){
 const id=clean(storeId);if(!db.prepare(`SELECT id FROM stores WHERE id=? AND active=1`).get(id))throw Object.assign(new Error('Magasin introuvable.'),{status:404,code:'STORE_NOT_FOUND'});
 const sw=clean(storeWarehouseId)||null,source=clean(supplyWarehouseId)||null,secondary=[...new Set((Array.isArray(secondarySupplyWarehouseIds)?secondarySupplyWarehouseIds:[]).map(clean).filter(Boolean).filter(x=>x!==source&&x!==sw))],storeNumber=clean(d365StoreNumber)||null,retailChannelId=clean(d365RetailChannelId)||null,operatingUnitNumber=clean(d365OperatingUnitNumber)||null,legalEntityId=clean(d365LegalEntityId)||null,profile=clean(assortmentProfile).toUpperCase()||null;
 if(profile&&!['COMPLEMENTAIRE_PLUS'].includes(profile))throw Object.assign(new Error('Profil assortiment inconnu.'),{status:400,code:'ASSORTMENT_PROFILE_UNKNOWN'});
 if(sw&&source&&sw===source)throw Object.assign(new Error('Le warehouse magasin et l’entrepôt source doivent être distincts.'),{status:400,code:'STORE_WAREHOUSE_SAME_AS_SUPPLY'});
 db.prepare(`INSERT INTO store_operational_settings(store_id,store_warehouse_id,supply_warehouse_id,secondary_supply_warehouses_json,d365_store_number,d365_retail_channel_id,d365_operating_unit_number,d365_legal_entity_id,assortment_profile,updated_by,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(store_id) DO UPDATE SET store_warehouse_id=excluded.store_warehouse_id,supply_warehouse_id=excluded.supply_warehouse_id,secondary_supply_warehouses_json=excluded.secondary_supply_warehouses_json,d365_store_number=excluded.d365_store_number,d365_retail_channel_id=excluded.d365_retail_channel_id,d365_operating_unit_number=excluded.d365_operating_unit_number,d365_legal_entity_id=excluded.d365_legal_entity_id,assortment_profile=excluded.assortment_profile,updated_by=excluded.updated_by,updated_at=CURRENT_TIMESTAMP`).run(id,sw,source,JSON.stringify(secondary),storeNumber,retailChannelId,operatingUnitNumber,legalEntityId,profile,user?.id||null);
 audit({storeId:id,userId:user?.id||null,action:'STORE_OPERATIONAL_SETTINGS_UPDATED',entityType:'STORE',entityId:id,details:{storeWarehouseId:sw,supplyWarehouseOverrideId:source,secondarySupplyWarehouseIds:secondary,assortmentProfile:profile,d365:{storeNumber,retailChannelId,operatingUnitNumber,legalEntityId}}});
 return storeOperationalSettings(id)
}

export function allStoreOperationalSettings(){return db.prepare(`SELECT id,name,code FROM stores WHERE active=1 ORDER BY name`).all().map(s=>({...s,settings:storeOperationalSettings(s.id)}))}
