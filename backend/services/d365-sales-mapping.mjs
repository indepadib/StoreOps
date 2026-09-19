import { db,audit } from '../db.mjs';
import { config } from '../config.mjs';
import { probeDataEntity } from './dynamics.mjs';
import { storeOperationalSettings } from './store-settings.mjs';

const clean=v=>String(v??'').trim();
const validName=v=>/^[A-Za-z_][A-Za-z0-9_]*$/.test(clean(v));
const REQUIRED_FIELDS=['channel','businessDate','transaction','net'];
const OPTIONAL_FIELDS=['product','quantity','cost','time','productName','department','category'];
const ALL_FIELDS=[...REQUIRED_FIELDS,...OPTIONAL_FIELDS];
const STATES=['DRAFT','VALIDATED','LIVE','DISABLED'];

db.exec(`
CREATE TABLE IF NOT EXISTS d365_sales_mapping_settings(
 id TEXT PRIMARY KEY,
 entity TEXT NOT NULL,
 fields_json TEXT NOT NULL,
 date_filter_mode TEXT NOT NULL DEFAULT 'datetime',
 sales_sign REAL NOT NULL DEFAULT -1,
 quantity_sign REAL NOT NULL DEFAULT 1,
 cost_sign REAL NOT NULL DEFAULT -1,
 state TEXT NOT NULL DEFAULT 'DRAFT',
 smoke_json TEXT NULL,
 validated_at TEXT NULL,
 validated_by TEXT NULL REFERENCES users(id),
 updated_by TEXT NULL REFERENCES users(id),
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
`);

function safeJson(raw,fallback={}){try{const x=JSON.parse(raw||'');return x&&typeof x==='object'?x:fallback}catch{return fallback}}
function normalizeMode(v){return clean(v).toLowerCase()==='date'?'date':'datetime'}
function normalizeSign(v,fallback){const n=Number(v);return Number.isFinite(n)&&n!==0?n:fallback}
function normalizeFields(input={}){
 const out={};
 for(const role of ALL_FIELDS){
  const value=clean(input?.[role]);
  out[role]=value&&validName(value)?value:'';
 }
 return out
}
function validateMappingInput(input={}){
 const entity=clean(input.entity||'RetailTransactionSalesTransBIEntities');
 if(!/^[A-Za-z0-9_]+$/.test(entity))throw Object.assign(new Error('Entité ventes D365 invalide.'),{status:400,code:'D365_SALES_ENTITY_INVALID'});
 const fields=normalizeFields(input.fields||{});
 const missing=REQUIRED_FIELDS.filter(role=>!fields[role]);
 if(missing.length)throw Object.assign(new Error(`Champs ventes obligatoires manquants : ${missing.join(', ')}`),{status:400,code:'D365_SALES_MAPPING_INCOMPLETE',details:{missing}});
 return{entity,fields,dateFilterMode:normalizeMode(input.dateFilterMode),salesSign:normalizeSign(input.salesSign,-1),quantitySign:normalizeSign(input.quantitySign,1),costSign:normalizeSign(input.costSign,-1)}
}
function rowToSettings(row){
 if(!row)return null;
 return{
  entity:row.entity,
  fields:normalizeFields(safeJson(row.fields_json,{})),
  dateFilterMode:normalizeMode(row.date_filter_mode),
  salesSign:Number(row.sales_sign||-1),
  quantitySign:Number(row.quantity_sign||1),
  costSign:Number(row.cost_sign||-1),
  state:STATES.includes(row.state)?row.state:'DRAFT',
  smoke:safeJson(row.smoke_json,null),
  validatedAt:row.validated_at||null,
  validatedBy:row.validated_by||null,
  updatedAt:row.updated_at||null,
  updatedBy:row.updated_by||null
 }
}
function auditMapping(actor,action,details={}){
 const storeId=actor?.store_id||db.prepare(`SELECT id FROM stores WHERE active=1 ORDER BY name LIMIT 1`).get()?.id;
 if(storeId)audit({storeId,userId:actor?.id||null,action,entityType:'D365_SALES_MAPPING',entityId:'default',details})
}

export function d365SalesMappingSettings(){
 return rowToSettings(db.prepare(`SELECT * FROM d365_sales_mapping_settings WHERE id='default'`).get())
}

export function effectiveD365SalesMapping(){
 const persisted=d365SalesMappingSettings();
 if(!persisted)return null;
 if(!['VALIDATED','LIVE','DRAFT','DISABLED'].includes(persisted.state))return null;
 return persisted
}

export function saveD365SalesMappingDraft({actor,input={}}){
 const normalized=validateMappingInput(input);
 db.prepare(`INSERT INTO d365_sales_mapping_settings(id,entity,fields_json,date_filter_mode,sales_sign,quantity_sign,cost_sign,state,smoke_json,validated_at,validated_by,updated_by,updated_at)
 VALUES('default',?,?,?,?,?,?,'DRAFT',NULL,NULL,NULL,?,CURRENT_TIMESTAMP)
 ON CONFLICT(id) DO UPDATE SET entity=excluded.entity,fields_json=excluded.fields_json,date_filter_mode=excluded.date_filter_mode,sales_sign=excluded.sales_sign,quantity_sign=excluded.quantity_sign,cost_sign=excluded.cost_sign,state='DRAFT',smoke_json=NULL,validated_at=NULL,validated_by=NULL,updated_by=excluded.updated_by,updated_at=CURRENT_TIMESTAMP`)
 .run(normalized.entity,JSON.stringify(normalized.fields),normalized.dateFilterMode,normalized.salesSign,normalized.quantitySign,normalized.costSign,actor?.id||null);
 auditMapping(actor,'D365_SALES_MAPPING_DRAFT_SAVED',{entity:normalized.entity,fields:normalized.fields,costMapped:!!normalized.fields.cost});
 return d365SalesMappingSettings()
}

function valuePresent(v){return v!==null&&v!==undefined&&v!==''}
function numericStats(rows,field,sign=1){
 if(!field)return{mapped:false,present:0,numeric:0,nonZero:0,sample:null};
 let present=0,numeric=0,nonZero=0,sample=null;
 for(const row of rows||[]){
  const raw=row?.[field];
  if(!valuePresent(raw))continue;
  present++;
  const n=Number(raw);
  if(Number.isFinite(n)){numeric++;const x=n*sign;if(x!==0)nonZero++;if(sample===null)sample=x}
 }
 return{mapped:true,present,numeric,nonZero,sample}
}
function fieldPresence(rows,field){return{field,present:(rows||[]).filter(r=>valuePresent(r?.[field])).length}}

export function evaluateD365SalesSmokeRows({rows=[],mapping,retailChannelId,latencyMs=null,filtered=false}={}){
 const normalized=validateMappingInput(mapping||{});
 const list=Array.isArray(rows)?rows:[];
 const missingInPayload=REQUIRED_FIELDS.filter(role=>!list.some(r=>Object.prototype.hasOwnProperty.call(r,normalized.fields[role])));
 const presence=Object.fromEntries(ALL_FIELDS.filter(role=>normalized.fields[role]).map(role=>[role,fieldPresence(list,normalized.fields[role])]));
 const tickets=new Set(list.map(r=>clean(r?.[normalized.fields.transaction])).filter(Boolean));
 const sales=numericStats(list,normalized.fields.net,normalized.salesSign),quantity=numericStats(list,normalized.fields.quantity,normalized.quantitySign),cost=numericStats(list,normalized.fields.cost,normalized.costSign);
 const channel=clean(retailChannelId),channelMatches=channel?list.filter(r=>clean(r?.[normalized.fields.channel])===channel).length:0;
 const passed=list.length>0&&missingInPayload.length===0&&sales.numeric>0&&tickets.size>0;
 return{
  status:passed?'PASSED':'FAILED',checkedAt:new Date().toISOString(),retailChannelId:channel||null,entity:normalized.entity,rowCount:list.length,latencyMs,
  filtered:!!filtered&&channelMatches>0,channelMatches,uniqueTickets:tickets.size,requiredFieldsPresent:missingInPayload.length===0,missingInPayload,presence,
  metrics:{sales,quantity,cost},marginCandidate:!!normalized.fields.cost&&cost.numeric>0,
  note:passed?'Structure ventes exploitable. Comparaison métier CA/tickets encore recommandée avant généralisation.':'Le mapping ne satisfait pas les garde-fous techniques.'
 }
}

export async function smokeD365SalesMapping({actor,storeId='val-fleuri',input=null}={}){
 if(config.dynamics.mode!=='live')throw Object.assign(new Error('D365_MODE doit être LIVE pour valider le mapping ventes.'),{status:409,code:'D365_SALES_SMOKE_REQUIRES_LIVE'});
 const base=input?validateMappingInput(input):d365SalesMappingSettings();
 if(!base)throw Object.assign(new Error('Aucun mapping ventes à valider.'),{status:404,code:'D365_SALES_MAPPING_NOT_FOUND'});
 const mapping=input?base:{entity:base.entity,fields:base.fields,dateFilterMode:base.dateFilterMode,salesSign:base.salesSign,quantitySign:base.quantitySign,costSign:base.costSign};
 const store=storeOperationalSettings(storeId),retailChannelId=clean(store?.d365?.retailChannelId);
 if(!retailChannelId)throw Object.assign(new Error('Retail Channel ID absent pour le magasin.'),{status:409,code:'D365_SALES_STORE_CHANNEL_REQUIRED'});
 const channelField=mapping.fields.channel,filter=`${channelField} eq '${retailChannelId.replaceAll("'","''")}'`;
 let probe=await probeDataEntity(mapping.entity,{top:25,filter});
 if(!probe?.ok||!(probe.rows||[]).length)probe=await probeDataEntity(mapping.entity,{top:25});
 const rows=Array.isArray(probe?.rows)?probe.rows:[];
 const smoke={...evaluateD365SalesSmokeRows({rows,mapping,retailChannelId,latencyMs:probe?.latencyMs||null,filtered:!!probe?.ok}),storeId};
 const passed=!!probe?.ok&&smoke.status==='PASSED';
 if(!passed)smoke.status='FAILED';
 if(input)saveD365SalesMappingDraft({actor,input:mapping});
 db.prepare(`UPDATE d365_sales_mapping_settings SET state=?,smoke_json=?,validated_at=?,validated_by=?,updated_by=?,updated_at=CURRENT_TIMESTAMP WHERE id='default'`)
 .run(passed?'VALIDATED':'DRAFT',JSON.stringify(smoke),passed?smoke.checkedAt:null,passed?actor?.id||null:null,actor?.id||null);
 auditMapping(actor,passed?'D365_SALES_MAPPING_VALIDATED':'D365_SALES_MAPPING_VALIDATION_FAILED',{storeId,entity:mapping.entity,rowCount:rows.length,missingInPayload:smoke.missingInPayload||[],marginCandidate:smoke.marginCandidate});
 return{...d365SalesMappingSettings(),smoke}
}

export function activateD365SalesMapping({actor}={}){
 const current=d365SalesMappingSettings();
 if(!current)throw Object.assign(new Error('Aucun mapping ventes enregistré.'),{status:404,code:'D365_SALES_MAPPING_NOT_FOUND'});
 if(current.state!=='VALIDATED'||current.smoke?.status!=='PASSED')throw Object.assign(new Error('Le mapping doit réussir un smoke avant activation.'),{status:409,code:'D365_SALES_MAPPING_NOT_VALIDATED'});
 db.prepare(`UPDATE d365_sales_mapping_settings SET state='LIVE',updated_by=?,updated_at=CURRENT_TIMESTAMP WHERE id='default'`).run(actor?.id||null);
 auditMapping(actor,'D365_SALES_MAPPING_ACTIVATED',{entity:current.entity,costMapped:!!current.fields.cost});
 return d365SalesMappingSettings()
}

export function disableD365SalesMapping({actor}={}){
 const current=d365SalesMappingSettings();
 if(!current)throw Object.assign(new Error('Aucun mapping ventes enregistré.'),{status:404,code:'D365_SALES_MAPPING_NOT_FOUND'});
 db.prepare(`UPDATE d365_sales_mapping_settings SET state='DISABLED',updated_by=?,updated_at=CURRENT_TIMESTAMP WHERE id='default'`).run(actor?.id||null);
 auditMapping(actor,'D365_SALES_MAPPING_DISABLED',{entity:current.entity});
 return d365SalesMappingSettings()
}
