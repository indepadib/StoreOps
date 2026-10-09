import { db,uid,audit,todayISO } from '../db.mjs';

db.exec(`
CREATE TABLE IF NOT EXISTS commercial_policies(
 id TEXT PRIMARY KEY,
 price_tolerance REAL NOT NULL DEFAULT 0.01,
 updated_by TEXT NULL REFERENCES users(id),
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS commercial_controls(
 id TEXT PRIMARY KEY,
 store_id TEXT NOT NULL REFERENCES stores(id),
 business_date TEXT NOT NULL,
 source_key TEXT NOT NULL,
 action_type TEXT NOT NULL CHECK(action_type IN ('PRICE_CHANGE','PROMO_START','PROMO_END','NEW_ITEM','VERIFY')),
 ean TEXT NOT NULL,
 product_number TEXT NULL,
 product_name TEXT NOT NULL,
 category TEXT NULL,
 old_price REAL NULL,
 expected_price REAL NULL,
 promo_label TEXT NULL,
 signage_action TEXT NOT NULL DEFAULT 'VERIFY' CHECK(signage_action IN ('INSTALL','REMOVE','VERIFY','NONE')),
 priority TEXT NOT NULL DEFAULT 'NORMAL' CHECK(priority IN ('LOW','NORMAL','HIGH','CRITICAL')),
 blocking_opening INTEGER NOT NULL DEFAULT 1,
 status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','MISMATCH','VERIFIED')),
 observed_price REAL NULL,
 signage_ok INTEGER NULL,
 execution_ok INTEGER NULL,
 note TEXT NULL,
 controlled_by TEXT NULL REFERENCES users(id),
 controlled_at TEXT NULL,
 last_issues_json TEXT NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(store_id,business_date,source_key)
);
CREATE INDEX IF NOT EXISTS ix_commercial_store_date ON commercial_controls(store_id,business_date,status,priority);
CREATE TABLE IF NOT EXISTS commercial_source_state(
 store_id TEXT NOT NULL REFERENCES stores(id),
 stable_key TEXT NOT NULL,
 fingerprint TEXT NOT NULL,
 first_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 last_changed_at TEXT NULL,
 last_action_business_date TEXT NULL,
 PRIMARY KEY(store_id,stable_key)
);
CREATE INDEX IF NOT EXISTS ix_commercial_source_state_store ON commercial_source_state(store_id,last_seen_at);
`);
db.prepare(`INSERT OR IGNORE INTO commercial_policies(id,price_tolerance) VALUES('default',0.01)`).run();
function ensureColumn(table,column,definition){const cols=db.prepare(`PRAGMA table_info(${table})`).all();if(!cols.some(x=>x.name===column))db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`)}
ensureColumn('commercial_controls','source_details_json','TEXT NULL');
ensureColumn('commercial_policies','recheck_days','INTEGER NOT NULL DEFAULT 7');
ensureColumn('commercial_source_state','last_verified_at','TEXT NULL');
ensureColumn('commercial_source_state','last_action_type','TEXT NULL');
ensureColumn('commercial_controls','event_date','TEXT NULL');

function userName(id){return id?db.prepare(`SELECT name FROM users WHERE id=?`).get(id)?.name||null:null}
export function commercialPolicy(){return db.prepare(`SELECT * FROM commercial_policies WHERE id='default'`).get()}
export function commercialConfig(){
 return{
  actionTypes:[
   {code:'PRICE_CHANGE',label:'Changement de prix'},
   {code:'PROMO_START',label:'Démarrage promotion'},
   {code:'PROMO_END',label:'Fin de promotion'},
   {code:'NEW_ITEM',label:'Nouveauté'},
   {code:'VERIFY',label:'Contrôle commercial'}
  ],
  signageActions:[
   {code:'INSTALL',label:'Installer la signalétique'},
   {code:'REMOVE',label:'Retirer la signalétique'},
   {code:'VERIFY',label:'Vérifier la signalétique'},
   {code:'NONE',label:'Aucune signalétique'}
  ],
  policy:commercialPolicy(),
  semantics:{actionWindowDays:3,verifiedRecheckDays:null,verifiedMessage:'Actions récentes uniquement : aujourd’hui et les deux jours précédents. Un contrôle validé ne revient que si Dynamics change.'}
 };
}
function hydrate(row){
 if(!row)return null;
 let issues=[],sourceDetails=null;try{issues=row.last_issues_json?JSON.parse(row.last_issues_json):[]}catch{}try{sourceDetails=row.source_details_json?JSON.parse(row.source_details_json):null}catch{}
 const incident=db.prepare(`SELECT id,status,criticality,requires_evidence FROM incidents WHERE source_type='COMMERCIAL_CONTROL' AND source_id=? ORDER BY created_at DESC LIMIT 1`).get(row.id)||null;
 return{...row,sourceDetails,controlled_by_name:userName(row.controlled_by),issues,incident};
}
function dateOnly(v){const s=String(v||'');return /^\d{4}-\d{2}-\d{2}/.test(s)?s.slice(0,10):null}
function dayDistance(from,to){const a=dateOnly(from),b=dateOnly(to);if(!a||!b)return null;return Math.round((new Date(`${b}T12:00:00Z`)-new Date(`${a}T12:00:00Z`))/86400000)}
function stableKeyFor(c){
 if(c?.stableKey)return String(c.stableKey);
 return String(c?.sourceKey||'').replace(/-\d{4}-\d{2}-\d{2}(?:-[a-z0-9]+)?$/i,'')
}
function fingerprintFor(c){
 if(c?.fingerprint)return String(c.fingerprint);
 return JSON.stringify([c?.productNumber,c?.ean,c?.expectedPrice,c?.oldPrice,String(c?.promoLabel||'').replace(/^Contrôle de rattrapage · promotion (?:récente|démarrée hier) · /,'')])
}
function canonicalFingerprint(value){try{const a=JSON.parse(value);if(Array.isArray(a)&&a.length===6){a.pop();a[4]=String(a[4]||'').replace(/^Contrôle de rattrapage · promotion (?:récente|démarrée hier) · /,'');return JSON.stringify(a)}}catch{}return value}
function shortHash(value){
 let h=2166136261;for(const ch of String(value||'')){h^=ch.charCodeAt(0);h=Math.imul(h,16777619)}return (h>>>0).toString(36)
}
const windowStart=day=>{const d=new Date(`${day}T12:00:00Z`);d.setUTCDate(d.getUTCDate()-2);return d.toISOString().slice(0,10)};
const recent=(event,day)=>event&&event>=windowStart(day)&&event<=day;
function eventDateFor(c){
 if(c.actionType==='PROMO_END'){const to=dateOnly(c.validTo||c.effectiveTo||c.sourceDetails?.validTo);if(to){const d=new Date(`${to}T12:00:00Z`);d.setUTCDate(d.getUTCDate()+1);return d.toISOString().slice(0,10)}}
 return dateOnly(c.validFrom||c.effectiveFrom||c.sourceDetails?.validFrom);
}
function materializeCommercialDeltas(storeId,businessDate,changes=[]){
 const out=[],get=db.prepare('SELECT * FROM commercial_source_state WHERE store_id=? AND stable_key=?'),history=db.prepare('SELECT * FROM commercial_controls WHERE store_id=? AND source_key LIKE ? ORDER BY business_date DESC,created_at DESC LIMIT 1');
 const upsert=db.prepare(`INSERT INTO commercial_source_state(store_id,stable_key,fingerprint,last_action_business_date,last_action_type) VALUES(?,?,?,?,?) ON CONFLICT(store_id,stable_key) DO UPDATE SET fingerprint=excluded.fingerprint,last_seen_at=CURRENT_TIMESTAMP,last_changed_at=CASE WHEN commercial_source_state.fingerprint<>excluded.fingerprint THEN CURRENT_TIMESTAMP ELSE commercial_source_state.last_changed_at END,last_action_business_date=COALESCE(excluded.last_action_business_date,commercial_source_state.last_action_business_date),last_action_type=COALESCE(excluded.last_action_type,commercial_source_state.last_action_type)`);
 for(const original of Array.isArray(changes)?changes:[]){
  let c={...original};const d365=String(c.source||'').startsWith('D365_RETAIL_PRICING'),stableKey=stableKeyFor(c),fingerprint=fingerprintFor(c);
  if(!d365||!stableKey){out.push(c);continue}
  const previous=get.get(storeId,stableKey),historical=history.get(storeId,`${stableKey}-%`);
  let details={};try{details=JSON.parse(historical?.source_details_json||'{}')}catch{}
  const changed=previous?canonicalFingerprint(previous.fingerprint)!==fingerprint:historical?(details.originalFingerprint?canonicalFingerprint(details.originalFingerprint)!==fingerprint:Number(historical.expected_price)!==Number(c.expectedPrice)||historical.ean!==c.ean):false;
  const sourceDate=eventDateFor(c),first=!previous&&!historical;
  let event=changed?businessDate:previous?.last_action_business_date||historical?.event_date||null;
  if(!changed&&previous&&!previous.last_action_type&&!historical?.event_date)event=sourceDate;
  if(first&&recent(sourceDate,businessDate))event=sourceDate;
  // A source first seen without an effective date is baselined, never a backlog.
  const type=changed?(c.deltaActionType||(c.actionType==='VERIFY'?'PROMO_START':c.actionType)):previous?.last_action_type||historical?.action_type||(c.actionType==='VERIFY'?(c.deltaActionType||'PROMO_START'):c.actionType);
  upsert.run(storeId,stableKey,fingerprint,event,event?type:null);
  if(changed)db.prepare('UPDATE commercial_source_state SET last_verified_at=NULL WHERE store_id=? AND stable_key=?').run(storeId,stableKey);
  if(!recent(event,businessDate))continue;
  if(!changed&&previous?.last_verified_at)continue;
  if(c.oldPrice==null&&historical?.expected_price!=null&&Number(historical.expected_price)!==Number(c.expectedPrice))c.oldPrice=Number(historical.expected_price);
  c={...c,actionType:type,eventDate:event,sourceKey:`${stableKey}-${event}-${shortHash(fingerprint)}`,signageAction:type==='PROMO_END'?'REMOVE':type==='PROMO_START'?'INSTALL':c.signageAction||'VERIFY',sourceDetails:{...c.sourceDetails,eventDate:event,stableKey,originalFingerprint:fingerprint}};
  if(first&&type==='PRICE_CHANGE')c.promoLabel=['Nouvel accord tarifaire détecté',c.promoLabel].filter(Boolean).join(' · ');
  if(changed)c.promoLabel=[type==='PRICE_CHANGE'?'Accord tarifaire modifié dans Dynamics':'Promotion modifiée dans Dynamics',c.promoLabel].filter(Boolean).join(' · ');
  out.push(c);
 }
 return out;
}
function isActionableChange(c){
 if(!c?.sourceKey||!c?.ean||!c?.productName)return false;
 const actionType=c.actionType||'VERIFY',priority=c.priority||'NORMAL',label=String(c.promoLabel||'');
 if(c.source==='D365_RETAIL_PRICING'&&actionType==='VERIFY'&&label.includes('le contrôle StoreOps suit le DealPrice Dynamics'))return false;
 if(c.source==='D365_RETAIL_PRICING'&&actionType==='VERIFY'&&priority!=='CRITICAL'&&c.scheduledRecheck!==true)return false;
 return true;
}
function offerIdFromSourceKey(sourceKey){
 const m=String(sourceKey||'').match(/^D365-PROMO-([^\-]+-[^\-]+)-/);
 return m?.[1]||null;
}
function aggregateOfferAnomalies(changes,businessDate){
 const out=[],groups=new Map();
 for(const c of changes){
  const offerId=c.source==='D365_RETAIL_PRICING'&&c.actionType==='VERIFY'&&c.priority==='CRITICAL'?offerIdFromSourceKey(c.sourceKey):null;
  if(!offerId){out.push(c);continue}
  if(!groups.has(offerId))groups.set(offerId,[]);
  groups.get(offerId).push(c);
 }
 for(const [offerId,rows] of groups){
  const first=rows[0],names=rows.map(x=>x.productName).filter(Boolean),cats=[...new Set(rows.map(x=>x.category).filter(Boolean))];
  const preview=names.slice(0,5).join(', ')+(names.length>5?` +${names.length-5} autre(s)`:''),baseLabel=String(first.promoLabel||'').replace(/ · ⚠️.*/,''),warning=String(first.promoLabel||'').includes('⚠️')?String(first.promoLabel).split('⚠️')[1].trim():String(first.promoLabel||'');
  out.push({
   sourceKey:`D365-OFFER-ANOMALY-${offerId}-${businessDate}`,
   actionType:'VERIFY',ean:`OFFER:${offerId}`,productNumber:null,
   productName:`Anomalie promotion ${offerId}`,
   category:cats.length===1?cats[0]:cats.length?`${cats.length} catégories`:null,
   oldPrice:null,expectedPrice:null,
   promoLabel:[baseLabel,`⚠️ ${warning}`,`${rows.length} article(s) concerné(s) : ${preview}`].filter(Boolean).join(' · '),
   signageAction:'VERIFY',priority:'CRITICAL',blockingOpening:true,storeId:first.storeId,source:'D365_RETAIL_PRICING'
  });
 }
 return out;
}
export function syncCommercialControls({storeId,businessDate=todayISO(),changes=[],preserveExisting=false}){
 const raw=Array.isArray(changes)?changes:[],deltaAware=materializeCommercialDeltas(storeId,businessDate,raw),filtered=deltaAware.filter(isActionableChange),actionable=aggregateOfferAnomalies(filtered,businessDate);
 const removed=preserveExisting?{changes:0}:db.prepare(`DELETE FROM commercial_controls WHERE store_id=? AND business_date=? AND status='PENDING' AND source_key LIKE 'D365-%'`).run(storeId,businessDate);
 const stmt=db.prepare(`INSERT INTO commercial_controls(id,store_id,business_date,source_key,action_type,ean,product_number,product_name,category,old_price,expected_price,promo_label,source_details_json,signage_action,priority,blocking_opening,event_date) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
 ON CONFLICT(store_id,business_date,source_key) DO UPDATE SET
  ean=excluded.ean,
  product_number=excluded.product_number,
  product_name=excluded.product_name,
  category=COALESCE(excluded.category,commercial_controls.category),
  old_price=excluded.old_price,
  expected_price=excluded.expected_price,
  promo_label=excluded.promo_label,
  source_details_json=excluded.source_details_json,
  signage_action=excluded.signage_action,
  priority=excluded.priority,
  blocking_opening=excluded.blocking_opening,event_date=excluded.event_date`);
 let inserted=0;
 for(const c of actionable){
  const actionType=c.actionType||'VERIFY',priority=c.priority||'NORMAL';
  const blocking=c.blockingOpening===false?0:(priority==='CRITICAL'||actionType!=='VERIFY'?1:0);
  const info=stmt.run(uid('cc'),storeId,businessDate,String(c.sourceKey),actionType,String(c.ean),c.productNumber||null,c.productName,c.category||null,c.oldPrice??null,c.expectedPrice??null,c.promoLabel||null,c.sourceDetails?JSON.stringify(c.sourceDetails):null,c.signageAction||'VERIFY',priority,blocking,c.eventDate||dateOnly(c.sourceDetails?.eventDate)||businessDate);
  inserted+=Number(info.changes||0);
 }
 return{inserted,removed:Number(removed.changes||0),preserveExisting:!!preserveExisting,rawCount:raw.length,deltaAwareCount:deltaAware.length,filteredCount:filtered.length,actionableCount:actionable.length,total:db.prepare(`SELECT COUNT(*) n FROM commercial_controls WHERE store_id=? AND business_date=?`).get(storeId,businessDate).n};
}
export function listCommercialControls(storeId,businessDate=todayISO()){
 const rows=db.prepare(`SELECT * FROM commercial_controls WHERE store_id=? AND business_date<=? AND COALESCE(event_date,business_date)>=? AND COALESCE(event_date,business_date)<=? ORDER BY business_date DESC,created_at DESC`).all(storeId,businessDate,windowStart(businessDate),businessDate),seen=new Set(),out=[];
 for(const row of rows){const key=stableKeyFor({sourceKey:row.source_key});if(seen.has(key))continue;seen.add(key);if(row.status!=='VERIFIED'){const h=hydrate(row),event=h.event_date||h.sourceDetails?.eventDate||eventDateFor({actionType:h.action_type,sourceDetails:h.sourceDetails})||h.business_date;if(recent(event,businessDate))out.push(h)}}
 return out.sort((a,b)=>['CRITICAL','HIGH','NORMAL','LOW'].indexOf(a.priority)-['CRITICAL','HIGH','NORMAL','LOW'].indexOf(b.priority));
}
export function commercialSummary(storeId,businessDate=todayISO()){
 const rows=listCommercialControls(storeId,businessDate),counts={PENDING:0,MISMATCH:0,VERIFIED:0};
 for(const r of rows)counts[r.status]=(counts[r.status]||0)+1;
 return{total:rows.length,pending:counts.PENDING||0,mismatch:counts.MISMATCH||0,verified:counts.VERIFIED||0,blocking:rows.filter(x=>x.blocking_opening&&x.status!=='VERIFIED').length,readiness:rows.length?Math.round(((counts.VERIFIED||0)/rows.length)*100):100};
}
export function commercialBlockingCount(storeId,businessDate=todayISO()){
 return listCommercialControls(storeId,businessDate).filter(r=>r.blocking_opening).length;
}
export function submitCommercialControl({id,user,observedPrice=null,signageOk=null,executionOk=null,note=''}) {
 const row=db.prepare(`SELECT * FROM commercial_controls WHERE id=?`).get(id);if(!row)throw Object.assign(new Error('Contrôle prix/promo introuvable.'),{status:404});
 const issues=[],tolerance=Number(commercialPolicy().price_tolerance||0.01);
 let observed=null;
 if(row.expected_price!=null){
  observed=Number(observedPrice);
  if(!Number.isFinite(observed)||observed<0)issues.push('Prix rayon obligatoire.');
  else if(Math.abs(observed-Number(row.expected_price))>tolerance)issues.push(`Prix rayon ${observed.toFixed(2)} DH ≠ prix attendu ${Number(row.expected_price).toFixed(2)} DH.`);
 }
 if(row.signage_action!=='NONE'&&signageOk!==true)issues.push(row.signage_action==='REMOVE'?'Ancienne signalétique promotionnelle non retirée.':row.signage_action==='INSTALL'?'Signalétique promotionnelle non installée.':'Signalétique non conforme.');
 if(executionOk!==true)issues.push('Exécution rayon non confirmée.');
 const next=issues.length?'MISMATCH':'VERIFIED';
 db.prepare(`UPDATE commercial_controls SET status=?,observed_price=?,signage_ok=?,execution_ok=?,note=?,controlled_by=?,controlled_at=CURRENT_TIMESTAMP,last_issues_json=? WHERE id=?`)
  .run(next,observed,row.signage_action==='NONE'?1:(signageOk===true?1:0),executionOk===true?1:0,note||null,user.id,issues.length?JSON.stringify(issues):null,id);
 if(!issues.length){const stableKey=stableKeyFor({sourceKey:row.source_key});if(stableKey)db.prepare(`UPDATE commercial_source_state SET last_verified_at=CURRENT_TIMESTAMP WHERE store_id=? AND stable_key=?`).run(row.store_id,stableKey)}
  audit({storeId:row.store_id,businessDate:row.business_date,userId:user.id,action:issues.length?'COMMERCIAL_MISMATCH':'COMMERCIAL_VERIFIED',entityType:'COMMERCIAL_CONTROL',entityId:id,details:{ean:row.ean,observedPrice:observed,expectedPrice:row.expected_price,signageOk,executionOk,issues}});
 return{control:hydrate(db.prepare(`SELECT * FROM commercial_controls WHERE id=?`).get(id)),issues};
}
export function updateCommercialPolicy({user,priceTolerance}){
 const t=Number(priceTolerance);if(!Number.isFinite(t)||t<0||t>1)throw Object.assign(new Error('Tolérance prix invalide (0 à 1 DH).'),{status:400});
 db.prepare(`UPDATE commercial_policies SET price_tolerance=?,updated_by=?,updated_at=CURRENT_TIMESTAMP WHERE id='default'`).run(t,user.id);
 for(const st of db.prepare(`SELECT id FROM stores WHERE active=1`).all())audit({storeId:st.id,userId:user.id,action:'COMMERCIAL_POLICY_UPDATED',entityType:'COMMERCIAL_POLICY',entityId:'default',details:{priceTolerance:t}});
 return commercialPolicy();
}
