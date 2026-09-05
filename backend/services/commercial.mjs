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
`);
db.prepare(`INSERT OR IGNORE INTO commercial_policies(id,price_tolerance) VALUES('default',0.01)`).run();

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
  policy:commercialPolicy()
 };
}
function hydrate(row){
 if(!row)return null;
 let issues=[];try{issues=row.last_issues_json?JSON.parse(row.last_issues_json):[]}catch{}
 const incident=db.prepare(`SELECT id,status,criticality,requires_evidence FROM incidents WHERE source_type='COMMERCIAL_CONTROL' AND source_id=? ORDER BY created_at DESC LIMIT 1`).get(row.id)||null;
 return{...row,controlled_by_name:userName(row.controlled_by),issues,incident};
}
function isActionableChange(c){
 if(!c?.sourceKey||!c?.ean||!c?.productName)return false;
 const actionType=c.actionType||'VERIFY',priority=c.priority||'NORMAL',label=String(c.promoLabel||'');
 if(c.source==='D365_RETAIL_PRICING'&&actionType==='VERIFY'&&label.includes('le contrôle StoreOps suit le DealPrice Dynamics'))return false;
 if(c.source==='D365_RETAIL_PRICING'&&actionType==='VERIFY'&&priority!=='CRITICAL')return false;
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
export function syncCommercialControls({storeId,businessDate=todayISO(),changes=[]}){
 const raw=Array.isArray(changes)?changes:[],filtered=raw.filter(isActionableChange),actionable=aggregateOfferAnomalies(filtered,businessDate);
 const removed=db.prepare(`DELETE FROM commercial_controls WHERE store_id=? AND business_date=? AND status='PENDING' AND source_key LIKE 'D365-%'`).run(storeId,businessDate);
 const stmt=db.prepare(`INSERT OR IGNORE INTO commercial_controls(id,store_id,business_date,source_key,action_type,ean,product_number,product_name,category,old_price,expected_price,promo_label,signage_action,priority,blocking_opening) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
 let inserted=0;
 for(const c of actionable){
  const actionType=c.actionType||'VERIFY',priority=c.priority||'NORMAL';
  const blocking=c.blockingOpening===false?0:(priority==='CRITICAL'||actionType!=='VERIFY'?1:0);
  const info=stmt.run(uid('cc'),storeId,businessDate,String(c.sourceKey),actionType,String(c.ean),c.productNumber||null,c.productName,c.category||null,c.oldPrice??null,c.expectedPrice??null,c.promoLabel||null,c.signageAction||'VERIFY',priority,blocking);
  inserted+=Number(info.changes||0);
 }
 return{inserted,removed:Number(removed.changes||0),rawCount:raw.length,filteredCount:filtered.length,actionableCount:actionable.length,total:db.prepare(`SELECT COUNT(*) n FROM commercial_controls WHERE store_id=? AND business_date=?`).get(storeId,businessDate).n};
}
export function listCommercialControls(storeId,businessDate=todayISO()){
 return db.prepare(`SELECT * FROM commercial_controls WHERE store_id=? AND business_date=? ORDER BY CASE priority WHEN 'CRITICAL' THEN 0 WHEN 'HIGH' THEN 1 WHEN 'NORMAL' THEN 2 ELSE 3 END, created_at`).all(storeId,businessDate).map(hydrate);
}
export function commercialSummary(storeId,businessDate=todayISO()){
 const rows=listCommercialControls(storeId,businessDate),counts={PENDING:0,MISMATCH:0,VERIFIED:0};
 for(const r of rows)counts[r.status]=(counts[r.status]||0)+1;
 return{total:rows.length,pending:counts.PENDING||0,mismatch:counts.MISMATCH||0,verified:counts.VERIFIED||0,blocking:rows.filter(x=>x.blocking_opening&&x.status!=='VERIFIED').length,readiness:rows.length?Math.round(((counts.VERIFIED||0)/rows.length)*100):100};
}
export function commercialBlockingCount(storeId,businessDate=todayISO()){
 return db.prepare(`SELECT COUNT(*) n FROM commercial_controls WHERE store_id=? AND business_date=? AND blocking_opening=1 AND status!='VERIFIED'`).get(storeId,businessDate).n;
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
 audit({storeId:row.store_id,businessDate:row.business_date,userId:user.id,action:issues.length?'COMMERCIAL_MISMATCH':'COMMERCIAL_VERIFIED',entityType:'COMMERCIAL_CONTROL',entityId:id,details:{ean:row.ean,observedPrice:observed,expectedPrice:row.expected_price,signageOk,executionOk,issues}});
 return{control:hydrate(db.prepare(`SELECT * FROM commercial_controls WHERE id=?`).get(id)),issues};
}
export function updateCommercialPolicy({user,priceTolerance}){
 const t=Number(priceTolerance);if(!Number.isFinite(t)||t<0||t>1)throw Object.assign(new Error('Tolérance prix invalide (0 à 1 DH).'),{status:400});
 db.prepare(`UPDATE commercial_policies SET price_tolerance=?,updated_by=?,updated_at=CURRENT_TIMESTAMP WHERE id='default'`).run(t,user.id);
 for(const st of db.prepare(`SELECT id FROM stores WHERE active=1`).all())audit({storeId:st.id,userId:user.id,action:'COMMERCIAL_POLICY_UPDATED',entityType:'COMMERCIAL_POLICY',entityId:'default',details:{priceTolerance:t}});
 return commercialPolicy();
}
