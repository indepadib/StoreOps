import { db,uid,audit } from '../db.mjs';
import { config } from '../config.mjs';
import { RETAIL_CAPABILITIES,normalizeConnector,connectorReadiness } from './connector-contract.mjs';
import { allStoreOperationalSettings } from './store-settings.mjs';
import { d365SalesMappingSettings } from './d365-sales-mapping.mjs';

const clean=v=>String(v??'').trim();
const slug=v=>clean(v).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,45);
const readMode=v=>String(v||'simulated').toLowerCase()==='live';
const validFamily=new Set(['D365','SAP','ORACLE','ODOO','CEGID','ERP','POS','WMS','PIM','HRIS','IDENTITY','DATA','CUSTOM','STOREOPS']);

db.exec(`
CREATE TABLE IF NOT EXISTS integration_connectors(
 connector_key TEXT PRIMARY KEY,
 name TEXT NOT NULL,
 family TEXT NOT NULL,
 connector_type TEXT NOT NULL DEFAULT 'CUSTOM',
 planned_capabilities_json TEXT NOT NULL DEFAULT '[]',
 note TEXT NULL,
 active INTEGER NOT NULL DEFAULT 1,
 created_by TEXT NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
`);

function safeJson(raw,fallback=[]){try{const x=JSON.parse(raw||'');return x??fallback}catch{return fallback}}
function state(enabled,mapped=true){if(!enabled)return config.realOnly?'UNMAPPED':'SIMULATED';return mapped?'LIVE':'LIVE_PENDING'}
function cap(stateValue,source=null,lastError=null){return{state:stateValue,source,lastError}}
function emptyCapabilities(){return Object.fromEntries(RETAIL_CAPABILITIES.map(x=>[x,cap('UNMAPPED')]))}
function capabilityLabel(code){return({
 'catalog.product.read':'Catalogue produits','merchandising.assortment.read':'Assortiments','merchandising.taxonomy.read':'Catégories & hiérarchie','inventory.stock.read':'Stock disponible','inventory.batch.read':'Lots / batchs','inventory.adjustment.write':'Ajustements de stock','pricing.price.read':'Prix','pricing.promotion.read':'Promotions','sales.transactions.read':'Transactions de vente','sales.margin.read':'Marge / coût','supply.purchase-order.read':'Commandes fournisseurs','supply.receiving.write':'Réception ERP','supply.transfer.read':'Transferts / demandes','supply.transfer.write':'Création de transfert','workforce.employee.read':'Collaborateurs','workforce.schedule.read':'Planning / shifts','finance.cash.read':'Caisses / rapprochement','finance.cash.write':'Clôture caisse','loss.write':'Démarque ERP','export.file.write':'Exports fichiers','identity.sso':'SSO / identité'
 })[code]||code}
export const capabilityCatalog=()=>RETAIL_CAPABILITIES.map(code=>({code,label:capabilityLabel(code),domain:code.split('.')[0]}));

function d365Connector(){
 const c=emptyCapabilities(),read=config.dynamics.read||{},stores=allStoreOperationalSettings(),hasStoreWh=stores.some(x=>x.storeWarehouseId),hasSupplyWh=stores.some(x=>x.supplyWarehouseId),salesMapping=d365SalesMappingSettings();
 c['catalog.product.read']=cap(state(config.dynamics.mode==='live'&&readMode(read.product),!!config.dynamics.barcodeEntity),'D365');
 c['inventory.stock.read']=cap(state(config.dynamics.mode==='live'&&readMode(read.stock),!!config.dynamics.stock?.entity&&hasStoreWh),'D365');
 c['inventory.batch.read']=cap(state(config.dynamics.mode==='live'&&readMode(read.stock),!!config.dynamics.stock?.batchField),'D365');
 c['pricing.price.read']=cap(state(config.dynamics.mode==='live'&&readMode(read.price),!!config.dynamics.entities?.basePrice),'D365');
 c['pricing.promotion.read']=cap(state(config.dynamics.mode==='live'&&readMode(read.promotion),!!config.dynamics.entities?.retailDiscount),'D365');
 c['merchandising.assortment.read']=cap(state(config.dynamics.mode==='live'&&readMode(read.assortment),!!clean(process.env.D365_ASSORTMENT_ENTITY)||!!clean(process.env.D365_STORE_ASSORTMENT_ENTITY)),'D365');
 c['merchandising.taxonomy.read']=cap(state(config.dynamics.mode==='live'&&readMode(read.taxonomy),!!clean(process.env.D365_CATEGORY_ENTITY||'ProcurementProductCategories')),'D365');
 const salesEnvLive=config.dynamics.mode==='live'&&readMode(read.sales),salesDbLive=config.dynamics.mode==='live'&&salesMapping?.state==='LIVE',salesDbValidated=salesMapping?.state==='VALIDATED';
 const txMapped=salesDbLive?!!salesMapping?.entity&&['channel','businessDate','transaction','net'].every(k=>!!salesMapping?.fields?.[k]):!!clean(process.env.D365_SALES_ENTITY||'RetailTransactionSalesTransBIEntities');
 const marginMapped=salesDbLive?!!salesMapping?.fields?.cost:!!clean(process.env.D365_SALES_COST_FIELD);
 c['sales.transactions.read']=cap(salesDbLive?'LIVE':salesDbValidated?'LIVE_PENDING':state(salesEnvLive,txMapped),salesDbLive||salesDbValidated?'StoreOps sales mapping':'D365');
 c['sales.margin.read']=cap(salesDbLive?(marginMapped?'LIVE':'UNMAPPED'):salesDbValidated?(salesMapping?.fields?.cost?'LIVE_PENDING':'UNMAPPED'):state(salesEnvLive,marginMapped),salesDbLive||salesDbValidated?'StoreOps sales mapping':'D365');
 c['supply.purchase-order.read']=cap(state(config.dynamics.mode==='live'&&readMode(read.receiving),!!config.dynamics.receiving?.headerEntity&&!!config.dynamics.receiving?.lineEntity),'D365');
 c['supply.transfer.read']=cap(hasSupplyWh?'LIVE_PENDING':'UNMAPPED','D365');
 for(const x of ['inventory.adjustment.write','supply.receiving.write','supply.transfer.write','finance.cash.write','loss.write'])c[x]=cap('UNMAPPED','D365');
 return normalizeConnector({key:'d365-one-retail',name:'Microsoft Dynamics 365',family:'D365',capabilities:c})
}
function nativeConnector(){const c=emptyCapabilities();for(const x of ['workforce.employee.read','workforce.schedule.read','export.file.write'])c[x]=cap('LIVE','StoreOps');return normalizeConnector({key:'storeops-native',name:'StoreOps Native',family:'STOREOPS',capabilities:c})}
function identityConnector(){const c=emptyCapabilities();const stateValue=config.authMode==='entra'?'LIVE':config.authMode==='demo'?(config.realOnly?'UNMAPPED':'SIMULATED'):'LIVE_PENDING';c['identity.sso']=cap(stateValue,config.authMode==='entra'?'Microsoft Entra ID':config.authMode);return normalizeConnector({key:'identity-primary',name:config.authMode==='entra'?'Microsoft Entra ID':'Identité StoreOps',family:'IDENTITY',capabilities:c})}
function customRowConnector(row){const planned=safeJson(row.planned_capabilities_json,[]),c=emptyCapabilities();for(const code of planned.filter(x=>RETAIL_CAPABILITIES.includes(x)))c[code]=cap(row.active?'LIVE_PENDING':'DISABLED',row.name);return normalizeConnector({key:row.connector_key,name:row.name,family:row.family,capabilities:c})}

export function integrationSnapshot(){
 const custom=db.prepare(`SELECT * FROM integration_connectors ORDER BY active DESC,name`).all().map(customRowConnector),connectors=[nativeConnector(),identityConnector(),d365Connector(),...custom],readiness=connectorReadiness(connectors);
 const ready=Object.values(readiness.coverage).filter(x=>x.ready).length,pending=Object.values(readiness.coverage).filter(x=>!x.ready&&x.choices.length).length;
 return{connectors,coverage:readiness.coverage,summary:{capabilities:RETAIL_CAPABILITIES.length,ready,pending,unmapped:RETAIL_CAPABILITIES.length-ready-pending},catalog:capabilityCatalog(),realOnly:!!config.realOnly}
}
function requireFamily(v){const f=clean(v||'CUSTOM').toUpperCase();if(!validFamily.has(f))throw Object.assign(new Error('Famille de connecteur invalide.'),{status:400,code:'CONNECTOR_FAMILY_INVALID'});return f}
function normalizePlanned(list){return[...new Set((Array.isArray(list)?list:[]).map(clean).filter(x=>RETAIL_CAPABILITIES.includes(x)))]}
function auditConnector(actor,row,action,details={}){const storeId=actor?.store_id||db.prepare(`SELECT id FROM stores WHERE active=1 ORDER BY name LIMIT 1`).get()?.id;if(storeId)audit({storeId,userId:actor?.id||null,action,entityType:'INTEGRATION_CONNECTOR',entityId:row.connector_key,details})}
export function listCustomConnectors(){return db.prepare(`SELECT * FROM integration_connectors ORDER BY active DESC,name`).all().map(x=>({key:x.connector_key,name:x.name,family:x.family,type:x.connector_type,plannedCapabilities:safeJson(x.planned_capabilities_json,[]),note:x.note||null,active:!!x.active,createdAt:x.created_at,updatedAt:x.updated_at}))}
export function createCustomConnector({actor,name,family='CUSTOM',plannedCapabilities=[],note=null}){const n=clean(name);if(!n)throw Object.assign(new Error('Nom du connecteur obligatoire.'),{status:400,code:'CONNECTOR_NAME_REQUIRED'});const f=requireFamily(family),key=`custom-${slug(n)}-${uid('').replace(/[^a-z0-9]/gi,'').slice(-5).toLowerCase()}`,planned=normalizePlanned(plannedCapabilities);db.prepare(`INSERT INTO integration_connectors(connector_key,name,family,connector_type,planned_capabilities_json,note,active,created_by) VALUES(?,?,?,'CUSTOM',?,?,1,?)`).run(key,n,f,JSON.stringify(planned),clean(note)||null,actor?.id||null);const row=db.prepare(`SELECT * FROM integration_connectors WHERE connector_key=?`).get(key);auditConnector(actor,row,'INTEGRATION_CONNECTOR_CREATED',{family:f,planned});return listCustomConnectors().find(x=>x.key===key)}
export function updateCustomConnector({actor,key,name,family,plannedCapabilities=[],note=null,active=true}){const id=clean(key),existing=db.prepare(`SELECT * FROM integration_connectors WHERE connector_key=?`).get(id);if(!existing)throw Object.assign(new Error('Connecteur personnalisable introuvable.'),{status:404,code:'CONNECTOR_NOT_FOUND'});const n=clean(name)||existing.name,f=requireFamily(family||existing.family),planned=normalizePlanned(plannedCapabilities);db.prepare(`UPDATE integration_connectors SET name=?,family=?,planned_capabilities_json=?,note=?,active=?,updated_at=CURRENT_TIMESTAMP WHERE connector_key=?`).run(n,f,JSON.stringify(planned),clean(note)||null,active===false?0:1,id);const row=db.prepare(`SELECT * FROM integration_connectors WHERE connector_key=?`).get(id);auditConnector(actor,row,'INTEGRATION_CONNECTOR_UPDATED',{family:f,planned,active:!!row.active});return listCustomConnectors().find(x=>x.key===id)}
