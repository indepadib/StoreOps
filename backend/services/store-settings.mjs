import { db,audit } from '../db.mjs';
import { config } from '../config.mjs';

const clean=v=>String(v??'').trim();
const LEGACY_STORE_WAREHOUSES=Object.freeze({'val-fleuri':'FRP0001'});

db.exec(`
CREATE TABLE IF NOT EXISTS network_operational_settings(
 id TEXT PRIMARY KEY,
 default_supply_warehouse_id TEXT NULL,
 updated_by TEXT NULL REFERENCES users(id),
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
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

const parseJsonList=v=>{try{const x=JSON.parse(v||'[]');return Array.isArray(x)?x.map(clean).filter(Boolean):[]}catch{return[]}};

export function networkOperationalSettings(){
 const row=db.prepare(`SELECT * FROM network_operational_settings WHERE id='default'`).get(),envDefault=clean(process.env.D365_DEFAULT_SUPPLY_WAREHOUSE)||null;
 return {
  defaultSupplyWarehouseId:clean(row?.default_supply_warehouse_id)||envDefault||null,
  source:row?'STOREOPS_CONFIG':envDefault?'ENV_CONFIG':'UNMAPPED',
  persisted:!!row,
  updatedAt:row?.updated_at||null
 }
}

export function saveNetworkOperationalSettings({user,defaultSupplyWarehouseId=null}={}){
 const value=clean(defaultSupplyWarehouseId)||null;
 db.prepare(`INSERT INTO network_operational_settings(id,default_supply_warehouse_id,updated_by,updated_at) VALUES('default',?,?,CURRENT_TIMESTAMP) ON CONFLICT(id) DO UPDATE SET default_supply_warehouse_id=excluded.default_supply_warehouse_id,updated_by=excluded.updated_by,updated_at=CURRENT_TIMESTAMP`).run(value,user?.id||null);
 audit({storeId:null,userId:user?.id||null,action:'NETWORK_OPERATIONAL_SETTINGS_UPDATED',entityType:'NETWORK',entityId:'default',details:{defaultSupplyWarehouseId:value}});
 return networkOperationalSettings()
}

export function storeOperationalSettings(storeId){
 const id=clean(storeId),row=db.prepare(`SELECT * FROM store_operational_settings WHERE store_id=?`).get(id),envStore=config.dynamics.stock.storeWarehouses?.[id]||null,envSupply=config.dynamics.stock.supplyWarehouses?.[id]||null,network=networkOperationalSettings();
 const explicitSupply=clean(row?.supply_warehouse_id)||null,effectiveSupply=explicitSupply||network.defaultSupplyWarehouseId||envSupply||null;
 return {
  storeId:id,
  storeWarehouseId:clean(row?.store_warehouse_id)||envStore||LEGACY_STORE_WAREHOUSES[id]||null,
  supplyWarehouseId:effectiveSupply,
  supplyWarehouseOverrideId:explicitSupply,
  supplyWarehouseSource:explicitSupply?'STORE_OVERRIDE':network.defaultSupplyWarehouseId?'NETWORK_DEFAULT':envSupply?'ENV_CONFIG':'UNMAPPED',
  secondarySupplyWarehouseIds:parseJsonList(row?.secondary_supply_warehouses_json),
  source:row?'STOREOPS_CONFIG':(envStore||envSupply?'ENV_CONFIG':LEGACY_STORE_WAREHOUSES[id]?'PILOT_FALLBACK':'UNMAPPED'),
  persisted:!!row,
  updatedAt:row?.updated_at||null
 }
}

export function saveStoreOperationalSettings({storeId,user,storeWarehouseId=null,supplyWarehouseId=null,secondarySupplyWarehouseIds=[]}){
 const id=clean(storeId);if(!db.prepare(`SELECT id FROM stores WHERE id=? AND active=1`).get(id))throw Object.assign(new Error('Magasin introuvable.'),{status:404,code:'STORE_NOT_FOUND'});
 const sw=clean(storeWarehouseId)||null,source=clean(supplyWarehouseId)||null,secondary=[...new Set((Array.isArray(secondarySupplyWarehouseIds)?secondarySupplyWarehouseIds:[]).map(clean).filter(Boolean).filter(x=>x!==source&&x!==sw))];
 if(sw&&source&&sw===source)throw Object.assign(new Error('Le warehouse magasin et l’entrepôt source doivent être distincts.'),{status:400,code:'STORE_WAREHOUSE_SAME_AS_SUPPLY'});
 db.prepare(`INSERT INTO store_operational_settings(store_id,store_warehouse_id,supply_warehouse_id,secondary_supply_warehouses_json,updated_by,updated_at) VALUES(?,?,?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(store_id) DO UPDATE SET store_warehouse_id=excluded.store_warehouse_id,supply_warehouse_id=excluded.supply_warehouse_id,secondary_supply_warehouses_json=excluded.secondary_supply_warehouses_json,updated_by=excluded.updated_by,updated_at=CURRENT_TIMESTAMP`).run(id,sw,source,JSON.stringify(secondary),user?.id||null);
 audit({storeId:id,userId:user?.id||null,action:'STORE_OPERATIONAL_SETTINGS_UPDATED',entityType:'STORE',entityId:id,details:{storeWarehouseId:sw,supplyWarehouseOverrideId:source,secondarySupplyWarehouseIds:secondary}});
 return storeOperationalSettings(id)
}

export function allStoreOperationalSettings(){return db.prepare(`SELECT id,name,code FROM stores WHERE active=1 ORDER BY name`).all().map(s=>({...s,settings:storeOperationalSettings(s.id)}))}
