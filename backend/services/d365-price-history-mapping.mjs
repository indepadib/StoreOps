import { db,audit } from '../db.mjs';
import { config } from '../config.mjs';
import { probeDataEntity } from './dynamics.mjs';

const clean=v=>String(v??'').trim();
const validName=v=>/^[A-Za-z_][A-Za-z0-9_]*$/.test(clean(v));
const STATES=['DRAFT','VALIDATED','LIVE','DISABLED'];
const REQUIRED=['item','price','validFrom'];
const OPTIONAL=['validTo','currency','priceGroup','customer','warehouse','site','quantity','unit','recordId'];
const ALL=[...REQUIRED,...OPTIONAL];

db.exec(`
CREATE TABLE IF NOT EXISTS d365_price_history_mapping_settings(
 id TEXT PRIMARY KEY,
 entity TEXT NOT NULL,
 fields_json TEXT NOT NULL,
 state TEXT NOT NULL DEFAULT 'DRAFT',
 smoke_json TEXT NULL,
 validated_at TEXT NULL,
 validated_by TEXT NULL REFERENCES users(id),
 updated_by TEXT NULL REFERENCES users(id),
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
`);

function safeJson(raw,fallback={}){try{const x=JSON.parse(raw||'');return x&&typeof x==='object'?x:fallback}catch{return fallback}}
function normalizeFields(input={}){
 const out={};
 for(const role of ALL){
  const value=clean(input?.[role]);
  out[role]=value&&validName(value)?value:'';
 }
 return out
}
function validateInput(input={}){
 const entity=clean(input.entity||'SalesPriceAgreements');
 if(!/^[A-Za-z0-9_]+$/.test(entity))throw Object.assign(new Error('Entité historique prix invalide.'),{status:400,code:'D365_PRICE_HISTORY_ENTITY_INVALID'});
 const fields=normalizeFields(input.fields||{});
 const missing=REQUIRED.filter(x=>!fields[x]);
 if(missing.length)throw Object.assign(new Error(`Champs historique prix obligatoires manquants : ${missing.join(', ')}`),{status:400,code:'D365_PRICE_HISTORY_MAPPING_INCOMPLETE',details:{missing}});
 return{entity,fields}
}
function rowToSettings(row){
 if(!row)return null;
 return{entity:row.entity,fields:normalizeFields(safeJson(row.fields_json,{})),state:STATES.includes(row.state)?row.state:'DRAFT',smoke:safeJson(row.smoke_json,null),validatedAt:row.validated_at||null,validatedBy:row.validated_by||null,updatedAt:row.updated_at||null,updatedBy:row.updated_by||null}
}
function auditMapping(actor,action,details={}){
 const storeId=actor?.store_id||db.prepare(`SELECT id FROM stores WHERE active=1 ORDER BY name LIMIT 1`).get()?.id;
 if(storeId)audit({storeId,userId:actor?.id||null,action,entityType:'D365_PRICE_HISTORY_MAPPING',entityId:'default',details})
}
function dateOnly(v){const s=clean(v);return /^\d{4}-\d{2}-\d{2}/.test(s)?s.slice(0,10):null}
function numberOrNull(v){const n=Number(v);return Number.isFinite(n)?n:null}

export function d365PriceHistoryMappingSettings(){return rowToSettings(db.prepare(`SELECT * FROM d365_price_history_mapping_settings WHERE id='default'`).get())}
export function effectiveD365PriceHistoryMapping(){const x=d365PriceHistoryMappingSettings();return x?.state==='LIVE'?x:null}

export function saveD365PriceHistoryMappingDraft({actor,input={}}){
 const n=validateInput(input);
 db.prepare(`INSERT INTO d365_price_history_mapping_settings(id,entity,fields_json,state,smoke_json,validated_at,validated_by,updated_by,updated_at)
 VALUES('default',?,?,'DRAFT',NULL,NULL,NULL,?,CURRENT_TIMESTAMP)
 ON CONFLICT(id) DO UPDATE SET entity=excluded.entity,fields_json=excluded.fields_json,state='DRAFT',smoke_json=NULL,validated_at=NULL,validated_by=NULL,updated_by=excluded.updated_by,updated_at=CURRENT_TIMESTAMP`).run(n.entity,JSON.stringify(n.fields),actor?.id||null);
 auditMapping(actor,'D365_PRICE_HISTORY_MAPPING_DRAFT_SAVED',{entity:n.entity,fields:n.fields});
 return d365PriceHistoryMappingSettings()
}

export function evaluateD365PriceHistorySmokeRows({rows=[],mapping,productNumber=null,latencyMs=null,filtered=false}={}){
 const n=validateInput(mapping||{}),list=Array.isArray(rows)?rows:[],sku=clean(productNumber);
 const missingInPayload=REQUIRED.filter(role=>!list.some(r=>Object.prototype.hasOwnProperty.call(r,n.fields[role])));
 const normalized=list.map(r=>({
  productNumber:clean(r?.[n.fields.item]),
  price:numberOrNull(r?.[n.fields.price]),
  from:dateOnly(r?.[n.fields.validFrom]),
  to:n.fields.validTo?dateOnly(r?.[n.fields.validTo]):null,
  currency:n.fields.currency?clean(r?.[n.fields.currency])||null:null,
  priceGroup:n.fields.priceGroup?clean(r?.[n.fields.priceGroup])||null:null,
  warehouse:n.fields.warehouse?clean(r?.[n.fields.warehouse])||null:null
 })).filter(x=>x.price!==null&&x.from);
 const matching=sku?normalized.filter(x=>x.productNumber===sku):normalized;
 const distinctPrices=[...new Set(matching.map(x=>x.price))];
 const distinctDates=[...new Set(matching.map(x=>x.from))];
 const passed=list.length>0&&missingInPayload.length===0&&matching.length>0;
 return{
  status:passed?'PASSED':'FAILED',
  checkedAt:new Date().toISOString(),
  entity:n.entity,
  productNumber:sku||null,
  rowCount:list.length,
  normalizedRows:normalized.length,
  matchingRows:matching.length,
  distinctPrices:distinctPrices.length,
  distinctDates:distinctDates.length,
  latencyMs,
  filtered:!!filtered,
  missingInPayload,
  sample:matching.slice(0,5),
  note:passed?'Historique tarifaire daté exploitable techniquement. Comparaison avec Dynamics recommandée avant généralisation.':'La source ne fournit pas encore un historique daté exploitable pour cet article.'
 }
}

export async function smokeD365PriceHistoryMapping({actor,productNumber,input=null}={}){
 if(config.dynamics.mode!=='live')throw Object.assign(new Error('D365_MODE doit être LIVE pour valider l’historique prix.'),{status:409,code:'D365_PRICE_HISTORY_SMOKE_REQUIRES_LIVE'});
 const sku=clean(productNumber);if(!sku)throw Object.assign(new Error('Un article témoin est requis.'),{status:400,code:'D365_PRICE_HISTORY_SAMPLE_ITEM_REQUIRED'});
 const base=input?validateInput(input):d365PriceHistoryMappingSettings();
 if(!base)throw Object.assign(new Error('Aucun mapping historique prix à valider.'),{status:404,code:'D365_PRICE_HISTORY_MAPPING_NOT_FOUND'});
 const mapping=input?base:{entity:base.entity,fields:base.fields};
 const itemField=mapping.fields.item,filter=`${itemField} eq '${sku.replaceAll("'","''")}'`;
 let probe=await probeDataEntity(mapping.entity,{top:25,filter});
 if(!probe?.ok||!(probe.rows||[]).length)probe=await probeDataEntity(mapping.entity,{top:25});
 const rows=Array.isArray(probe?.rows)?probe.rows:[];
 const smoke=evaluateD365PriceHistorySmokeRows({rows,mapping,productNumber:sku,latencyMs:probe?.latencyMs||null,filtered:!!probe?.ok});
 const passed=!!probe?.ok&&smoke.status==='PASSED';
 if(input)saveD365PriceHistoryMappingDraft({actor,input:mapping});
 db.prepare(`UPDATE d365_price_history_mapping_settings SET state=?,smoke_json=?,validated_at=?,validated_by=?,updated_by=?,updated_at=CURRENT_TIMESTAMP WHERE id='default'`).run(passed?'VALIDATED':'DRAFT',JSON.stringify(smoke),passed?smoke.checkedAt:null,passed?actor?.id||null:null,actor?.id||null);
 auditMapping(actor,passed?'D365_PRICE_HISTORY_MAPPING_VALIDATED':'D365_PRICE_HISTORY_MAPPING_VALIDATION_FAILED',{entity:mapping.entity,productNumber:sku,matchingRows:smoke.matchingRows,distinctPrices:smoke.distinctPrices});
 return{...d365PriceHistoryMappingSettings(),smoke}
}

export function activateD365PriceHistoryMapping({actor}={}){
 const current=d365PriceHistoryMappingSettings();
 if(!current)throw Object.assign(new Error('Aucun mapping historique prix enregistré.'),{status:404,code:'D365_PRICE_HISTORY_MAPPING_NOT_FOUND'});
 if(current.state!=='VALIDATED'||current.smoke?.status!=='PASSED')throw Object.assign(new Error('Le mapping doit réussir un smoke avant activation.'),{status:409,code:'D365_PRICE_HISTORY_MAPPING_NOT_VALIDATED'});
 db.prepare(`UPDATE d365_price_history_mapping_settings SET state='LIVE',updated_by=?,updated_at=CURRENT_TIMESTAMP WHERE id='default'`).run(actor?.id||null);
 auditMapping(actor,'D365_PRICE_HISTORY_MAPPING_ACTIVATED',{entity:current.entity});
 return d365PriceHistoryMappingSettings()
}
export function disableD365PriceHistoryMapping({actor}={}){
 const current=d365PriceHistoryMappingSettings();
 if(!current)throw Object.assign(new Error('Aucun mapping historique prix enregistré.'),{status:404,code:'D365_PRICE_HISTORY_MAPPING_NOT_FOUND'});
 db.prepare(`UPDATE d365_price_history_mapping_settings SET state='DISABLED',updated_by=?,updated_at=CURRENT_TIMESTAMP WHERE id='default'`).run(actor?.id||null);
 auditMapping(actor,'D365_PRICE_HISTORY_MAPPING_DISABLED',{entity:current.entity});
 return d365PriceHistoryMappingSettings()
}
