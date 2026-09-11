import {db,uid,audit,todayISO} from '../db.mjs';
import {buildItemAssistant} from './item-assistant.mjs';

const clean=v=>String(v??'').trim();
const positive=v=>{const n=Number(v);return Number.isFinite(n)&&n>0?n:null};
const parse=j=>{try{return JSON.parse(j||'{}')}catch{return{}}};

db.exec(`
CREATE TABLE IF NOT EXISTS replenishment_requests(
 id TEXT PRIMARY KEY,
 store_id TEXT NOT NULL REFERENCES stores(id),
 business_date TEXT NOT NULL,
 ean TEXT NOT NULL,
 product_number TEXT NOT NULL,
 product_name TEXT NOT NULL,
 unit TEXT NULL,
 requested_qty REAL NOT NULL CHECK(requested_qty>0),
 received_qty REAL NOT NULL DEFAULT 0 CHECK(received_qty>=0),
 source_warehouse_id TEXT NULL,
 status TEXT NOT NULL DEFAULT 'REQUESTED' CHECK(status IN ('REQUESTED','APPROVED','SENT','PARTIAL_RECEIVED','RECEIVED','REJECTED','CANCELLED')),
 recommendation_snapshot_json TEXT NOT NULL,
 policy_snapshot_json TEXT NOT NULL,
 context_snapshot_json TEXT NOT NULL,
 override_reason TEXT NULL,
 external_reference TEXT NULL,
 requested_by TEXT NOT NULL REFERENCES users(id),
 requested_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 approved_by TEXT NULL REFERENCES users(id),
 approved_at TEXT NULL,
 sent_by TEXT NULL REFERENCES users(id),
 sent_at TEXT NULL,
 received_by TEXT NULL REFERENCES users(id),
 received_at TEXT NULL,
 closed_by TEXT NULL REFERENCES users(id),
 closed_at TEXT NULL,
 note TEXT NULL
);
CREATE TABLE IF NOT EXISTS replenishment_request_events(
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 request_id TEXT NOT NULL REFERENCES replenishment_requests(id) ON DELETE CASCADE,
 event_type TEXT NOT NULL,
 from_status TEXT NULL,
 to_status TEXT NOT NULL,
 user_id TEXT NULL REFERENCES users(id),
 details_json TEXT NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS ix_replenishment_requests_store_status ON replenishment_requests(store_id,status,requested_at);
CREATE UNIQUE INDEX IF NOT EXISTS ux_replenishment_open_item ON replenishment_requests(store_id,product_number) WHERE status IN ('REQUESTED','APPROVED','SENT','PARTIAL_RECEIVED');
`);

function row(r){if(!r)return null;return{...r,recommendationSnapshot:parse(r.recommendation_snapshot_json),policySnapshot:parse(r.policy_snapshot_json),contextSnapshot:parse(r.context_snapshot_json),remainingQty:Math.max(0,Number(r.requested_qty)-Number(r.received_qty||0))}}
function event(requestId,eventType,fromStatus,toStatus,user,details={}){db.prepare(`INSERT INTO replenishment_request_events(request_id,event_type,from_status,to_status,user_id,details_json) VALUES(?,?,?,?,?,?)`).run(requestId,eventType,fromStatus||null,toStatus,user?.id||null,JSON.stringify(details||{}))}
function getRaw(id){return db.prepare(`SELECT r.*,u.name requested_by_name,a.name approved_by_name,s.name sent_by_name,rv.name received_by_name FROM replenishment_requests r LEFT JOIN users u ON u.id=r.requested_by LEFT JOIN users a ON a.id=r.approved_by LEFT JOIN users s ON s.id=r.sent_by LEFT JOIN users rv ON rv.id=r.received_by WHERE r.id=?`).get(id)}
export function replenishmentRequest(id){const r=row(getRaw(id));if(!r)return null;r.events=db.prepare(`SELECT e.*,u.name user_name FROM replenishment_request_events e LEFT JOIN users u ON u.id=e.user_id WHERE e.request_id=? ORDER BY e.id`).all(id).map(x=>({...x,details:parse(x.details_json)}));return r}
export function listReplenishmentRequests({storeId=null,status=null,limit=200}={}){const where=[],args=[];if(storeId){where.push('r.store_id=?');args.push(storeId)}if(status){where.push('r.status=?');args.push(clean(status).toUpperCase())}args.push(Math.max(1,Math.min(1000,Number(limit)||200)));return db.prepare(`SELECT r.*,u.name requested_by_name,a.name approved_by_name,s.name sent_by_name,rv.name received_by_name FROM replenishment_requests r LEFT JOIN users u ON u.id=r.requested_by LEFT JOIN users a ON a.id=r.approved_by LEFT JOIN users s ON s.id=r.sent_by LEFT JOIN users rv ON rv.id=r.received_by ${where.length?'WHERE '+where.join(' AND '):''} ORDER BY r.requested_at DESC LIMIT ?`).all(...args).map(row)}

/**
 * Creates a request from a context already trusted by the backend. The public API never accepts this
 * context from the browser; createReplenishmentRequest always recalculates it server-side first.
 */
export function createReplenishmentRequestFromContext({storeId,context,user,quantity=null,overrideReason='',businessDate=null}={}){
 const repl=context?.replenishment||{};
 if(!storeId||!user?.id||!context?.item?.productNumber||!context?.ean)throw Object.assign(new Error('Contexte de demande incomplet.'),{status:400,code:'REPLENISHMENT_CONTEXT_INVALID'});
 if(context.merchandising?.assortment?.status!=='ASSORTED')throw Object.assign(new Error('Demande refusée : article hors assortiment ou assortiment non fiable.'),{status:409,code:'REPLENISHMENT_NOT_ASSORTED'});
 if(!['REPLENISH','PARTIAL'].includes(repl.decision))throw Object.assign(new Error(`Aucune demande automatique autorisée pour la décision ${repl.decision||'UNKNOWN'}.`),{status:409,code:'REPLENISHMENT_NOT_RECOMMENDED',details:{decision:repl.decision,reason:repl.reason}});
 const recommended=positive(repl.actionQty),manual=quantity===null||quantity===undefined||quantity===''?null:positive(quantity);if(!recommended)throw Object.assign(new Error('Quantité recommandée indisponible.'),{status:409});
 if(quantity!==null&&quantity!==undefined&&quantity!==''&&manual===null)throw Object.assign(new Error('Quantité demandée invalide.'),{status:400});
 const requested=manual??recommended,reason=clean(overrideReason);if(manual!==null&&Math.abs(manual-recommended)>1e-9&&!reason)throw Object.assign(new Error('Un motif est obligatoire pour modifier la quantité recommandée.'),{status:400,code:'REPLENISHMENT_OVERRIDE_REASON_REQUIRED'});
 const existing=db.prepare(`SELECT id,status FROM replenishment_requests WHERE store_id=? AND product_number=? AND status IN ('REQUESTED','APPROVED','SENT','PARTIAL_RECEIVED')`).get(storeId,context.item.productNumber);if(existing)throw Object.assign(new Error(`Une demande active existe déjà pour cet article (${existing.status}).`),{status:409,code:'REPLENISHMENT_REQUEST_EXISTS',details:{requestId:existing.id,status:existing.status}});
 const id=uid('rreq'),date=context.businessDate||businessDate||todayISO(),recommendation={decision:repl.decision,recommendedQty:repl.recommendedQty,actionQty:repl.actionQty,reason:repl.reason,metrics:repl.metrics,salesVelocity:repl.salesVelocity,appliedRules:repl.appliedRules},policy={policy:repl.policy,source:repl.policySource,configuredPromoFactor:repl.configuredPromoFactor,promotionFactorApplied:repl.promotionFactorApplied},snapshot={storeStock:context.storeStock,supplyStock:context.supplyStock,merchandising:context.merchandising,pricing:context.pricing};
 db.prepare(`INSERT INTO replenishment_requests(id,store_id,business_date,ean,product_number,product_name,unit,requested_qty,source_warehouse_id,recommendation_snapshot_json,policy_snapshot_json,context_snapshot_json,override_reason,requested_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(id,storeId,date,context.ean,context.item.productNumber,context.item.name,context.item.unit||null,requested,context.supplyStock?.warehouseId||null,JSON.stringify(recommendation),JSON.stringify(policy),JSON.stringify(snapshot),reason||null,user.id);
 event(id,'REQUEST_CREATED',null,'REQUESTED',user,{requestedQty:requested,recommendedQty:recommended,overrideReason:reason||null});audit({storeId,businessDate:date,userId:user.id,action:'REPLENISHMENT_REQUESTED',entityType:'REPLENISHMENT_REQUEST',entityId:id,details:{productNumber:context.item.productNumber,ean:context.ean,requestedQty:requested,warehouseId:context.supplyStock?.warehouseId||null}});return replenishmentRequest(id)
}

export async function createReplenishmentRequest({storeId,ean,user,quantity=null,overrideReason='',businessDate=null}={}){
 const context=await buildItemAssistant({storeId,ean,businessDate:businessDate||undefined});
 return createReplenishmentRequestFromContext({storeId,context,user,quantity,overrideReason,businessDate})
}

export function transitionReplenishmentRequest({id,user,action,note='',externalReference='',receivedQty=null}={}){
 const current=replenishmentRequest(id);if(!current)throw Object.assign(new Error('Demande de réappro introuvable.'),{status:404});const a=clean(action).toUpperCase(),from=current.status;let to=from,details={note:clean(note)||null};
 const director=user?.role==='ops_director',manager=user?.role==='store_manager'&&user?.store_id===current.store_id;
 if(a==='APPROVE'){if(!director||from!=='REQUESTED')throw Object.assign(new Error('Seule la Direction peut approuver une demande en attente.'),{status:409});to='APPROVED';db.prepare(`UPDATE replenishment_requests SET status=?,approved_by=?,approved_at=CURRENT_TIMESTAMP,note=COALESCE(?,note) WHERE id=?`).run(to,user.id,clean(note)||null,id)}
 else if(a==='REJECT'){if(!director||from!=='REQUESTED')throw Object.assign(new Error('Seule la Direction peut refuser une demande en attente.'),{status:409});to='REJECTED';db.prepare(`UPDATE replenishment_requests SET status=?,closed_by=?,closed_at=CURRENT_TIMESTAMP,note=COALESCE(?,note) WHERE id=?`).run(to,user.id,clean(note)||null,id)}
 else if(a==='SEND'){const ref=clean(externalReference);if(!director||from!=='APPROVED')throw Object.assign(new Error('La demande doit être approuvée avant envoi.'),{status:409});if(!ref)throw Object.assign(new Error('Référence Dynamics/ERP obligatoire pour marquer la demande envoyée.'),{status:400,code:'REPLENISHMENT_EXTERNAL_REF_REQUIRED'});to='SENT';details.externalReference=ref;db.prepare(`UPDATE replenishment_requests SET status=?,external_reference=?,sent_by=?,sent_at=CURRENT_TIMESTAMP,note=COALESCE(?,note) WHERE id=?`).run(to,ref,user.id,clean(note)||null,id)}
 else if(a==='RECEIVE'){if(!director&&!manager)throw Object.assign(new Error('Réception réservée au Responsable du magasin ou à la Direction.'),{status:403});if(!['SENT','PARTIAL_RECEIVED'].includes(from))throw Object.assign(new Error('La demande doit être envoyée avant réception.'),{status:409});const q=positive(receivedQty);if(!q)throw Object.assign(new Error('Quantité reçue obligatoire.'),{status:400});const remaining=Math.max(0,Number(current.requested_qty)-Number(current.received_qty||0));if(q>remaining+1e-9)throw Object.assign(new Error(`Quantité reçue supérieure au reliquat (${remaining}).`),{status:400});const total=Number(current.received_qty||0)+q;to=total+1e-9>=Number(current.requested_qty)?'RECEIVED':'PARTIAL_RECEIVED';details.receivedQty=q;details.totalReceived=total;db.prepare(`UPDATE replenishment_requests SET status=?,received_qty=?,received_by=?,received_at=CASE WHEN ?='RECEIVED' THEN CURRENT_TIMESTAMP ELSE received_at END,closed_by=CASE WHEN ?='RECEIVED' THEN ? ELSE closed_by END,closed_at=CASE WHEN ?='RECEIVED' THEN CURRENT_TIMESTAMP ELSE closed_at END,note=COALESCE(?,note) WHERE id=?`).run(to,total,user.id,to,to,user.id,to,clean(note)||null,id)}
 else if(a==='CANCEL'){if(!director&&!manager)throw Object.assign(new Error('Annulation non autorisée.'),{status:403});if(!['REQUESTED','APPROVED'].includes(from))throw Object.assign(new Error('Une demande envoyée ne peut plus être annulée dans StoreOps.'),{status:409});to='CANCELLED';db.prepare(`UPDATE replenishment_requests SET status=?,closed_by=?,closed_at=CURRENT_TIMESTAMP,note=COALESCE(?,note) WHERE id=?`).run(to,user.id,clean(note)||null,id)}
 else throw Object.assign(new Error('Transition de demande inconnue.'),{status:400});
 event(id,a,from,to,user,details);audit({storeId:current.store_id,businessDate:current.business_date,userId:user.id,action:`REPLENISHMENT_${to}`,entityType:'REPLENISHMENT_REQUEST',entityId:id,details:{from,to,...details}});return replenishmentRequest(id)
}
