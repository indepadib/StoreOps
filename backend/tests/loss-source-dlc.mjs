process.env.STOREOPS_DB=process.env.STOREOPS_DB||'/tmp/storeops-dlc-loss-test.db';
process.env.STOREOPS_MEDIA_DIR=process.env.STOREOPS_MEDIA_DIR||'/tmp/storeops-dlc-loss-media';
const {db}=await import('../db.mjs');
const {createDlcRecord,addDlcTreatment}=await import('../services/dlc.mjs');
const {lossRecord,createLossRecord,ensureLossPostable,approveLossRecord,markLossPosted,lossSummary}=await import('../services/loss.mjs');
function ok(v,m){if(!v)throw new Error(m)}
const PNG='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII=';
const manager=db.prepare(`SELECT * FROM users WHERE id='u-vf'`).get(),director=db.prepare(`SELECT * FROM users WHERE id='u-ops'`).get();
const today=new Date().toISOString().slice(0,10),product={ean:'3017620422003',name:'Nutella 750g',productNumber:'NUT750',category:'Épicerie',price:64.90};

let dlc=createDlcRecord({storeId:'val-fleuri',user:manager,product,expiryDate:today,quantity:2,unit:'pièce',department:'Crémerie / PLS',family:'Lait frais',lotRef:'AUTO-LOSS-1'});
let treated=addDlcTreatment({id:dlc.id,user:manager,actionType:'DESTROY',quantity:2,note:'DLC détruite',dataUrl:PNG,fileName:'pv-destruction.png',caption:'PV destruction'});
let loss=treated.generated_loss;
ok(loss&&loss.source_type==='DLC_TREATMENT'&&loss.reason_code==='EXPIRED','DLC destroy must create EXPIRED loss');
ok(Number(loss.quantity)===2&&Number(loss.total_retail_value)===129.8,'DLC generated loss value failed');
ok(Number(loss.requires_evidence)===1&&Number(loss.evidence_satisfied)===1&&!loss.incident_id,'DLC proof must satisfy loss evidence without duplicate incident');
ok(loss.external_evidence?.source==='DLC'&&loss.external_evidence?.url?.startsWith('/api/dlc-media/'),'DLC external evidence link missing');
ok(ensureLossPostable(loss.id).id===loss.id,'DLC-generated evidenced loss should be postable');
const duplicate=createLossRecord({storeId:'val-fleuri',user:manager,product,reasonCode:'EXPIRED',quantity:2,sourceType:'DLC_TREATMENT',sourceId:loss.source_id,evidenceAlreadySatisfied:true,evidenceSourceType:'DLC_TREATMENT',evidenceSourceId:loss.source_id});
ok(duplicate.id===loss.id,'DLC loss source must be idempotent');
loss=markLossPosted({id:loss.id,user:manager});ok(loss.status==='POSTED','DLC generated loss post failed');

// High-value disposal inherits the same proof but still requires director approval.
dlc=createDlcRecord({storeId:'val-fleuri',user:manager,product,expiryDate:today,quantity:8,unit:'pièce',department:'Crémerie / PLS',family:'Lait frais',lotRef:'AUTO-LOSS-2'});
treated=addDlcTreatment({id:dlc.id,user:manager,actionType:'DESTROY',quantity:8,note:'DLC détruite gros lot',dataUrl:PNG,fileName:'pv-destruction-2.png'});
loss=treated.generated_loss;ok(loss.status==='APPROVAL_REQUIRED'&&Number(loss.evidence_satisfied)===1,'high DLC loss should reuse proof and require approval');
loss=approveLossRecord({id:loss.id,user:director});ok(loss.status==='APPROVED','director approval for DLC loss failed');
loss=markLossPosted({id:loss.id,user:manager});ok(loss.status==='POSTED','approved DLC loss posting failed');

// Non-stock action must not create a loss record.
dlc=createDlcRecord({storeId:'val-fleuri',user:manager,product,expiryDate:today,quantity:3,unit:'pièce',department:'Crémerie / PLS',family:'Lait frais',lotRef:'AUTO-LOSS-3'});
treated=addDlcTreatment({id:dlc.id,user:manager,actionType:'MARKDOWN',quantity:0,note:'Démarque commerciale courte'});
ok(treated.generated_loss==null,'MARKDOWN must not generate stock loss');
const summary=lossSummary('val-fleuri',today);ok(summary.posted===2&&summary.blocking===0,'DLC loss automation summary failed');

console.log('StoreOps V1.10.2 DLC → loss source automation tests passed');
