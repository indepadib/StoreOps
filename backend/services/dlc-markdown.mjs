import {escposLabelBytes} from '../../frontend/js/escpos-label.js';
import { db, uid, audit, todayISO } from '../db.mjs';
import { createDlcRecord } from './dlc.mjs';

const clean=v=>String(v??'').trim();
const finite=v=>{const n=Number(v);return Number.isFinite(n)?n:null};
const round=(v,d=2)=>{const p=10**d;return Math.round((Number(v)+Number.EPSILON)*p)/p};
const isDirector=user=>!!user&&(user.role==='ops_director'||user.permissions_profile==='platform_admin'||user.id==='u-admin');
const isQuality=user=>!!user&&user.role==='employee'&&user.permissions_profile==='quality_audit';
const nowIso=()=>new Date().toISOString();
const adminAudit=({storeId=null,userId=null,action,entityType,entityId,details={}})=>db.prepare('INSERT INTO dlc_markdown_admin_audit(store_id,user_id,action,entity_type,entity_id,details_json) VALUES(?,?,?,?,?,?)').run(storeId||null,userId||null,action,entityType,entityId,JSON.stringify(details));

db.exec([
"CREATE TABLE IF NOT EXISTS dlc_markdown_rules(",
" id TEXT PRIMARY KEY,",
" scope_type TEXT NOT NULL DEFAULT 'ALL',",
" scope_value TEXT NULL,",
" store_id TEXT NULL REFERENCES stores(id),",
" days_before_expiry INTEGER NOT NULL,",
" markdown_code TEXT NOT NULL,",
" priority INTEGER NOT NULL DEFAULT 100,",
" action_mode TEXT NOT NULL DEFAULT 'RECOMMENDED',",
" alert_priority TEXT NOT NULL DEFAULT 'HIGH',",
" active INTEGER NOT NULL DEFAULT 1,",
" created_by TEXT NULL REFERENCES users(id),",
" updated_by TEXT NULL REFERENCES users(id),",
" created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,",
" updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP",
");",
"CREATE INDEX IF NOT EXISTS ix_dlc_markdown_rules_active ON dlc_markdown_rules(active,store_id,scope_type,days_before_expiry);",
"CREATE TABLE IF NOT EXISTS markdown_pos_profiles(",
" markdown_code TEXT PRIMARY KEY,",
" discount_percent REAL NOT NULL,",
" prefix TEXT NOT NULL,",
" symbology TEXT NULL,",
" rounding_decimals INTEGER NOT NULL DEFAULT 2,",
" pricing_strategy TEXT NOT NULL DEFAULT 'PERCENT_FROM_D365_PRICE',",
" validation_state TEXT NOT NULL DEFAULT 'PENDING_POS_TEST',",
" validated_by TEXT NULL REFERENCES users(id),",
" validated_at TEXT NULL,",
" evidence_note TEXT NULL,",
" updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP",
");",
"CREATE TABLE IF NOT EXISTS store_label_printers(",
" id TEXT PRIMARY KEY,",
" store_id TEXT NOT NULL REFERENCES stores(id),",
" name TEXT NOT NULL,",
" bridge_key TEXT NOT NULL,",
" protocol TEXT NOT NULL DEFAULT 'ZPL_BRIDGE',",
" media_width_mm REAL NOT NULL DEFAULT 60,",
" media_height_mm REAL NOT NULL DEFAULT 40,",
" dpi INTEGER NOT NULL DEFAULT 203,",
" color_mode TEXT NOT NULL DEFAULT 'MONO_PRECOLORED',",
" active INTEGER NOT NULL DEFAULT 1,",
" is_default INTEGER NOT NULL DEFAULT 0,",
" created_by TEXT NULL REFERENCES users(id),",
" updated_by TEXT NULL REFERENCES users(id),",
" created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,",
" updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP",
");",
"CREATE INDEX IF NOT EXISTS ix_store_label_printers_store ON store_label_printers(store_id,active,is_default);",
"CREATE TABLE IF NOT EXISTS dlc_markdown_operations(",
" id TEXT PRIMARY KEY,",
" dlc_id TEXT NOT NULL REFERENCES dlc_records(id) ON DELETE CASCADE,",
" store_id TEXT NOT NULL REFERENCES stores(id),",
" rule_id TEXT NULL REFERENCES dlc_markdown_rules(id),",
" markdown_code TEXT NOT NULL,",
" discount_percent REAL NOT NULL,",
" quantity REAL NOT NULL,",
" original_price REAL NULL,",
" final_price REAL NULL,",
" price_validation_state TEXT NOT NULL DEFAULT 'UNVALIDATED',",
" barcode_content TEXT NOT NULL,",
" barcode_validation_state TEXT NOT NULL DEFAULT 'UNVALIDATED',",
" status TEXT NOT NULL DEFAULT 'APPROVED',",
" idempotency_key TEXT NOT NULL UNIQUE,",
" created_by TEXT NOT NULL REFERENCES users(id),",
" approved_by TEXT NULL REFERENCES users(id),",
" created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,",
" updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,",
" printed_at TEXT NULL,",
" applied_at TEXT NULL",
");",
"CREATE INDEX IF NOT EXISTS ix_dlc_markdown_operations_dlc ON dlc_markdown_operations(dlc_id,status);",
"CREATE TABLE IF NOT EXISTS label_print_jobs(",
" id TEXT PRIMARY KEY,",
" store_id TEXT NOT NULL REFERENCES stores(id),",
" printer_id TEXT NOT NULL REFERENCES store_label_printers(id),",
" idempotency_key TEXT NOT NULL UNIQUE,",
" status TEXT NOT NULL DEFAULT 'PENDING',",
" payload_format TEXT NOT NULL DEFAULT 'ZPL',",
" payload TEXT NOT NULL,",
" total_labels INTEGER NOT NULL DEFAULT 0,",
" attempts INTEGER NOT NULL DEFAULT 0,",
" last_error TEXT NULL,",
" created_by TEXT NOT NULL REFERENCES users(id),",
" created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,",
" updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,",
" claimed_at TEXT NULL,",
" printed_at TEXT NULL",
");",
"CREATE INDEX IF NOT EXISTS ix_label_print_jobs_claim ON label_print_jobs(store_id,status,created_at);",
"CREATE TABLE IF NOT EXISTS label_print_job_items(",
" id TEXT PRIMARY KEY,",
" job_id TEXT NOT NULL REFERENCES label_print_jobs(id) ON DELETE CASCADE,",
" operation_id TEXT NOT NULL REFERENCES dlc_markdown_operations(id),",
" dlc_id TEXT NOT NULL REFERENCES dlc_records(id),",
" quantity INTEGER NOT NULL,",
" label_kind TEXT NOT NULL,",
" barcode_content TEXT NOT NULL,",
" product_name TEXT NOT NULL,",
" original_price REAL NOT NULL,",
" final_price REAL NOT NULL,",
" expiry_date TEXT NOT NULL",
");",
"CREATE INDEX IF NOT EXISTS ix_label_print_job_items_job ON label_print_job_items(job_id);",
"CREATE TABLE IF NOT EXISTS dlc_markdown_alerts(",
" id TEXT PRIMARY KEY,",
" alert_key TEXT NOT NULL UNIQUE,",
" store_id TEXT NOT NULL REFERENCES stores(id),",
" dlc_id TEXT NULL REFERENCES dlc_records(id) ON DELETE CASCADE,",
" alert_type TEXT NOT NULL,",
" priority TEXT NOT NULL,",
" status TEXT NOT NULL DEFAULT 'OPEN',",
" title TEXT NOT NULL,",
" details TEXT NULL,",
" first_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,",
" last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,",
" resolved_at TEXT NULL",
");",
"CREATE INDEX IF NOT EXISTS ix_dlc_markdown_alerts_store ON dlc_markdown_alerts(store_id,status,priority);",
"CREATE TABLE IF NOT EXISTS dlc_markdown_admin_audit(",
" id INTEGER PRIMARY KEY AUTOINCREMENT,",
" store_id TEXT NULL REFERENCES stores(id),",
" user_id TEXT NULL REFERENCES users(id),",
" action TEXT NOT NULL,",
" entity_type TEXT NOT NULL,",
" entity_id TEXT NOT NULL,",
" details_json TEXT NULL,",
" created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP",
");"
].join('\n'));

const ensureColumn=(table,column,definition)=>{
 const cols=db.prepare('PRAGMA table_info('+table+')').all();
 if(!cols.some(c=>c.name===column))db.exec('ALTER TABLE '+table+' ADD COLUMN '+column+' '+definition);
};
ensureColumn('dlc_records','source_receipt_id','TEXT NULL');
ensureColumn('dlc_records','source_receipt_line_id','TEXT NULL');
ensureColumn('dlc_records','source_key','TEXT NULL');
ensureColumn('dlc_records','source_lot_key','TEXT NULL');
ensureColumn('dlc_records','last_physical_quantity','REAL NULL');
ensureColumn('dlc_records','last_physical_confirmed_at','TEXT NULL');
ensureColumn('dlc_records','last_physical_confirmed_by','TEXT NULL');
ensureColumn('dlc_records','updated_at','TEXT NULL');
db.exec("CREATE UNIQUE INDEX IF NOT EXISTS ux_dlc_records_source_key ON dlc_records(source_key) WHERE source_key IS NOT NULL");

const seed=db.prepare("INSERT OR IGNORE INTO markdown_pos_profiles(markdown_code,discount_percent,prefix) VALUES(?,?,?)");
seed.run('MD20',20,'250');
seed.run('MD50',50,'221');

export function markdownBarcodeContent(markdownCode,itemCode){
 const profile=db.prepare('SELECT * FROM markdown_pos_profiles WHERE markdown_code=?').get(clean(markdownCode).toUpperCase());
 const item=clean(itemCode);
 if(!profile)throw Object.assign(new Error('Code de démarque non configuré.'),{status:400,code:'MARKDOWN_CODE_UNKNOWN'});
 if(!item)throw Object.assign(new Error('Code article interne Dynamics obligatoire.'),{status:409,code:'MARKDOWN_ITEM_CODE_REQUIRED'});
 return String(profile.prefix)+item;
}

function expiryDays(expiryDate,now=new Date()){
 const end=Date.parse(String(expiryDate||'').slice(0,10)+'T23:59:59Z');
 return Number.isFinite(end)?Math.floor((end-now.getTime())/86400000):null;
}
function scopeRank(type){return {ITEM:4,SUBCATEGORY:3,CATEGORY:2,ALL:1}[String(type||'ALL').toUpperCase()]||0}
function matchRule(rule,record){
 if(rule.store_id&&rule.store_id!==record.store_id)return false;
 const type=String(rule.scope_type||'ALL').toUpperCase(),value=clean(rule.scope_value).toLowerCase();
 if(type==='ALL')return true;
 if(type==='ITEM')return clean(record.product_number).toLowerCase()===value;
 if(type==='SUBCATEGORY')return [record.family,record.category].map(x=>clean(x).toLowerCase()).includes(value);
 if(type==='CATEGORY')return [record.department,record.category].map(x=>clean(x).toLowerCase()).includes(value);
 return false;
}
export function resolveMarkdownRule(record,rules=listMarkdownRules({activeOnly:true}),now=new Date()){
 const days=expiryDays(record.expiry_date,now);
 if(days===null)return{daysRemaining:null,rule:null,blocked:'INVALID_EXPIRY'};
 if(days<0)return{daysRemaining:days,rule:null,blocked:'EXPIRED'};
 const eligible=(rules||[]).filter(r=>r.active!==0&&Number(r.days_before_expiry)>=days&&matchRule(r,record));
 eligible.sort((a,b)=>
   Number(b.priority||0)-Number(a.priority||0)||
   Number(!!b.store_id)-Number(!!a.store_id)||
   scopeRank(b.scope_type)-scopeRank(a.scope_type)||
   Number(a.days_before_expiry)-Number(b.days_before_expiry)||
   Number(b.discount_percent||0)-Number(a.discount_percent||0)||
   String(a.id).localeCompare(String(b.id))
 );
 return{daysRemaining:days,rule:eligible[0]||null,blocked:null};
}

export function listMarkdownRules({activeOnly=false}={}){
 const rows=db.prepare("SELECT r.*,p.discount_percent,p.prefix,p.symbology,p.validation_state pos_validation_state FROM dlc_markdown_rules r LEFT JOIN markdown_pos_profiles p ON p.markdown_code=r.markdown_code "+(activeOnly?"WHERE r.active=1 ":"")+"ORDER BY r.priority DESC,r.store_id DESC,r.scope_type,r.days_before_expiry ASC").all();
 return rows.map(r=>({...r,active:!!r.active}));
}
export function upsertMarkdownRule({id=null,user,scopeType='ALL',scopeValue=null,storeId=null,daysBeforeExpiry,markdownCode,priority=100,actionMode='RECOMMENDED',alertPriority='HIGH',active=true}={}){
 const code=clean(markdownCode).toUpperCase(),profile=db.prepare('SELECT * FROM markdown_pos_profiles WHERE markdown_code=?').get(code);
 if(!profile)throw Object.assign(new Error('Seuls les codes markdown configurés sont autorisés.'),{status:400,code:'MARKDOWN_CODE_UNKNOWN'});
 const scope=clean(scopeType).toUpperCase();
 if(!['ALL','CATEGORY','SUBCATEGORY','ITEM'].includes(scope))throw Object.assign(new Error('Périmètre de règle invalide.'),{status:400});
 if(scope!=='ALL'&&!clean(scopeValue))throw Object.assign(new Error('Valeur de périmètre obligatoire.'),{status:400});
 const days=Number(daysBeforeExpiry);if(!Number.isInteger(days)||days<0||days>3650)throw Object.assign(new Error('Nombre de jours invalide.'),{status:400});
 const mode=clean(actionMode).toUpperCase();if(!['AUTOMATIC','RECOMMENDED','APPROVAL'].includes(mode))throw Object.assign(new Error("Mode d'action invalide."),{status:400});
 const rid=id||uid('mdr');
 if(id){
  const found=db.prepare('SELECT id FROM dlc_markdown_rules WHERE id=?').get(id);if(!found)throw Object.assign(new Error('Règle introuvable.'),{status:404});
  db.prepare("UPDATE dlc_markdown_rules SET scope_type=?,scope_value=?,store_id=?,days_before_expiry=?,markdown_code=?,priority=?,action_mode=?,alert_priority=?,active=?,updated_by=?,updated_at=CURRENT_TIMESTAMP WHERE id=?")
    .run(scope,scope==='ALL'?null:clean(scopeValue),clean(storeId)||null,days,code,Number(priority)||0,mode,clean(alertPriority).toUpperCase()||'HIGH',active?1:0,user?.id||null,rid);
 }else{
  db.prepare("INSERT INTO dlc_markdown_rules(id,scope_type,scope_value,store_id,days_before_expiry,markdown_code,priority,action_mode,alert_priority,active,created_by,updated_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)")
    .run(rid,scope,scope==='ALL'?null:clean(scopeValue),clean(storeId)||null,days,code,Number(priority)||0,mode,clean(alertPriority).toUpperCase()||'HIGH',active?1:0,user?.id||null,user?.id||null);
 }
 const auditPayload={storeId:clean(storeId)||null,userId:user?.id,action:'DLC_MARKDOWN_RULE_SAVED',entityType:'DLC_MARKDOWN_RULE',entityId:rid,details:{scope,scopeValue,days,code,mode,priority}};if(auditPayload.storeId)audit(auditPayload);else adminAudit(auditPayload);
 return db.prepare('SELECT * FROM dlc_markdown_rules WHERE id=?').get(rid);
}

export function markdownPosProfiles(){
 return db.prepare('SELECT * FROM markdown_pos_profiles ORDER BY discount_percent').all();
}
export function validatePosProfile({markdownCode,user,symbology,roundingDecimals=2,evidenceNote,confirmed=false}={}){
 if(!isDirector(user))throw Object.assign(new Error('Validation POS réservée à la Direction / administration.'),{status:403});
 if(!confirmed)throw Object.assign(new Error('Le scan réel en Store Commerce doit être confirmé.'),{status:409,code:'POS_PHYSICAL_TEST_REQUIRED'});
 const code=clean(markdownCode).toUpperCase(),sym=clean(symbology).toUpperCase();
 if(!['CODE128'].includes(sym))throw Object.assign(new Error('Symbologie non supportée par le générateur actuel. Valider CODE128 sur le matériel avant activation.'),{status:409,code:'BARCODE_SYMBOLOGY_NOT_SUPPORTED'});
 if(!clean(evidenceNote))throw Object.assign(new Error('Une note de preuve du test caisse est obligatoire.'),{status:400});
 db.prepare("UPDATE markdown_pos_profiles SET symbology=?,rounding_decimals=?,validation_state='VALIDATED',validated_by=?,validated_at=CURRENT_TIMESTAMP,evidence_note=?,updated_at=CURRENT_TIMESTAMP WHERE markdown_code=?")
  .run(sym,Math.max(0,Math.min(3,Number(roundingDecimals)||0)),user.id,clean(evidenceNote),code);
 adminAudit({userId:user.id,action:'MARKDOWN_POS_PROFILE_VALIDATED',entityType:'MARKDOWN_POS_PROFILE',entityId:code,details:{symbology:sym,evidenceNote:clean(evidenceNote)}});
 return db.prepare('SELECT * FROM markdown_pos_profiles WHERE markdown_code=?').get(code);
}

export function listPrinters(storeId=null){
 return db.prepare('SELECT * FROM store_label_printers '+(storeId?'WHERE store_id=? ':'')+'ORDER BY is_default DESC,active DESC,name').all(...(storeId?[storeId]:[])).map(x=>({...x,active:!!x.active,is_default:!!x.is_default}));
}
export function upsertPrinter({id=null,user,storeId,name,bridgeKey,protocol='ZPL_BRIDGE',mediaWidthMm=60,mediaHeightMm=40,dpi=203,colorMode='MONO_PRECOLORED',active=true,isDefault=false}={}){
 const sid=clean(storeId);if(!sid)throw Object.assign(new Error('Magasin obligatoire.'),{status:400});
 protocol=clean(protocol).toUpperCase();
 if(!['ZPL_BRIDGE','ZPL_RAWBT','ESCPOS_RAWBT'].includes(protocol))throw Object.assign(new Error('Mode imprimante non pris en charge.'),{status:400});
 if(protocol==='ZPL_BRIDGE'&&!clean(bridgeKey))throw Object.assign(new Error('Clé bridge obligatoire.'),{status:400});
 if(id&&!db.prepare('SELECT id FROM store_label_printers WHERE id=? AND store_id=?').get(id,sid))throw Object.assign(new Error('Imprimante introuvable dans ce magasin.'),{status:404});
 const pid=id||uid('printer');
 if(isDefault)db.prepare('UPDATE store_label_printers SET is_default=0 WHERE store_id=?').run(sid);
 if(id){
  if(!db.prepare('SELECT id FROM store_label_printers WHERE id=?').get(id))throw Object.assign(new Error('Imprimante introuvable.'),{status:404});
  db.prepare("UPDATE store_label_printers SET name=?,bridge_key=?,protocol=?,media_width_mm=?,media_height_mm=?,dpi=?,color_mode=?,active=?,is_default=?,updated_by=?,updated_at=CURRENT_TIMESTAMP WHERE id=?")
    .run(clean(name)||'Imprimante étiquettes',clean(bridgeKey),clean(protocol).toUpperCase(),Number(mediaWidthMm)||60,Number(mediaHeightMm)||40,Number(dpi)||203,clean(colorMode).toUpperCase(),active?1:0,isDefault?1:0,user?.id||null,pid);
 }else{
  db.prepare("INSERT INTO store_label_printers(id,store_id,name,bridge_key,protocol,media_width_mm,media_height_mm,dpi,color_mode,active,is_default,created_by,updated_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)")
    .run(pid,sid,clean(name)||'Imprimante étiquettes',clean(bridgeKey),clean(protocol).toUpperCase(),Number(mediaWidthMm)||60,Number(mediaHeightMm)||40,Number(dpi)||203,clean(colorMode).toUpperCase(),active?1:0,isDefault?1:0,user?.id||null,user?.id||null);
 }
 audit({storeId:sid,userId:user?.id,action:'LABEL_PRINTER_SAVED',entityType:'LABEL_PRINTER',entityId:pid,details:{name,bridgeKey,protocol,isDefault}});
 return db.prepare('SELECT * FROM store_label_printers WHERE id=?').get(pid);
}

function reservedForDlc(dlcId){
 const row=db.prepare("SELECT COALESCE(SUM(quantity),0) qty FROM dlc_markdown_operations WHERE dlc_id=? AND status IN ('PENDING_APPROVAL','APPROVED','QUEUED','PRINTING','PRINTED','APPLIED')").get(dlcId);
 return Number(row?.qty||0);
}
function printedForDlc(dlcId){
 const row=db.prepare("SELECT COALESCE(SUM(quantity),0) qty FROM dlc_markdown_operations WHERE dlc_id=? AND status IN ('PRINTED','APPLIED')").get(dlcId);
 return Number(row?.qty||0);
}
function recommendationFromRecord(record,rules){
 const resolved=resolveMarkdownRule(record,rules),remaining=Math.max(0,Number(record.remaining_quantity??record.quantity??0)),reserved=reservedForDlc(record.id),printed=printedForDlc(record.id),review=Math.max(0,round(remaining-reserved,3)),profile=resolved.rule?db.prepare('SELECT * FROM markdown_pos_profiles WHERE markdown_code=?').get(resolved.rule.markdown_code):null;
 const expired=resolved.blocked==='EXPIRED';
 return{
  id:record.id,storeId:record.store_id,productName:record.product_name,productNumber:record.product_number,ean:record.ean||null,department:record.department||record.category||null,family:record.family||null,
  expiryDate:record.expiry_date,expiryType:record.expiry_type,daysRemaining:resolved.daysRemaining,lotRef:record.lot_ref||null,initialQuantity:Number(record.original_quantity??record.quantity??0),
  estimatedRemainingQuantity:remaining,quantityConfidence:record.last_physical_confirmed_at?'PHYSICALLY_CONFIRMED_THEN_MOVEMENTS_UNKNOWN':'ESTIMATE_REQUIRES_PHYSICAL_CONFIRMATION',
  alreadyReservedQuantity:reserved,alreadyPrintedQuantity:printed,quantityToReview:review,rule:resolved.rule,markdownCode:resolved.rule?.markdown_code||null,discountPercent:profile?.discount_percent??null,
  barcodeContent:resolved.rule&&record.product_number?String(profile?.prefix||'')+record.product_number:null,posValidationState:profile?.validation_state||'UNCONFIGURED',symbology:profile?.symbology||null,
  originalPrice:record.unit_retail_value??null,priceSnapshotState:record.unit_retail_value==null?'UNAVAILABLE':'STALE_SNAPSHOT_RECHECK_REQUIRED',
  status:expired?'EXPIRED_WITHDRAW':review<=0?'PROCESSED':resolved.rule?'ACTION_REQUIRED':'NO_MARKDOWN_RULE',
  blockedReason:expired?'EXPIRED':resolved.blocked
 };
}
export function listMarkdownRecommendations(storeId,{includeProcessed=false}={}){
 const rules=listMarkdownRules({activeOnly:true}),rows=db.prepare("SELECT d.*,s.name store_name FROM dlc_records d JOIN stores s ON s.id=d.store_id WHERE d.store_id=? AND d.status='ACTIVE' AND COALESCE(d.remaining_quantity,d.quantity,0)>0 ORDER BY d.expiry_date,d.created_at").all(storeId);
 const out=rows.map(r=>recommendationFromRecord(r,rules));
 return includeProcessed?out:out.filter(x=>x.status!=='PROCESSED');
}
export function markdownDashboard(storeId=null){
 const stores=storeId?[storeId]:db.prepare('SELECT id FROM stores WHERE active=1 ORDER BY name').all().map(x=>x.id),all=stores.flatMap(id=>listMarkdownRecommendations(id,{includeProcessed:true}));
 const jobs=db.prepare("SELECT status,COUNT(*) n,COALESCE(SUM(total_labels),0) labels FROM label_print_jobs "+(storeId?'WHERE store_id=? ':'')+"GROUP BY status").all(...(storeId?[storeId]:[]));
 const alerts=db.prepare("SELECT priority,COUNT(*) n FROM dlc_markdown_alerts WHERE status='OPEN' "+(storeId?'AND store_id=? ':'')+"GROUP BY priority").all(...(storeId?[storeId]:[]));
 return{
  productsApproachingExpiry:all.filter(x=>x.status==='ACTION_REQUIRED').length,
  quantitiesAtRisk:round(all.filter(x=>x.status==='ACTION_REQUIRED').reduce((s,x)=>s+x.quantityToReview,0),3),
  expiredProducts:all.filter(x=>x.status==='EXPIRED_WITHDRAW').length,
  md20Quantity:round(all.filter(x=>x.markdownCode==='MD20').reduce((s,x)=>s+x.quantityToReview,0),3),
  md50Quantity:round(all.filter(x=>x.markdownCode==='MD50').reduce((s,x)=>s+x.quantityToReview,0),3),
  pendingActions:all.filter(x=>x.status==='ACTION_REQUIRED').length,
  printJobs:Object.fromEntries(jobs.map(x=>[x.status,{jobs:Number(x.n),labels:Number(x.labels)}])),
  alerts:Object.fromEntries(alerts.map(x=>[x.priority,Number(x.n)])),
  valueAtRisk:null,wasteAvoided:null,valueState:'NOT_CLAIMED_WITHOUT_RELIABLE_BATCH_VALUE'
 };
}

function computeFinalPrice(originalPrice,profile,previewOnly=false){
 const original=finite(originalPrice);if(original===null||(!previewOnly&&profile?.validation_state!=='VALIDATED'))return null;
 if(profile.pricing_strategy!=='PERCENT_FROM_D365_PRICE')return null;
 return round(original*(1-Number(profile.discount_percent)/100),Number(profile.rounding_decimals)||0);
}
export function operationPreview({dlcId,markdownCode=null,originalPrice=null}={}){
 const record=db.prepare('SELECT * FROM dlc_records WHERE id=?').get(dlcId);if(!record)throw Object.assign(new Error('Lot DLC introuvable.'),{status:404});
 const rec=recommendationFromRecord(record,listMarkdownRules({activeOnly:true}));
 if(rec.status==='EXPIRED_WITHDRAW')throw Object.assign(new Error('Produit périmé : retrait obligatoire, démarque interdite.'),{status:409,code:'EXPIRED_MARKDOWN_BLOCKED'});
 const code=clean(markdownCode||rec.markdownCode).toUpperCase(),profile=db.prepare('SELECT * FROM markdown_pos_profiles WHERE markdown_code=?').get(code);
 if(!profile)throw Object.assign(new Error('Code markdown non configuré.'),{status:400});
 const barcode=markdownBarcodeContent(code,record.product_number),price=computeFinalPrice(originalPrice??record.unit_retail_value,profile);
 return{recommendation:rec,markdownCode:code,discountPercent:profile.discount_percent,barcodeContent:barcode,symbology:profile.symbology,posValidationState:profile.validation_state,originalPrice:finite(originalPrice??record.unit_retail_value),finalPrice:price,previewFinalPrice:computeFinalPrice(originalPrice??record.unit_retail_value,profile,true),priceValidationState:price===null?'UNVALIDATED':'VALIDATED_PROFILE_FROM_D365_BASE',printReady:profile.validation_state==='VALIDATED'&&!!profile.symbology&&price!==null};
}
export function createMarkdownOperation({dlcId,user,quantity,markdownCode=null,originalPrice=null,idempotencyKey=null}={}){
 const record=db.prepare('SELECT * FROM dlc_records WHERE id=?').get(dlcId);if(!record)throw Object.assign(new Error('Lot DLC introuvable.'),{status:404});
 const rec=recommendationFromRecord(record,listMarkdownRules({activeOnly:true}));
 if(rec.status==='EXPIRED_WITHDRAW')throw Object.assign(new Error('Produit périmé : impression markdown interdite.'),{status:409,code:'EXPIRED_MARKDOWN_BLOCKED'});
 const q=Number(quantity);if(!Number.isFinite(q)||q<=0)throw Object.assign(new Error('Quantité physique à étiqueter invalide.'),{status:400});
 if(q>rec.quantityToReview+1e-6)throw Object.assign(new Error('La quantité dépasse le solde à revoir. Recompter ou corriger le lot avant impression.'),{status:409,code:'MARKDOWN_QTY_EXCEEDS_REMAINING'});
 const code=clean(markdownCode||rec.markdownCode).toUpperCase();
 if(!code)throw Object.assign(new Error('Aucune règle markdown applicable.'),{status:409,code:'MARKDOWN_RULE_MISSING'});
 if(code!==rec.markdownCode&&!isDirector(user)&&!isQuality(user))throw Object.assign(new Error('Changement de niveau de démarque non autorisé pour ce profil.'),{status:403,code:'MARKDOWN_OVERRIDE_FORBIDDEN'});
 const requestedRule=code===rec.markdownCode?rec.rule:listMarkdownRules({activeOnly:true}).find(r=>r.markdown_code===code&&matchRule(r,record)&&Number(r.days_before_expiry)>=rec.daysRemaining);
 if(!requestedRule)throw Object.assign(new Error('Aucune règle active n’autorise ce niveau de démarque pour cet article.'),{status:409,code:'MARKDOWN_OVERRIDE_RULE_MISSING'});
 const preview=operationPreview({dlcId,markdownCode:code,originalPrice}),key=clean(idempotencyKey)||[dlcId,code,q,clean(user?.id),todayISO()].join('|');
 const existing=db.prepare('SELECT * FROM dlc_markdown_operations WHERE idempotency_key=?').get(key);if(existing)return existing;
 const status=requestedRule.action_mode==='APPROVAL'&&!isDirector(user)?'PENDING_APPROVAL':'APPROVED',id=uid('mdo');
 db.prepare("INSERT INTO dlc_markdown_operations(id,dlc_id,store_id,rule_id,markdown_code,discount_percent,quantity,original_price,final_price,price_validation_state,barcode_content,barcode_validation_state,status,idempotency_key,created_by,approved_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
  .run(id,dlcId,record.store_id,requestedRule.id,code,preview.discountPercent,q,preview.originalPrice,preview.finalPrice,preview.priceValidationState,preview.barcodeContent,preview.posValidationState==='VALIDATED'?'VALIDATED':'UNVALIDATED',status,key,user.id,status==='APPROVED'?user.id:null);
 db.prepare("UPDATE dlc_records SET last_physical_quantity=?,last_physical_confirmed_at=CURRENT_TIMESTAMP,last_physical_confirmed_by=? WHERE id=?").run(q,user.id,dlcId);
 audit({storeId:record.store_id,userId:user.id,action:'DLC_MARKDOWN_OPERATION_CREATED',entityType:'DLC_MARKDOWN_OPERATION',entityId:id,details:{dlcId,quantity:q,markdownCode:code,status,barcode:preview.barcodeContent,priceValidation:preview.priceValidationState}});
 return db.prepare('SELECT * FROM dlc_markdown_operations WHERE id=?').get(id);
}
export function approveMarkdownOperation({operationId,user}={}){
 if(!isDirector(user)&&!isQuality(user))throw Object.assign(new Error('Approbation réservée à la Direction / Qualité.'),{status:403});
 const op=db.prepare('SELECT * FROM dlc_markdown_operations WHERE id=?').get(operationId);if(!op)throw Object.assign(new Error('Opération introuvable.'),{status:404});
 db.prepare("UPDATE dlc_markdown_operations SET status='APPROVED',approved_by=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='PENDING_APPROVAL'").run(user.id,operationId);
 audit({storeId:op.store_id,userId:user.id,action:'DLC_MARKDOWN_OPERATION_APPROVED',entityType:'DLC_MARKDOWN_OPERATION',entityId:operationId});
 return db.prepare('SELECT * FROM dlc_markdown_operations WHERE id=?').get(operationId);
}

function zplEscape(value){return String(value??'').replace(/[\^~]/g,' ').replace(/[^\x20-\x7EÀ-ÿ]/g,' ')}
function labelZpl(op,record,profile,printer){
 if(profile.symbology!=='CODE128')throw Object.assign(new Error('Symbologie POS non compatible avec le générateur ZPL.'),{status:409,code:'PRINT_SYMBOLOGY_UNSUPPORTED'});
 const width=Math.max(300,Math.round(Number(printer.media_width_mm||60)/25.4*Number(printer.dpi||203))),height=Math.max(200,Math.round(Number(printer.media_height_mm||40)/25.4*Number(printer.dpi||203)));
 const accent=op.markdown_code==='MD50'?'ROULEAU ROUGE':'ROULEAU JAUNE';
 const name=zplEscape(record.product_name).slice(0,34),expiry=zplEscape(record.expiry_date),code=zplEscape(op.barcode_content),oldPrice=Number(op.original_price).toFixed(2),newPrice=Number(op.final_price).toFixed(2);
 return ['^XA','^CI28','^PW'+width,'^LL'+height,'^FO18,14^A0N,34,34^FD-'+Math.round(op.discount_percent)+'%  '+accent+'^FS','^FO18,56^A0N,24,24^FD'+name+'^FS','^FO18,90^A0N,20,20^FDAncien '+oldPrice+' DH   NOUVEAU '+newPrice+' DH^FS','^FO24,120^BY2,2,62^BCN,62,Y,N,N^FD'+code+'^FS','^XZ'].join('\n');
}
export function createPrintJob({storeId,user,operationIds=[],printerId=null,idempotencyKey=null}={}){
 const ids=[...new Set((operationIds||[]).map(clean).filter(Boolean))];if(!ids.length)throw Object.assign(new Error('Aucune opération à imprimer.'),{status:400});
 const key=clean(idempotencyKey)||['print',storeId,...[...ids].sort()].join('|'),existing=db.prepare('SELECT * FROM label_print_jobs WHERE idempotency_key=?').get(key);
 if(existing){if(existing.store_id!==storeId)throw Object.assign(new Error('Clé d’idempotence déjà utilisée pour un autre magasin.'),{status:409,code:'PRINT_IDEMPOTENCY_STORE_MISMATCH'});return existing}
 const ops=ids.map(id=>db.prepare('SELECT * FROM dlc_markdown_operations WHERE id=?').get(id));
 if(ops.some(x=>!x))throw Object.assign(new Error('Une opération markdown est introuvable.'),{status:404});
 if(ops.some(x=>x.store_id!==storeId))throw Object.assign(new Error('Un lot d’impression ne peut pas mélanger plusieurs magasins.'),{status:409});
 if(ops.some(x=>x.status!=='APPROVED'))throw Object.assign(new Error('Toutes les opérations doivent être approuvées avant impression.'),{status:409,code:'MARKDOWN_OPERATION_NOT_APPROVED'});
 if(ops.some(x=>x.price_validation_state!=='VALIDATED_PROFILE_FROM_D365_BASE'||x.barcode_validation_state!=='VALIDATED'||x.final_price===null))throw Object.assign(new Error('Impression bloquée : prix ou code-barres non validé contre le profil POS.'),{status:409,code:'MARKDOWN_PRINT_VALIDATION_REQUIRED'});
 const printer=printerId?db.prepare('SELECT * FROM store_label_printers WHERE id=? AND store_id=? AND active=1').get(printerId,storeId):db.prepare('SELECT * FROM store_label_printers WHERE store_id=? AND active=1 ORDER BY is_default DESC,created_at LIMIT 1').get(storeId);
 if(!printer)throw Object.assign(new Error('Aucune imprimante d’étiquettes active n’est configurée pour ce magasin.'),{status:409,code:'LABEL_PRINTER_NOT_CONFIGURED'});
 const chunks=[],items=[];for(const op of ops){
  const record=db.prepare('SELECT * FROM dlc_records WHERE id=?').get(op.dlc_id),profile=db.prepare('SELECT * FROM markdown_pos_profiles WHERE markdown_code=?').get(op.markdown_code),quantity=Math.floor(Number(op.quantity));
  if(quantity<=0||Math.abs(quantity-Number(op.quantity))>1e-6)throw Object.assign(new Error('Le pilote étiquette actuel imprime des unités entières uniquement. Vérifier l’unité du lot.'),{status:409,code:'LABEL_INTEGER_QUANTITY_REQUIRED'});
  const mobile=printer.protocol!=='ZPL_BRIDGE';
  if(profile.symbology!=='CODE128')throw Object.assign(new Error('Profil CODE128 requis.'),{status:409});
  const label=mobile?Buffer.from(escposLabelBytes({label_kind:op.markdown_code,barcode_content:op.barcode_content,product_name:record.product_name,original_price:op.original_price,final_price:op.final_price,expiry_date:record.expiry_date})):labelZpl(op,record,profile,printer);for(let i=0;i<quantity;i++)chunks.push(label);
  items.push({op,record,quantity});
 }
 const format=printer.protocol==='ZPL_BRIDGE'?'ZPL':'ESCPOS_BASE64';
 const id=uid('print'),payload=format==='ZPL'?chunks.join('\n'):Buffer.concat(chunks).toString('base64'),total=items.reduce((s,x)=>s+x.quantity,0);
 db.exec('BEGIN');try{
  db.prepare("INSERT INTO label_print_jobs(id,store_id,printer_id,idempotency_key,status,payload_format,payload,total_labels,created_by) VALUES(?,?,?,?,?,?,?,?,?)").run(id,storeId,printer.id,key,'PENDING',format,payload,total,user.id);
  const ins=db.prepare("INSERT INTO label_print_job_items(id,job_id,operation_id,dlc_id,quantity,label_kind,barcode_content,product_name,original_price,final_price,expiry_date) VALUES(?,?,?,?,?,?,?,?,?,?,?)");
  for(const x of items){ins.run(uid('printitem'),id,x.op.id,x.op.dlc_id,x.quantity,x.op.markdown_code,x.op.barcode_content,x.record.product_name,x.op.original_price,x.op.final_price,x.record.expiry_date);db.prepare("UPDATE dlc_markdown_operations SET status='QUEUED',updated_at=CURRENT_TIMESTAMP WHERE id=?").run(x.op.id)}
  db.exec('COMMIT');
 }catch(e){db.exec('ROLLBACK');throw e}
 audit({storeId,userId:user.id,action:'LABEL_PRINT_JOB_CREATED',entityType:'LABEL_PRINT_JOB',entityId:id,details:{printerId:printer.id,totalLabels:total,operations:ids}});
 return db.prepare('SELECT * FROM label_print_jobs WHERE id=?').get(id);
}
export function listPrintJobs(storeId,{limit=100}={}){
 return db.prepare("SELECT j.*,p.name printer_name,p.protocol printer_protocol FROM label_print_jobs j JOIN store_label_printers p ON p.id=j.printer_id WHERE j.store_id=? ORDER BY j.created_at DESC LIMIT ?").all(storeId,Math.max(1,Math.min(500,Number(limit)||100)));
}
export function mobilePrintJob({jobId,user,action,confirmed=false}={}){
 const job=db.prepare('SELECT j.*,p.protocol,p.bridge_key FROM label_print_jobs j JOIN store_label_printers p ON p.id=j.printer_id WHERE j.id=?').get(jobId);
 if(!job)throw Object.assign(new Error('Job introuvable.'),{status:404});
 if(!(user&&(user.role==='ops_director'||user.permissions_profile==='platform_admin'||user.id==='u-admin'||user.store_id===job.store_id||user.permissions_profile==='quality_audit')))throw Object.assign(new Error('Accès interdit à ce magasin.'),{status:403});
 if(!['ZPL_RAWBT','ESCPOS_RAWBT'].includes(job.protocol))throw Object.assign(new Error('Ce job utilise le relais magasin.'),{status:409});
 if(action==='prepare'){
  let payload=job.payload;
  if(job.payload_format!=='ESCPOS_BASE64'){
   const items=db.prepare('SELECT * FROM label_print_job_items WHERE job_id=? ORDER BY rowid').all(jobId);
   if(!items.length)throw Object.assign(new Error('Lot historique sans details : preparation impossible.'),{status:409});
   const chunks=[];for(const item of items){const label=Buffer.from(escposLabelBytes(item));for(let i=0;i<item.quantity;i++)chunks.push(label)}
   payload=Buffer.concat(chunks).toString('base64');
  }
  if(Buffer.from(payload,'base64').length>180000)throw Object.assign(new Error('Lot trop volumineux pour RawBT. Réduire la sélection.'),{status:409});
  const result=db.prepare("UPDATE label_print_jobs SET status='PRINTING',payload=?,payload_format='ESCPOS_BASE64',attempts=attempts+1,claimed_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='PENDING'").run(payload,jobId);
  if(!result.changes)throw Object.assign(new Error('Job déjà transmis ou terminé. Vérifier la sortie physique avant toute reprise.'),{status:409});
  db.prepare("UPDATE dlc_markdown_operations SET status='PRINTING',updated_at=CURRENT_TIMESTAMP WHERE id IN (SELECT operation_id FROM label_print_job_items WHERE job_id=?)").run(jobId);
  audit({storeId:job.store_id,userId:user.id,action:'LABEL_RAWBT_PREPARED',entityType:'LABEL_PRINT_JOB',entityId:jobId});
  return{id:jobId,payload,payload_format:'ESCPOS_BASE64',total_labels:job.total_labels,status:'PRINTING'};
 }
 if(!['confirm','failed'].includes(action)||!confirmed||job.status!=='PRINTING')throw Object.assign(new Error('Confirmation explicite et job en cours requis.'),{status:409});
 const result=completePrintJob({jobId,bridgeKey:job.bridge_key,success:action==='confirm',error:'Sortie vérifiée par opérateur : impression absente ou incomplète. Ne relancer qu’après contrôle des étiquettes.'});
 audit({storeId:job.store_id,userId:user.id,action:action==='confirm'?'LABEL_RAWBT_CONFIRMED':'LABEL_RAWBT_FAILED',entityType:'LABEL_PRINT_JOB',entityId:jobId});
 return result;
}
export function listMarkdownOperations(storeId,{limit=200}={}){
 return db.prepare("SELECT o.*,d.product_name,d.product_number,d.ean,d.expiry_date,d.lot_ref,u.name created_by_name FROM dlc_markdown_operations o JOIN dlc_records d ON d.id=o.dlc_id LEFT JOIN users u ON u.id=o.created_by WHERE o.store_id=? ORDER BY o.created_at DESC LIMIT ?").all(storeId,Math.max(1,Math.min(1000,Number(limit)||200)));
}
export function retryPrintJob({jobId,user}={}){
 const job=db.prepare('SELECT * FROM label_print_jobs WHERE id=?').get(jobId);if(!job)throw Object.assign(new Error('Job introuvable.'),{status:404});
 if(!['FAILED','PENDING'].includes(job.status))throw Object.assign(new Error('Ce job ne peut pas être relancé dans son état actuel.'),{status:409});
 db.prepare("UPDATE label_print_jobs SET status='PENDING',last_error=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(jobId);
 db.prepare("UPDATE dlc_markdown_operations SET status='QUEUED',updated_at=CURRENT_TIMESTAMP WHERE id IN (SELECT operation_id FROM label_print_job_items WHERE job_id=?)").run(jobId);
 audit({storeId:job.store_id,userId:user?.id,action:'LABEL_PRINT_JOB_RETRIED',entityType:'LABEL_PRINT_JOB',entityId:jobId});
 return db.prepare('SELECT * FROM label_print_jobs WHERE id=?').get(jobId);
}
export function claimPrintJob({bridgeKey}={}){
 const key=clean(bridgeKey);if(!key)return null;
 const printer=db.prepare("SELECT * FROM store_label_printers WHERE bridge_key=? AND active=1 AND protocol='ZPL_BRIDGE' ORDER BY is_default DESC LIMIT 1").get(key);if(!printer)return null;
 const job=db.prepare("SELECT * FROM label_print_jobs WHERE printer_id=? AND status='PENDING' ORDER BY created_at LIMIT 1").get(printer.id);if(!job)return null;
 db.prepare("UPDATE label_print_jobs SET status='PRINTING',attempts=attempts+1,claimed_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='PENDING'").run(job.id);
 db.prepare("UPDATE dlc_markdown_operations SET status='PRINTING',updated_at=CURRENT_TIMESTAMP WHERE id IN (SELECT operation_id FROM label_print_job_items WHERE job_id=?)").run(job.id);
 return{...db.prepare('SELECT * FROM label_print_jobs WHERE id=?').get(job.id),printer:{id:printer.id,name:printer.name,protocol:printer.protocol},items:db.prepare('SELECT * FROM label_print_job_items WHERE job_id=? ORDER BY rowid').all(job.id)};
}
export function completePrintJob({jobId,bridgeKey,success,error=null}={}){
 const job=db.prepare('SELECT j.*,p.bridge_key FROM label_print_jobs j JOIN store_label_printers p ON p.id=j.printer_id WHERE j.id=?').get(jobId);if(!job)throw Object.assign(new Error('Job introuvable.'),{status:404});
 if(clean(job.bridge_key)!==clean(bridgeKey))throw Object.assign(new Error('Bridge imprimante non autorisé.'),{status:403});
 const status=success?'PRINTED':'FAILED';
 db.exec('BEGIN');try{
  db.prepare("UPDATE label_print_jobs SET status=?,last_error=?,printed_at=CASE WHEN ?='PRINTED' THEN CURRENT_TIMESTAMP ELSE printed_at END,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(status,success?null:clean(error)||'Erreur imprimante',status,jobId);
  if(success)db.prepare("UPDATE dlc_markdown_operations SET status='PRINTED',printed_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id IN (SELECT operation_id FROM label_print_job_items WHERE job_id=?)").run(jobId);
  else db.prepare("UPDATE dlc_markdown_operations SET status='APPROVED',updated_at=CURRENT_TIMESTAMP WHERE id IN (SELECT operation_id FROM label_print_job_items WHERE job_id=?)").run(jobId);
  db.exec('COMMIT');
 }catch(e){db.exec('ROLLBACK');throw e}
 return db.prepare('SELECT * FROM label_print_jobs WHERE id=?').get(jobId);
}
export function confirmLabelsApplied({operationId,user}={}){
 const op=db.prepare('SELECT * FROM dlc_markdown_operations WHERE id=?').get(operationId);if(!op)throw Object.assign(new Error('Opération introuvable.'),{status:404});
 if(op.status!=='PRINTED'&&op.status!=='APPLIED')throw Object.assign(new Error('Les étiquettes doivent être imprimées avant confirmation de pose.'),{status:409});
 db.prepare("UPDATE dlc_markdown_operations SET status='APPLIED',applied_at=COALESCE(applied_at,CURRENT_TIMESTAMP),updated_at=CURRENT_TIMESTAMP WHERE id=?").run(operationId);
 audit({storeId:op.store_id,userId:user?.id,action:'MARKDOWN_LABELS_APPLIED',entityType:'DLC_MARKDOWN_OPERATION',entityId:operationId,details:{quantity:op.quantity,markdownCode:op.markdown_code}});
 return db.prepare('SELECT * FROM dlc_markdown_operations WHERE id=?').get(operationId);
}

export function registerReceiptExpiryGroups({receipt,line,user,acceptedQty,groups=[],product,department=null,family=null,unit='pièce',correctionReason=null}={}){
 const accepted=Number(acceptedQty),normalized=(groups||[]).map(g=>({expiryDate:clean(g.expiryDate).slice(0,10),quantity:Number(g.quantity),lotRef:clean(g.lotRef)||null,expiryType:clean(g.expiryType||'DLC').toUpperCase()})).filter(g=>g.expiryDate||g.quantity);
 if(accepted<=0)return[];
 if(!normalized.length)throw Object.assign(new Error('Répartition DLC/DDM obligatoire pour les unités acceptées.'),{status:409,code:'RECEIPT_EXPIRY_GROUPS_REQUIRED'});
 if(normalized.some(g=>!/^\d{4}-\d{2}-\d{2}$/.test(g.expiryDate)||!Number.isFinite(g.quantity)||g.quantity<=0))throw Object.assign(new Error("Chaque groupe doit contenir une date d'expiration et une quantité valide."),{status:400});
 const total=round(normalized.reduce((s,g)=>s+g.quantity,0),3);if(Math.abs(total-accepted)>0.001)throw Object.assign(new Error('La somme des groupes DLC/DDM doit être égale à la quantité acceptée ('+accepted+').'),{status:409,code:'RECEIPT_EXPIRY_QTY_MISMATCH',details:{accepted,total}});
 const result=[];
 for(const g of normalized){
  const sourceKey=['RECEIPT',receipt.id,line.id,g.expiryDate,g.lotRef||'NOLOT'].join('|'),existing=db.prepare('SELECT * FROM dlc_records WHERE source_key=?').get(sourceKey);
  if(existing){
   if(Math.abs(Number(existing.original_quantity??existing.quantity)-g.quantity)>0.001){
    if(!clean(correctionReason))throw Object.assign(new Error("Ce groupe d'expiration existe déjà avec une quantité différente. Motif de correction obligatoire."),{status:409,code:'RECEIPT_EXPIRY_CORRECTION_REQUIRED'});
    const prior=Number(existing.original_quantity??existing.quantity),delta=g.quantity-prior,newRemaining=Math.max(0,Number(existing.remaining_quantity??existing.quantity)+delta);
    db.prepare("UPDATE dlc_records SET quantity=?,original_quantity=?,remaining_quantity=?,lot_ref=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(g.quantity,g.quantity,newRemaining,g.lotRef,existing.id);
    audit({storeId:receipt.store_id,userId:user.id,action:'RECEIPT_EXPIRY_GROUP_CORRECTED',entityType:'DLC_RECORD',entityId:existing.id,details:{sourceKey,priorQuantity:prior,newQuantity:g.quantity,reason:clean(correctionReason)}});
   }
   result.push(db.prepare('SELECT * FROM dlc_records WHERE id=?').get(existing.id));continue;
  }
  const created=createDlcRecord({storeId:receipt.store_id,user,product,expiryDate:g.expiryDate,quantity:g.quantity,zone:'Réserve',lotRef:g.lotRef,comment:'Réception '+receipt.po_number,expiryType:g.expiryType,department,family,unit,sourceType:'RECEPTION'});
  db.prepare("UPDATE dlc_records SET source_receipt_id=?,source_receipt_line_id=?,source_key=?,source_lot_key=? WHERE id=?").run(receipt.id,line.id,sourceKey,[line.id,g.lotRef||'',g.expiryDate].join('|'),created.id);
  audit({storeId:receipt.store_id,userId:user.id,action:'RECEIPT_EXPIRY_GROUP_REGISTERED',entityType:'DLC_RECORD',entityId:created.id,details:{sourceKey,receipt:receipt.po_number,lineId:line.id,expiryDate:g.expiryDate,quantity:g.quantity,lotRef:g.lotRef}});
  result.push(db.prepare('SELECT * FROM dlc_records WHERE id=?').get(created.id));
 }
 return result;
}

function openAlert({key,storeId,dlcId=null,type,priority,title,details=null}){
 const existing=db.prepare('SELECT * FROM dlc_markdown_alerts WHERE alert_key=?').get(key);
 if(existing){db.prepare("UPDATE dlc_markdown_alerts SET status='OPEN',priority=?,title=?,details=?,last_seen_at=CURRENT_TIMESTAMP,resolved_at=NULL WHERE alert_key=?").run(priority,title,details,key);return existing.id}
 const id=uid('mdalert');db.prepare("INSERT INTO dlc_markdown_alerts(id,alert_key,store_id,dlc_id,alert_type,priority,status,title,details) VALUES(?,?,?,?,?,?,'OPEN',?,?)").run(id,key,storeId,dlcId,type,priority,title,details);return id;
}
export function runMarkdownMonitor(){
 const stores=db.prepare('SELECT id FROM stores WHERE active=1').all().map(x=>x.id),seen=new Set(),stats={stores:stores.length,opened:0,resolved:0,checkedAt:nowIso()};
 for(const storeId of stores){
  for(const rec of listMarkdownRecommendations(storeId,{includeProcessed:false})){
   if(rec.status==='EXPIRED_WITHDRAW'){
    const key='EXPIRED|'+rec.id;seen.add(key);openAlert({key,storeId,dlcId:rec.id,type:'EXPIRED',priority:'CRITICAL',title:'Produit périmé à retirer · '+rec.productName,details:'DLC '+rec.expiryDate+' · aucune impression markdown autorisée'});stats.opened++;continue;
   }
   if(rec.status==='ACTION_REQUIRED'){
    const key='ELIGIBLE|'+rec.id+'|'+rec.markdownCode;seen.add(key);openAlert({key,storeId,dlcId:rec.id,type:rec.markdownCode+'_ELIGIBLE',priority:rec.rule?.alert_priority||'HIGH',title:rec.markdownCode+' · '+rec.productName,details:rec.daysRemaining+' jour(s) restant(s) · '+rec.quantityToReview+' à vérifier physiquement'});stats.opened++;
   }else if(rec.status==='NO_MARKDOWN_RULE'&&rec.daysRemaining!==null&&rec.daysRemaining<=30){
    const key='NO_RULE|'+rec.id;seen.add(key);openAlert({key,storeId,dlcId:rec.id,type:'RULE_MISSING',priority:'MEDIUM',title:'DLC proche sans règle markdown · '+rec.productName,details:rec.daysRemaining+' jour(s) restant(s)'});stats.opened++;
   }
  }
  const failed=db.prepare("SELECT id FROM label_print_jobs WHERE store_id=? AND status='FAILED'").all(storeId);
  for(const row of failed){const key='PRINT_FAILED|'+row.id;seen.add(key);openAlert({key,storeId,type:'PRINT_FAILED',priority:'HIGH',title:"Échec d'impression étiquettes",details:'Job '+row.id+' à relancer'});stats.opened++}
 }
 const open=db.prepare("SELECT alert_key FROM dlc_markdown_alerts WHERE status='OPEN'").all();for(const row of open)if(!seen.has(row.alert_key)){db.prepare("UPDATE dlc_markdown_alerts SET status='RESOLVED',resolved_at=CURRENT_TIMESTAMP,last_seen_at=CURRENT_TIMESTAMP WHERE alert_key=?").run(row.alert_key);stats.resolved++}
 return stats;
}
export function listMarkdownAlerts(storeId=null){
 return db.prepare("SELECT * FROM dlc_markdown_alerts WHERE status='OPEN' "+(storeId?'AND store_id=? ':'')+"ORDER BY CASE priority WHEN 'CRITICAL' THEN 0 WHEN 'HIGH' THEN 1 WHEN 'MEDIUM' THEN 2 ELSE 3 END,first_seen_at").all(...(storeId?[storeId]:[]));
}
