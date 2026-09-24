import { db,uid,audit,todayISO } from '../db.mjs';

db.exec(`
CREATE TABLE IF NOT EXISTS commercial_price_batches(
 id TEXT PRIMARY KEY,
 label TEXT NOT NULL,
 effective_date TEXT NOT NULL,
 valid_to TEXT NULL,
 source_ref TEXT NULL,
 status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','CANCELLED')),
 created_by TEXT NULL REFERENCES users(id),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS commercial_price_batch_stores(
 batch_id TEXT NOT NULL REFERENCES commercial_price_batches(id) ON DELETE CASCADE,
 store_id TEXT NOT NULL REFERENCES stores(id),
 PRIMARY KEY(batch_id,store_id)
);
CREATE TABLE IF NOT EXISTS commercial_price_batch_lines(
 batch_id TEXT NOT NULL REFERENCES commercial_price_batches(id) ON DELETE CASCADE,
 product_number TEXT NOT NULL,
 product_name TEXT NOT NULL,
 expected_price REAL NOT NULL,
 unit TEXT NULL,
 sort_order INTEGER NOT NULL DEFAULT 0,
 PRIMARY KEY(batch_id,product_number)
);
CREATE INDEX IF NOT EXISTS ix_price_batches_active ON commercial_price_batches(status,effective_date,valid_to);
CREATE INDEX IF NOT EXISTS ix_price_batch_stores_store ON commercial_price_batch_stores(store_id,batch_id);
`);

const clean=v=>String(v??'').trim();
const dateOnly=v=>{const s=clean(v);return /^\d{4}-\d{2}-\d{2}/.test(s)?s.slice(0,10):null};
const finitePrice=v=>{const n=Number(v);return Number.isFinite(n)&&n>=0?n:null};

export const FLEG_20260924_BATCH=Object.freeze({
 id:'FLEG-2026-09-24',
 label:'Changement prix de vente FLEG · 24/09/2026',
 effectiveDate:'2026-09-24',
 validTo:'2026-10-08',
 sourceRef:'Direction commerciale · email "Changement prix de vente FLEG" du 23/09/2026',
 stores:['val-fleuri','trefle'],
 lines:Object.freeze([{"productNumber":"HS-003574","productName":"RAISIN BLANC AU KG","expectedPrice":17.9,"sortOrder":1},{"productNumber":"HS-003575","productName":"RAISON ROUGE AU KG","expectedPrice":16.95,"sortOrder":2},{"productNumber":"HS-003576","productName":"MELON JAUNE AU KG","expectedPrice":5.5,"sortOrder":3},{"productNumber":"HS-003577","productName":"MELON VERT AU KG","expectedPrice":5.5,"sortOrder":4},{"productNumber":"HS-003578","productName":"POMME GOLDEN AU KG","expectedPrice":39.9,"sortOrder":5},{"productNumber":"HS-003579","productName":"POMME ROUGE AU KG","expectedPrice":39.9,"sortOrder":6},{"productNumber":"HS-003580","productName":"KIWI AU KG","expectedPrice":72.95,"sortOrder":7},{"productNumber":"HS-003581","productName":"PECHE AU KG","expectedPrice":15.9,"sortOrder":8},{"productNumber":"HS-003582","productName":"MANGUE AU KG","expectedPrice":28,"sortOrder":9},{"productNumber":"HS-003583","productName":"ANANAS AU KG","expectedPrice":21,"sortOrder":10},{"productNumber":"HS-003584","productName":"BANANE AU KG","expectedPrice":21.95,"sortOrder":11},{"productNumber":"HS-003585","productName":"AVOCAT AU KG","expectedPrice":60,"sortOrder":12},{"productNumber":"HS-003586","productName":"ORANGE À JUS AU KG","expectedPrice":8.95,"sortOrder":13},{"productNumber":"HS-003587","productName":"CLÉMENTINE AU KG","expectedPrice":12.95,"sortOrder":14},{"productNumber":"HS-003588","productName":"CITRON JAUNE AU KG","expectedPrice":17,"sortOrder":15},{"productNumber":"HS-003589","productName":"CITRON VERT AU KG","expectedPrice":17,"sortOrder":16},{"productNumber":"HS-003590","productName":"POIRE AU KG","expectedPrice":33.9,"sortOrder":17},{"productNumber":"HS-003591","productName":"FRAMBOISE BARQUETTE","expectedPrice":25.9,"sortOrder":18},{"productNumber":"HS-003593","productName":"MYRTILLE BARQUETTE","expectedPrice":25.9,"sortOrder":19},{"productNumber":"HS-003594","productName":"MURES BARQUETTE","expectedPrice":25.9,"sortOrder":20},{"productNumber":"HS-003595","productName":"TOMATE RONDE AU KG","expectedPrice":7.9,"sortOrder":21},{"productNumber":"HS-003596","productName":"TOMATE CERISE AU KG","expectedPrice":15,"sortOrder":22},{"productNumber":"HS-003597","productName":"TOMATE CERISE EN BARQUETTE","expectedPrice":10.9,"sortOrder":23},{"productNumber":"HS-003598","productName":"POMME DE TERRE BLANCHE AU KG","expectedPrice":9.5,"sortOrder":24},{"productNumber":"HS-003599","productName":"POMME DE TERRE ROUGE AU KG","expectedPrice":9.5,"sortOrder":25},{"productNumber":"HS-003600","productName":"PATATE DOUCE AU KG","expectedPrice":13.95,"sortOrder":26},{"productNumber":"HS-003601","productName":"CAROTTE AU KG","expectedPrice":7.9,"sortOrder":27},{"productNumber":"HS-003602","productName":"COURGETTE BLANCHE AU KG","expectedPrice":13.95,"sortOrder":28},{"productNumber":"HS-003603","productName":"COURGE ORANGE AU KG","expectedPrice":12,"sortOrder":29},{"productNumber":"HS-003604","productName":"OIGNON ROUGE AU KG","expectedPrice":7.95,"sortOrder":30},{"productNumber":"HS-003605","productName":"OIGNON BLANC AU KG","expectedPrice":6.9,"sortOrder":31},{"productNumber":"HS-003606","productName":"NAVET LONG AU KG","expectedPrice":15,"sortOrder":32},{"productNumber":"HS-003607","productName":"NAVET ROND AU KG","expectedPrice":15.95,"sortOrder":33},{"productNumber":"HS-003608","productName":"POIVRON ROUGE AU KG","expectedPrice":23.95,"sortOrder":34},{"productNumber":"HS-003609","productName":"POIVRON VERT AU KG","expectedPrice":11,"sortOrder":35},{"productNumber":"HS-003610","productName":"POIVRON JAUNE AU KG","expectedPrice":21.95,"sortOrder":36},{"productNumber":"HS-003611","productName":"CHOUX BLANC AU KG","expectedPrice":8.5,"sortOrder":37},{"productNumber":"HS-003612","productName":"CONCOMBRE AU KG","expectedPrice":9.9,"sortOrder":38},{"productNumber":"HS-003613","productName":"AUBERGINE AU KG","expectedPrice":8,"sortOrder":39},{"productNumber":"HS-003614","productName":"HARICOT VERT AU KG","expectedPrice":25.95,"sortOrder":40},{"productNumber":"HS-003615","productName":"BETTERAVE AU KG","expectedPrice":9.95,"sortOrder":41},{"productNumber":"HS-003616","productName":"POIREAU AU KG","expectedPrice":25.95,"sortOrder":42},{"productNumber":"HS-003617","productName":"BROCOLIS AU KG","expectedPrice":34,"sortOrder":43},{"productNumber":"HS-003618","productName":"FENOUILLE AU KG","expectedPrice":16,"sortOrder":44},{"productNumber":"HS-003619","productName":"PETIT POIS AU KG","expectedPrice":23.95,"sortOrder":45},{"productNumber":"HS-003621","productName":"PIMENT FORT AU KG","expectedPrice":17.95,"sortOrder":46},{"productNumber":"HS-003622","productName":"CHAMPIGNON AU KG","expectedPrice":70,"sortOrder":47},{"productNumber":"HS-003623","productName":"GINGEMBRE FRAIS AU KG","expectedPrice":64.5,"sortOrder":48},{"productNumber":"HS-003624","productName":"AIL 250G","expectedPrice":50,"sortOrder":49},{"productNumber":"HS-003625","productName":"SALADE ICEBERG À LA PIECE","expectedPrice":8.9,"sortOrder":50},{"productNumber":"HS-003626","productName":"LAITUE VERTE À LA PIÉCE","expectedPrice":7.5,"sortOrder":51},{"productNumber":"HS-003627","productName":"SALADE FEUILLE DE CHÊNE VERTE PIECE","expectedPrice":7.5,"sortOrder":52},{"productNumber":"HS-003628","productName":"BASILIC BARQUETTE","expectedPrice":7.5,"sortOrder":53},{"productNumber":"HS-003629","productName":"POUSSE D'ÉPINARD BARQUETTE","expectedPrice":18,"sortOrder":54},{"productNumber":"HS-003630","productName":"MENTHE EN BOTTE","expectedPrice":3.9,"sortOrder":55},{"productNumber":"HS-003631","productName":"CORIANDRE EN BOTTE","expectedPrice":3.9,"sortOrder":56},{"productNumber":"HS-003632","productName":"PERSIL EN BOTTE","expectedPrice":3.5,"sortOrder":57},{"productNumber":"HS-003633","productName":"ROQUETTE EN BARQUETTE","expectedPrice":18,"sortOrder":58},{"productNumber":"HS-003634","productName":"ANETH EN BARQUETTE","expectedPrice":8,"sortOrder":59},{"productNumber":"HS-003635","productName":"CÉLERIE EN BOTTE","expectedPrice":10,"sortOrder":60},{"productNumber":"HS-003636","productName":"CIBOULETTE EN BARQUETTE","expectedPrice":12.5,"sortOrder":61},{"productNumber":"HS-003637","productName":"ROMARIN EN BARQUETTE","expectedPrice":7.95,"sortOrder":62},{"productNumber":"HS-003638","productName":"THYM EN BARQUETTE","expectedPrice":9,"sortOrder":63},{"productNumber":"HS-006583","productName":"Pomme rouge local au KG","expectedPrice":21.9,"sortOrder":64},{"productNumber":"HS-006594","productName":"cerise au kg","expectedPrice":80,"sortOrder":65},{"productNumber":"HS-006595","productName":"figue vert au kg","expectedPrice":50,"sortOrder":66},{"productNumber":"HS-006596","productName":"figue noir au kg","expectedPrice":50,"sortOrder":67},{"productNumber":"HS-006692","productName":"Ail au kg","expectedPrice":81.95,"sortOrder":68},{"productNumber":"HS-006719","productName":"Orange transformé au KG","expectedPrice":8.95,"sortOrder":69}])
});

function normalizeBatch(input={}){
 const id=clean(input.id),label=clean(input.label),effectiveDate=dateOnly(input.effectiveDate),validTo=dateOnly(input.validTo),sourceRef=clean(input.sourceRef)||null;
 const stores=[...new Set((Array.isArray(input.stores)?input.stores:[]).map(clean).filter(Boolean))];
 const lines=(Array.isArray(input.lines)?input.lines:[]).map((row,index)=>({
  productNumber:clean(row.productNumber),
  productName:clean(row.productName)||clean(row.productNumber),
  expectedPrice:finitePrice(row.expectedPrice),
  unit:clean(row.unit)||null,
  sortOrder:Number.isFinite(Number(row.sortOrder))?Number(row.sortOrder):index+1
 })).filter(x=>x.productNumber&&x.expectedPrice!==null);
 if(!id||!label||!effectiveDate)throw Object.assign(new Error('Campagne prix invalide : id, libellé et date d’effet obligatoires.'),{status:400,code:'PRICE_BATCH_INVALID'});
 if(validTo&&validTo<effectiveDate)throw Object.assign(new Error('La date de fin ne peut pas précéder la date d’effet.'),{status:400,code:'PRICE_BATCH_DATE_INVALID'});
 if(!stores.length)throw Object.assign(new Error('Aucun magasin cible pour la campagne prix.'),{status:400,code:'PRICE_BATCH_NO_STORES'});
 if(!lines.length)throw Object.assign(new Error('Aucune ligne valide dans la campagne prix.'),{status:400,code:'PRICE_BATCH_NO_LINES'});
 return{id,label,effectiveDate,validTo,sourceRef,stores,lines}
}

export function upsertCommercialPriceBatch(input,{user=null,auditChanges=true}={}){
 const batch=normalizeBatch(input);
 const tx=db.transaction(()=>{
  db.prepare(`INSERT INTO commercial_price_batches(id,label,effective_date,valid_to,source_ref,status,created_by,created_at,updated_at)
   VALUES(?,?,?,?,?,'ACTIVE',?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
   ON CONFLICT(id) DO UPDATE SET label=excluded.label,effective_date=excluded.effective_date,valid_to=excluded.valid_to,source_ref=excluded.source_ref,status='ACTIVE',updated_at=CURRENT_TIMESTAMP`)
   .run(batch.id,batch.label,batch.effectiveDate,batch.validTo,batch.sourceRef,user?.id||null);
  db.prepare(`DELETE FROM commercial_price_batch_stores WHERE batch_id=?`).run(batch.id);
  db.prepare(`DELETE FROM commercial_price_batch_lines WHERE batch_id=?`).run(batch.id);
  const addStore=db.prepare(`INSERT INTO commercial_price_batch_stores(batch_id,store_id) VALUES(?,?)`);
  for(const storeId of batch.stores)addStore.run(batch.id,storeId);
  const addLine=db.prepare(`INSERT INTO commercial_price_batch_lines(batch_id,product_number,product_name,expected_price,unit,sort_order) VALUES(?,?,?,?,?,?)`);
  for(const row of batch.lines)addLine.run(batch.id,row.productNumber,row.productName,row.expectedPrice,row.unit,row.sortOrder);
 });
 tx();
 if(auditChanges&&user){
  for(const storeId of batch.stores)audit({storeId,userId:user.id,action:'COMMERCIAL_PRICE_BATCH_UPSERTED',entityType:'COMMERCIAL_PRICE_BATCH',entityId:batch.id,details:{label:batch.label,effectiveDate:batch.effectiveDate,validTo:batch.validTo,lines:batch.lines.length,sourceRef:batch.sourceRef}})
 }
 return commercialPriceBatch(batch.id)
}

export function commercialPriceBatch(id){
 const batch=db.prepare(`SELECT * FROM commercial_price_batches WHERE id=?`).get(clean(id));if(!batch)return null;
 const stores=db.prepare(`SELECT store_id FROM commercial_price_batch_stores WHERE batch_id=? ORDER BY store_id`).all(batch.id).map(x=>x.store_id);
 const lines=db.prepare(`SELECT product_number,product_name,expected_price,unit,sort_order FROM commercial_price_batch_lines WHERE batch_id=? ORDER BY sort_order,product_number`).all(batch.id);
 return{...batch,stores,lines}
}

export function listCommercialPriceBatches(){
 return db.prepare(`SELECT b.*,COUNT(DISTINCT l.product_number) line_count,COUNT(DISTINCT s.store_id) store_count
  FROM commercial_price_batches b
  LEFT JOIN commercial_price_batch_lines l ON l.batch_id=b.id
  LEFT JOIN commercial_price_batch_stores s ON s.batch_id=b.id
  GROUP BY b.id ORDER BY b.effective_date DESC,b.created_at DESC`).all()
}

export function cancelCommercialPriceBatch(id,{user=null}={}){
 const batch=commercialPriceBatch(id);if(!batch)throw Object.assign(new Error('Campagne prix introuvable.'),{status:404,code:'PRICE_BATCH_NOT_FOUND'});
 db.prepare(`UPDATE commercial_price_batches SET status='CANCELLED',updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(batch.id);
 if(user)for(const storeId of batch.stores)audit({storeId,userId:user.id,action:'COMMERCIAL_PRICE_BATCH_CANCELLED',entityType:'COMMERCIAL_PRICE_BATCH',entityId:batch.id,details:{label:batch.label}});
 return commercialPriceBatch(batch.id)
}

export function getCommercialPriceBatchChanges(storeId,businessDate=todayISO()){
 const day=dateOnly(businessDate)||todayISO(),id=clean(storeId);
 const rows=db.prepare(`SELECT b.id batch_id,b.label,b.effective_date,b.valid_to,b.source_ref,l.product_number,l.product_name,l.expected_price,l.unit,l.sort_order
  FROM commercial_price_batches b
  JOIN commercial_price_batch_stores s ON s.batch_id=b.id AND s.store_id=?
  JOIN commercial_price_batch_lines l ON l.batch_id=b.id
  WHERE b.status='ACTIVE' AND b.effective_date<=? AND (b.valid_to IS NULL OR b.valid_to>=?)
  ORDER BY b.effective_date,l.sort_order,l.product_number`).all(id,day,day);
 const verified=db.prepare(`SELECT 1 FROM commercial_controls WHERE store_id=? AND source_key=? AND status='VERIFIED' LIMIT 1`);
 const verifiedEquivalent=db.prepare(`SELECT 1 FROM commercial_controls WHERE store_id=? AND product_number=? AND action_type='PRICE_CHANGE' AND status='VERIFIED' AND business_date>=? AND expected_price IS NOT NULL AND ABS(expected_price-?)<=0.01 LIMIT 1`);
 const changes=[];
 for(const row of rows){
  const sourceKey=`PRICE-BATCH:${row.batch_id}:${row.product_number}`;
  if(verified.get(id,sourceKey)||verifiedEquivalent.get(id,row.product_number,row.effective_date,Number(row.expected_price)))continue;
  changes.push({
   sourceKey,stableKey:sourceKey,
   actionType:'PRICE_CHANGE',ean:`ITEM:${row.product_number}`,productNumber:row.product_number,productName:row.product_name,category:'Fruits & Légumes',
   oldPrice:null,expectedPrice:Number(row.expected_price),
   promoLabel:`${row.label} · nouveau prix ${Number(row.expected_price).toFixed(2)} DH`,
   sourceDetails:{type:'CENTRAL_PRICE_BATCH',batchId:row.batch_id,label:row.label,sourceRef:row.source_ref,effectiveDate:row.effective_date,validTo:row.valid_to,unit:row.unit||null},
   signageAction:'VERIFY',priority:'HIGH',blockingOpening:true,storeId:id,
   source:'STOREOPS_PRICE_BATCH',effectiveFrom:row.effective_date,effectiveTo:row.valid_to||null,priceSource:'CENTRAL_PRICE_BATCH'
  })
 }
 return{changes,diagnostics:{mode:'STOREOPS',day,batches:[...new Set(rows.map(x=>x.batch_id))],activeLines:rows.length,pendingLines:changes.length}}
}

export function seedOperationalPriceBatches(){
 if(!db.prepare(`SELECT 1 FROM commercial_price_batches WHERE id=?`).get(FLEG_20260924_BATCH.id)){
  upsertCommercialPriceBatch(FLEG_20260924_BATCH,{user:null,auditChanges:false});
  return{seeded:true,id:FLEG_20260924_BATCH.id,lines:FLEG_20260924_BATCH.lines.length}
 }
 return{seeded:false,id:FLEG_20260924_BATCH.id,lines:FLEG_20260924_BATCH.lines.length}
}

seedOperationalPriceBatches();
